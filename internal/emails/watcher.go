package emails

import (
	"cmp"
	"context"
	"errors"
	"fmt"
	"sync"

	"github.com/emersion/go-imap/v2"

	"github.com/oxygem/kanmail/internal/emails/imapinterface"
	"github.com/oxygem/kanmail/internal/types"
)

type WatchStatus string

const (
	WatchStatusChanged     WatchStatus = "changed"
	WatchStatusUnsupported WatchStatus = "unsupported"
	WatchStatusCancelled   WatchStatus = "cancelled"
	// WatchStatusUnavailable: no spare pooled connection to idle on right now, or
	// an idling connection was reclaimed for interactive work. The manager waits
	// briefly and re-watches; the interval sync covers the folder meanwhile.
	WatchStatusUnavailable WatchStatus = "unavailable"
	// WatchStatusNoFolder: the folder doesn't exist on this account (SELECT
	// returned NO). The manager stops watching it rather than retrying forever.
	WatchStatusNoFolder WatchStatus = "no_folder"
)

type WatchResp struct {
	Status WatchStatus `json:"status"`
}

// folderMark is a cheap snapshot of a mailbox's server-side state, read from the
// SELECT response. Comparing it across watches detects changes that happened
// while nothing was idling (eg during a frontend sync), so change detection no
// longer depends on holding a specific connection selected. Flag-only changes
// are the exception: without CONDSTORE (highestModSeq) they move none of these
// fields, so between watches they're only picked up by the interval sync.
type folderMark struct {
	uidValidity   uint32
	uidNext       imap.UID
	numMessages   uint32
	highestModSeq uint64
}

func markFromSelect(d *imap.SelectData) folderMark {
	return folderMark{
		uidValidity:   d.UIDValidity,
		uidNext:       d.UIDNext,
		numMessages:   d.NumMessages,
		highestModSeq: d.HighestModSeq,
	}
}

// folderWatcher long-polls a single folder for changes using IMAP IDLE over a
// connection borrowed from the account's pool for the duration of each Watch.
// The connection is returned to the pool between calls, so watching adds no
// connections beyond the pool budget: the same connection that idled is free to
// run the frontend's follow-up sync, then idle again.
type folderWatcher struct {
	folderName types.FolderName
	pool       *IMAPConnectionPool

	sem  chan struct{} // cap 1: serializes Watch calls
	done chan struct{} // closed by Close to unblock an in-flight Watch

	mu     sync.Mutex
	mark   *folderMark
	closed bool
}

func newFolderWatcher(pool *IMAPConnectionPool, folderName types.FolderName) *folderWatcher {
	return &folderWatcher{
		folderName: folderName,
		pool:       pool,
		sem:        make(chan struct{}, 1),
		done:       make(chan struct{}),
	}
}

// Watch blocks until the folder changes on the server, the context is cancelled,
// the watcher is closed, or (Unavailable) there is no spare pooled connection to
// idle on. A change observed since the last watch is reported immediately via
// the mark comparison rather than requiring a live IDLE.
func (w *folderWatcher) Watch(ctx context.Context) (*WatchResp, error) {
	select {
	case w.sem <- struct{}{}:
		defer func() { <-w.sem }()
	case <-ctx.Done():
		// A superseding call (frontend cancelled and re-watched before the old
		// call unwound) waits on the semaphore rather than erroring.
		return &WatchResp{Status: WatchStatusCancelled}, nil
	}

	if w.isClosed() {
		return nil, errors.New("watcher closed")
	}

	var resp *WatchResp
	err := w.pool.WithIdleConnection(ctx, func(conn imapinterface.IMAPClient, notify, preempt <-chan struct{}) error {
		var innerErr error
		resp, innerErr = w.watchOnConn(ctx, conn, notify, preempt)
		return innerErr
	})
	if errors.Is(err, errNoIdleConnection) {
		return &WatchResp{Status: WatchStatusUnavailable}, nil
	}
	if err != nil {
		return nil, err
	}
	return resp, nil
}

func (w *folderWatcher) watchOnConn(
	ctx context.Context,
	conn imapinterface.IMAPClient,
	notify, preempt <-chan struct{},
) (*WatchResp, error) {
	if !conn.Caps().Has(imap.CapIdle) {
		return &WatchResp{Status: WatchStatusUnsupported}, nil
	}

	selectData, missing, err := selectFolder(ctx, conn, w.folderName)
	if missing {
		return &WatchResp{Status: WatchStatusNoFolder}, nil
	} else if err != nil {
		return nil, fmt.Errorf("failed to select watch folder: %w", err)
	}
	if w.updateMark(markFromSelect(selectData)) {
		// The folder moved while nothing was idling (eg during a frontend sync).
		return &WatchResp{Status: WatchStatusChanged}, nil
	}

	idleCmd, err := conn.Idle()
	if err != nil {
		return nil, fmt.Errorf("failed to start IDLE: %w", err)
	}

	// The IDLE command completes by itself if the connection dies, making Wait
	// double as a liveness signal.
	idleDone := make(chan error, 1)
	go func() { idleDone <- idleCmd.Wait() }()

	status := WatchStatusChanged
	select {
	case <-notify:
	case <-preempt:
		status = WatchStatusUnavailable
	case <-ctx.Done():
		status = WatchStatusCancelled
	case <-w.done:
		status = WatchStatusCancelled
	case idleErr := <-idleDone:
		// Connection died mid-IDLE
		if idleErr == nil {
			idleErr = errors.New("idle terminated unexpectedly")
		}
		return nil, idleErr
	}

	if err := cmp.Or(idleCmd.Close(), <-idleDone); err != nil {
		if status != WatchStatusChanged {
			return &WatchResp{Status: status}, nil
		}
		return nil, fmt.Errorf("failed to stop IDLE: %w", err)
	}

	if status == WatchStatusChanged {
		// Advance the mark past this change so the next watch idles instead of
		// re-reporting it. Anything that changes again before then is caught by
		// the next SELECT comparison.
		if data, err := conn.Select(string(w.folderName), nil).Wait(); err == nil {
			w.updateMark(markFromSelect(data))
		}
	}

	return &WatchResp{Status: status}, nil
}

// Close unblocks any in-flight Watch and marks the watcher unusable. The
// borrowed connection is owned by the pool, so nothing to close here - the
// in-flight Watch observes done, stops IDLE and returns the connection.
func (w *folderWatcher) Close() {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.closed {
		return
	}
	w.closed = true
	close(w.done)
}

func (w *folderWatcher) isClosed() bool {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.closed
}

// updateMark stores the mark and reports whether it moved. The first mark ever
// seen only seeds the comparison: the frontend runs its own initial sync, so
// reporting a change here would just duplicate it.
func (w *folderWatcher) updateMark(m folderMark) (changed bool) {
	w.mu.Lock()
	defer w.mu.Unlock()
	changed = w.mark != nil && *w.mark != m
	w.mark = &m
	return changed
}
