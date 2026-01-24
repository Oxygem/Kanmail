package emails

import (
	"context"
	"errors"
	"io"
	"time"

	"github.com/rs/zerolog"
	"go.mau.fi/util/exhttp"

	"github.com/oxygem/kanmail/internal/constants"
)

// A pool of lazily loaded connections that can be retrieved for exclusive access within the current
// goroutine. Safe to call the pool from multiple goroutines.
type connection interface {
	Close() error
}

type ConnectionPool[T connection] struct {
	disabled       bool
	pool           chan T
	priorityPool   chan T
	backgroundPool chan T
	connections    []T
	retryLimit     int
}

type ConnectionPoolOptions struct {
	Connections,
	PriorityConnections,
	BackgroundConnections,
	NetworkErrRetries int
}

func NewConnectionPool[T connection](
	options ConnectionPoolOptions,
	makeConnection func() T,
) *ConnectionPool[T] {
	cpool := ConnectionPool[T]{
		pool:           make(chan T, options.Connections),
		priorityPool:   make(chan T, options.PriorityConnections),
		backgroundPool: make(chan T, options.BackgroundConnections),
		connections:    make([]T, 0, options.Connections+options.PriorityConnections+options.BackgroundConnections),
		retryLimit:     options.NetworkErrRetries,
	}

	for range options.Connections {
		c := makeConnection()
		cpool.connections = append(cpool.connections, c)
		cpool.pool <- c
	}
	for range options.PriorityConnections {
		c := makeConnection()
		cpool.connections = append(cpool.connections, c)
		cpool.priorityPool <- c
	}
	for range options.BackgroundConnections {
		c := makeConnection()
		cpool.connections = append(cpool.connections, c)
		cpool.backgroundPool <- c
	}

	if constants.ENV_DEBUG_OFFLINE != "" {
		zerolog.Ctx(context.TODO()).Warn().Msg("Offline mode enabled")
		cpool.disabled = true
	}

	return &cpool
}

func (c *ConnectionPool[T]) CloseConnections(ctx context.Context) {
	for _, conn := range c.connections {
		if err := conn.Close(); err != nil {
			zerolog.Ctx(ctx).Err(err).Msg("Failed to close connection")
		}
	}
}

func (c *ConnectionPool[T]) retryLoop(ctx context.Context, conn T, fn func(conn T) error) error {
	var attempt int
	var err error
	for attempt < c.retryLimit {
		attempt++
		err = fn(conn)
		if err == nil {
			return nil
		}
		if exhttp.IsNetworkError(err) || errors.Is(err, io.EOF) || errors.Is(err, io.ErrUnexpectedEOF) {
			delay := time.Duration(attempt) * time.Second
			zerolog.Ctx(ctx).Warn().Err(err).
				Int("attempt", attempt).
				Dur("delay", delay).
				Msg("Retrying network error")
			select {
			case <-time.After(delay):
			case <-ctx.Done():
				return ctx.Err()
			}
			continue
		}
		zerolog.Ctx(ctx).Err(err).Msg("NOTNETWORKERR")
		return err
	}
	return err
}

func (c *ConnectionPool[T]) withPriorityConnection(ctx context.Context, fn func(conn T) error) error {
	if c.disabled {
		return errors.New("connection unavailable")
	}

	var conn T
	var ch chan T
	var pool string
	select {
	case conn = <-c.priorityPool:
		ch = c.priorityPool
		pool = "priority"
	case conn = <-c.pool:
		ch = c.pool
		pool = "regular"
	}

	zerolog.Ctx(ctx).Trace().Str("pool", pool).Msg("Acquired connection from pool")
	defer func() {
		ch <- conn
		zerolog.Ctx(ctx).Trace().Str("pool", pool).Msg("Returned connection to pool")
	}()

	return c.retryLoop(ctx, conn, fn)
}

func (c *ConnectionPool[T]) withConnection(ctx context.Context, fn func(conn T) error) error {
	if c.disabled {
		return errors.New("connection unavailable")
	}

	conn := <-c.pool
	zerolog.Ctx(ctx).Trace().Str("pool", "regular").Msg("Acquired connection from pool")

	defer func() {
		c.pool <- conn
		zerolog.Ctx(ctx).Trace().Str("pool", "regular").Msg("Returned connection to pool")
	}()

	return c.retryLoop(ctx, conn, fn)
}

func (c *ConnectionPool[T]) withBackgroundConnection(ctx context.Context, fn func(conn T) error) error {
	if c.disabled {
		return errors.New("connection unavailable")
	}

	conn := <-c.backgroundPool
	zerolog.Ctx(ctx).Trace().Str("pool", "background").Msg("Acquired connection from pool")

	defer func() {
		c.backgroundPool <- conn
		zerolog.Ctx(ctx).Trace().Str("pool", "background").Msg("Returned connection to pool")
	}()

	return c.retryLoop(ctx, conn, fn)
}
