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

// errPoolClosed is returned by every acquire path once CloseConnections has run.
var errPoolClosed = errors.New("connection pool closed")

// errInsecurePasswordAuth blocks the plaintext-credential path: with neither
// SSL nor STARTTLS the password (or OAuth access token) would go over the wire
// in the clear, readable by anything between here and the server.
var errInsecurePasswordAuth = errors.New(
	"refusing to send credentials over an unencrypted connection, enable SSL/TLS or STARTTLS",
)

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
	retryLimit     int

	// Guards the idle bookkeeping below plus the closed flag. Idlers borrow from
	// the regular pool and yield it the moment interactive work needs it, so
	// watching costs no extra connections beyond the pool budget.
	idleMu     sync.Mutex
	idleLeases []*idleLease
	waiters    int // interactive acquirers blocked waiting for a regular connection
	closed     bool

	// Closed alongside the flag above to wake acquirers already parked on an
	// empty pool - post-close nothing is ever returned to the channels, so
	// without this they would block until their context is cancelled (if ever).
	closedCh chan struct{}
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
		retryLimit:     options.NetworkErrRetries,
		closedCh:       make(chan struct{}),
	}

	for range options.Connections {
		cpool.pool <- makeConnection()
	}
	for range options.PriorityConnections {
		cpool.priorityPool <- makeConnection()
	}
	for range options.BackgroundConnections {
		cpool.backgroundPool <- makeConnection()
	}

	if constants.ENV_DEBUG_OFFLINE != "" {
		zerolog.Ctx(context.TODO()).Warn().Msg("Offline mode enabled")
		cpool.disabled = true
	}

	return &cpool
}

// CloseConnections marks the pool closed and closes every parked connection.
// Connections currently checked out by other goroutines are closed by release
// when their holder returns them, rather than being torn down mid-command.
func (c *ConnectionPool[T]) CloseConnections(ctx context.Context) {
	c.idleMu.Lock()
	if !c.closed {
		c.closed = true
		close(c.closedCh)
	}
	leases := c.idleLeases
	c.idleLeases = nil

	var conns []T
	for _, ch := range []chan T{c.pool, c.priorityPool, c.backgroundPool} {
		for draining := true; draining; {
			select {
			case conn := <-ch:
				conns = append(conns, conn)
			default:
				draining = false
			}
		}
	}
	c.idleMu.Unlock()

	// Preempt idlers so they stop IDLE and release (= close) their connections
	for _, lease := range leases {
		lease.signal()
	}

	for _, conn := range conns {
		if err := conn.Close(); err != nil {
			zerolog.Ctx(ctx).Err(err).Msg("Failed to close connection")
		}
	}
}

func (c *ConnectionPool[T]) isClosed() bool {
	c.idleMu.Lock()
	defer c.idleMu.Unlock()
	return c.closed
}

// release returns a connection to its pool, or closes it if the pool was closed
// while it was checked out - without this the next acquirer would transparently
// re-dial a connection belonging to a closed (eg deleted) account.
func (c *ConnectionPool[T]) release(ch chan T, conn T) {
	c.idleMu.Lock()
	closed := c.closed
	if !closed {
		// Never blocks: each connection belongs to exactly one channel slot
		ch <- conn
	}
	c.idleMu.Unlock()

	if closed {
		conn.Close()
	}
}

func (c *ConnectionPool[T]) retryLoop(ctx context.Context, conn T, fn func(conn T) error) error {
	return c.retryLoopIf(ctx, conn, util.IsRetryableError, fn)
}

// retryLoopNoReplay retries only errors where the server rejected the command
// outright (a transient NO response). Network errors - a timeout or dropped
// connection - are returned immediately: the server may have executed the
// command before the pipe broke, and replaying it would perform it twice.
func (c *ConnectionPool[T]) retryLoopNoReplay(ctx context.Context, conn T, fn func(conn T) error) error {
	return c.retryLoopIf(ctx, conn, util.IsRetryableIMAPError, fn)
}

func (c *ConnectionPool[T]) retryLoopIf(
	ctx context.Context,
	conn T,
	canRetry func(error) bool,
	fn func(conn T) error,
) error {
	var attempt, netErrCount int
	var err, lastNetErr error
	for attempt < c.retryLimit {
		attempt++
		err = fn(conn)
		if err == nil {
			return nil
		}
		if util.IsRetryableError(err) {
			// Server-rejected (NO) retries aren't network errors - don't record
			// them as such, they'd misclassify in the analytics summary
			if util.IsRetryableNetworkError(err) {
				lastNetErr = err
				netErrCount++
			}
			if !canRetry(err) {
				break
			}
			// A retry against a closed pool would transparently re-dial a fresh
			// connection to a closed (possibly deleted) account via wrapper.Get
			if c.isClosed() {
				break
			}
			delay := time.Duration(attempt) * time.Second
			zerolog.Ctx(ctx).Warn().Err(err).
				Int("attempt", attempt).
				Dur("delay", delay).
				Msg("Retrying transient error")
			select {
			case <-time.After(delay):
			case <-ctx.Done():
				// Aborted mid-episode (usually shutdown) - not signal, skip recording
				return ctx.Err()
			}
			continue
		}
		break
	}
	if lastNetErr != nil {
		util.RecordNetworkError(ctx, c.accountName, lastNetErr, netErrCount)
	}
	return err
}

func (c *ConnectionPool[T]) withPriorityConnection(ctx context.Context, fn func(conn T) error) error {
	return c.acquirePriority(ctx, func(conn T) error {
		return c.retryLoop(ctx, conn, fn)
	})
}

// withPriorityConnectionNoReplay is withPriorityConnection without network-error
// retries - see retryLoopNoReplay. Use for commands that aren't safe to replay.
func (c *ConnectionPool[T]) withPriorityConnectionNoReplay(ctx context.Context, fn func(conn T) error) error {
	return c.acquirePriority(ctx, func(conn T) error {
		return c.retryLoopNoReplay(ctx, conn, fn)
	})
}

func (c *ConnectionPool[T]) acquirePriority(ctx context.Context, run func(conn T) error) error {
	if err := c.available(); err != nil {
		return err
	}

	// Priority work prefers its own pool but falls back to the regular pool,
	// preempting an idler if that too is momentarily exhausted.
	select {
	case conn := <-c.priorityPool:
		defer c.release(c.priorityPool, conn)
		return run(conn)
	case conn := <-c.pool:
		defer c.release(c.pool, conn)
		return run(conn)
	default:
	}

	c.beginWait()
	defer c.endWait()

	select {
	case conn := <-c.priorityPool:
		defer c.release(c.priorityPool, conn)
		return run(conn)
	case conn := <-c.pool:
		defer c.release(c.pool, conn)
		return run(conn)
	case <-c.closedCh:
		return errPoolClosed
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (c *ConnectionPool[T]) withConnection(ctx context.Context, fn func(conn T) error) error {
	return c.acquire(ctx, func(conn T) error {
		return c.retryLoop(ctx, conn, fn)
	})
}

// withConnectionNoReplay is withConnection without network-error retries - see
// retryLoopNoReplay. Use for commands that aren't safe to replay.
func (c *ConnectionPool[T]) withConnectionNoReplay(ctx context.Context, fn func(conn T) error) error {
	return c.acquire(ctx, func(conn T) error {
		return c.retryLoopNoReplay(ctx, conn, fn)
	})
}

// withConnectionOnce runs fn a single time, skipping the retry loop entirely.
// Use it for operations that cannot be safely replayed: a transient error raised
// after the server already accepted the command performs it twice.
func (c *ConnectionPool[T]) withConnectionOnce(ctx context.Context, fn func(conn T) error) error {
	return c.acquire(ctx, fn)
}

func (c *ConnectionPool[T]) available() error {
	if c.disabled {
		return errors.New("connection unavailable")
	}
	if c.isClosed() {
		return errPoolClosed
	}
	return nil
}

func (c *ConnectionPool[T]) acquire(ctx context.Context, run func(conn T) error) error {
	if err := c.available(); err != nil {
		return err
	}

	select {
	case conn := <-c.pool:
		defer c.release(c.pool, conn)
		return run(conn)
	default:
	}

	c.beginWait()
	defer c.endWait()

	select {
	case conn := <-c.pool:
		defer c.release(c.pool, conn)
		return run(conn)
	case <-c.closedCh:
		return errPoolClosed
	case <-ctx.Done():
		return ctx.Err()
	}
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
	if c.waiters > 0 || c.closed {
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
		c.release(c.pool, conn)
	}()

	zerolog.Ctx(ctx).Trace().Msg("Borrowed pool connection for IDLE")
	return fn(conn, lease.preempt)
}

func (c *ConnectionPool[T]) withBackgroundConnection(ctx context.Context, fn func(conn T) error) error {
	if err := c.available(); err != nil {
		return err
	}

	var conn T
	select {
	case conn = <-c.backgroundPool:
	case <-c.closedCh:
		return errPoolClosed
	case <-ctx.Done():
		return ctx.Err()
	}
	zerolog.Ctx(ctx).Trace().Str("pool", "background").Msg("Acquired connection from pool")

	defer func() {
		c.release(c.backgroundPool, conn)
		zerolog.Ctx(ctx).Trace().Str("pool", "background").Msg("Returned connection to pool")
	}()

	return c.retryLoop(ctx, conn, fn)
}
