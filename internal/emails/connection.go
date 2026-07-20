package emails

import (
	"context"
	"errors"
	"sync"
	"time"

	"github.com/rs/zerolog"

	"github.com/oxygem/kanmail/internal/constants"
	"github.com/oxygem/kanmail/internal/util"
)

// errNoIdleConnection is returned by withIdleConnection when the regular pool has
// no spare connection to lend for IDLE right now (all in use by real work). The
// caller backs off and retries rather than stealing a slot from interactive work.
var errNoIdleConnection = errors.New("no spare connection to idle on")

// A pool of lazily loaded connections that can be retrieved for exclusive access within the current
// goroutine. Safe to call the pool from multiple goroutines.
type connection interface {
	Close() error
}

// idleLease represents a connection currently parked in IDLE, borrowed from the
// regular pool. Interactive acquirers close preempt to reclaim its slot.
type idleLease struct {
	preempt chan struct{}
	once    sync.Once
}

func (l *idleLease) signal() {
	l.once.Do(func() { close(l.preempt) })
}

type ConnectionPool[T connection] struct {
	disabled       bool
	accountName    string
	pool           chan T
	priorityPool   chan T
	backgroundPool chan T
	connections    []T
	retryLimit     int

	// Guards the idle bookkeeping below. Idlers borrow from the regular pool and
	// yield it the moment interactive work needs it, so watching costs no extra
	// connections beyond the pool budget.
	idleMu     sync.Mutex
	idleLeases []*idleLease
	waiters    int // interactive acquirers blocked waiting for a regular connection
}

type ConnectionPoolOptions struct {
	AccountName string
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
		accountName:    options.AccountName,
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
	var attempt, netErrCount int
	var err, lastNetErr error
	for attempt < c.retryLimit {
		attempt++
		err = fn(conn)
		if err == nil {
			if lastNetErr != nil {
				util.RecordNetworkError(ctx, c.accountName, lastNetErr, netErrCount, true)
			}
			return nil
		}
		if util.IsRetryableNetworkError(err) {
			lastNetErr = err
			netErrCount++
			delay := time.Duration(attempt) * time.Second
			zerolog.Ctx(ctx).Warn().Err(err).
				Int("attempt", attempt).
				Dur("delay", delay).
				Msg("Retrying network error")
			select {
			case <-time.After(delay):
			case <-ctx.Done():
				// Aborted mid-episode (usually shutdown) - not signal, skip recording
				return ctx.Err()
			}
			continue
		}
		if lastNetErr != nil {
			util.RecordNetworkError(ctx, c.accountName, lastNetErr, netErrCount, false)
		}
		return err
	}
	util.RecordNetworkError(ctx, c.accountName, err, netErrCount, false)
	return err
}

func (c *ConnectionPool[T]) withPriorityConnection(ctx context.Context, fn func(conn T) error) error {
	if c.disabled {
		return errors.New("connection unavailable")
	}

	// Priority work prefers its own pool but falls back to the regular pool,
	// preempting an idler if that too is momentarily exhausted.
	select {
	case conn := <-c.priorityPool:
		defer func() { c.priorityPool <- conn }()
		return c.retryLoop(ctx, conn, fn)
	case conn := <-c.pool:
		defer func() { c.pool <- conn }()
		return c.retryLoop(ctx, conn, fn)
	default:
	}

	c.beginWait()
	defer c.endWait()

	select {
	case conn := <-c.priorityPool:
		defer func() { c.priorityPool <- conn }()
		return c.retryLoop(ctx, conn, fn)
	case conn := <-c.pool:
		defer func() { c.pool <- conn }()
		return c.retryLoop(ctx, conn, fn)
	}
}

func (c *ConnectionPool[T]) withConnection(ctx context.Context, fn func(conn T) error) error {
	if c.disabled {
		return errors.New("connection unavailable")
	}

	select {
	case conn := <-c.pool:
		defer func() { c.pool <- conn }()
		return c.retryLoop(ctx, conn, fn)
	default:
	}

	c.beginWait()
	defer c.endWait()

	conn := <-c.pool
	defer func() { c.pool <- conn }()
	return c.retryLoop(ctx, conn, fn)
}

// beginWait marks that an interactive acquirer is now waiting on the regular
// pool (which stops idlers grabbing a slot from under it) and preempts the
// oldest idler so its connection is released back to the pool.
func (c *ConnectionPool[T]) beginWait() {
	c.idleMu.Lock()
	c.waiters++
	var lease *idleLease
	if len(c.idleLeases) > 0 {
		lease = c.idleLeases[0]
		c.idleLeases = c.idleLeases[1:]
	}
	c.idleMu.Unlock()
	if lease != nil {
		lease.signal()
	}
}

func (c *ConnectionPool[T]) endWait() {
	c.idleMu.Lock()
	c.waiters--
	c.idleMu.Unlock()
}

// withIdleConnection lends a regular-pool connection for IDLE, but only when one
// is immediately spare and no interactive acquirer is waiting. The connection is
// returned to the pool when fn exits (a change arrived, the watch was cancelled,
// or preempt fired). fn must stop IDLE promptly once preempt is closed.
func (c *ConnectionPool[T]) withIdleConnection(ctx context.Context, fn func(conn T, preempt <-chan struct{}) error) error {
	if c.disabled {
		return errNoIdleConnection
	}

	c.idleMu.Lock()
	var conn T
	if c.waiters > 0 {
		c.idleMu.Unlock()
		return errNoIdleConnection
	}
	select {
	case conn = <-c.pool:
	default:
		c.idleMu.Unlock()
		return errNoIdleConnection
	}
	lease := &idleLease{preempt: make(chan struct{})}
	c.idleLeases = append(c.idleLeases, lease)
	c.idleMu.Unlock()

	defer func() {
		c.idleMu.Lock()
		for i, existing := range c.idleLeases {
			if existing == lease {
				c.idleLeases = append(c.idleLeases[:i], c.idleLeases[i+1:]...)
				break
			}
		}
		c.idleMu.Unlock()
		c.pool <- conn
	}()

	zerolog.Ctx(ctx).Trace().Msg("Borrowed pool connection for IDLE")
	return fn(conn, lease.preempt)
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
