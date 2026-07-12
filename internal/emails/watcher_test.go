package emails

import (
	"context"
	"testing"
	"time"

	"github.com/oxygem/kanmail/internal/constants"
	"github.com/oxygem/kanmail/internal/emails/imapinterface"
	"github.com/oxygem/kanmail/internal/types"
)

func newTestPool(t *testing.T, connections int) *IMAPConnectionPool {
	t.Helper()
	prev := constants.ENV_DEBUG_FAKE_IMAP
	constants.ENV_DEBUG_FAKE_IMAP = "1"
	t.Cleanup(func() { constants.ENV_DEBUG_FAKE_IMAP = prev })

	opts := ConnectionPoolOptions{
		Connections:           connections,
		PriorityConnections:   2,
		BackgroundConnections: 1,
		NetworkErrRetries:     5,
	}
	return NewIMAPConnectionPool(opts, types.ConnectionSettings{Username: t.Name()})
}

func newTestWatcher(t *testing.T) *folderWatcher {
	t.Helper()
	return newFolderWatcher(newTestPool(t, 2), "inbox")
}

func watchAsync(w *folderWatcher, ctx context.Context) chan *WatchResp {
	results := make(chan *WatchResp, 1)
	go func() {
		resp, _ := w.Watch(ctx)
		results <- resp
	}()
	return results
}

func expectWatchResult(t *testing.T, results chan *WatchResp, status WatchStatus, desc string) {
	t.Helper()
	select {
	case resp := <-results:
		if resp == nil || resp.Status != status {
			t.Fatalf("%s: expected status %q, got %+v", desc, status, resp)
		}
	case <-time.After(2 * time.Second):
		t.Fatalf("%s: watch did not return", desc)
	}
}

func expectWatchBlocked(t *testing.T, results chan *WatchResp, desc string) {
	t.Helper()
	select {
	case resp := <-results:
		t.Fatalf("%s: watch returned early: %+v", desc, resp)
	case <-time.After(100 * time.Millisecond):
	}
}

func appendFakeMessage(t *testing.T, accountKey, folder string) {
	t.Helper()
	client := imapinterface.NewFakeIMAPClient(accountKey)
	cmd := client.Append(folder, 0, nil)
	if _, err := cmd.Write([]byte("Subject: test\r\n\r\nbody")); err != nil {
		t.Fatalf("append write failed: %v", err)
	}
	if _, err := cmd.Wait(); err != nil {
		t.Fatalf("append failed: %v", err)
	}
}

// primeWatcher seeds the watcher's mark (set on SELECT during the first watch)
// by starting and cancelling a watch, so later watches exercise the mark
// comparison rather than first-watch seeding.
func primeWatcher(t *testing.T, w *folderWatcher) {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	results := watchAsync(w, ctx)
	expectWatchBlocked(t, results, "priming watch should idle")
	cancel()
	expectWatchResult(t, results, WatchStatusCancelled, "priming watch cancelled")
}

func TestWatcherFirstWatchSeedsAndIdles(t *testing.T) {
	w := newTestWatcher(t)

	// The first watch must not report the seeded mark as a change (the frontend
	// does its own initial sync); it idles until something really changes.
	results := watchAsync(w, context.Background())
	expectWatchBlocked(t, results, "first watch should seed the mark and idle")

	appendFakeMessage(t, t.Name(), "inbox")
	expectWatchResult(t, results, WatchStatusChanged, "append while watching")
}

func TestWatcherDetectsChangeBetweenWatches(t *testing.T) {
	w := newTestWatcher(t)
	primeWatcher(t, w)

	// Change arrives while nothing is watching (eg during a frontend sync). The
	// mark comparison on the next SELECT catches it without a live IDLE.
	appendFakeMessage(t, t.Name(), "inbox")

	results := watchAsync(w, context.Background())
	expectWatchResult(t, results, WatchStatusChanged, "change between watches")
}

func TestWatcherNoChangeIdlesThenReports(t *testing.T) {
	w := newTestWatcher(t)
	primeWatcher(t, w)

	// A later watch with nothing changed must block (idle), not re-report.
	results := watchAsync(w, context.Background())
	expectWatchBlocked(t, results, "unchanged folder should idle")

	appendFakeMessage(t, t.Name(), "inbox")
	expectWatchResult(t, results, WatchStatusChanged, "change after idling")
}

func TestWatcherMissingFolderReportsNoFolder(t *testing.T) {
	w := newFolderWatcher(newTestPool(t, 2), "definitely-not-a-folder")

	resp, err := w.Watch(context.Background())
	if err != nil {
		t.Fatalf("watch failed: %v", err)
	}
	if resp.Status != WatchStatusNoFolder {
		t.Fatalf("expected no_folder for missing folder, got %q", resp.Status)
	}
}

func TestWatcherContextCancel(t *testing.T) {
	w := newTestWatcher(t)

	ctx, cancel := context.WithCancel(context.Background())
	results := watchAsync(w, ctx)
	expectWatchBlocked(t, results, "before cancel")

	cancel()
	expectWatchResult(t, results, WatchStatusCancelled, "context cancel")
}

func TestWatcherCloseUnblocksWatch(t *testing.T) {
	w := newTestWatcher(t)

	results := watchAsync(w, context.Background())
	expectWatchBlocked(t, results, "before close")

	w.Close()
	expectWatchResult(t, results, WatchStatusCancelled, "watcher close")

	if _, err := w.Watch(context.Background()); err == nil {
		t.Fatal("watch after close should fail")
	}
}

func TestWatcherSerializesConcurrentCalls(t *testing.T) {
	w := newTestWatcher(t)

	first := watchAsync(w, context.Background())
	expectWatchBlocked(t, first, "first watch idling")

	// Second call queues on the semaphore; cancelling it returns without error
	ctx, cancel := context.WithCancel(context.Background())
	second := watchAsync(w, ctx)
	expectWatchBlocked(t, second, "second watch queued")
	cancel()
	expectWatchResult(t, second, WatchStatusCancelled, "queued watch cancelled")

	appendFakeMessage(t, t.Name(), "inbox")
	expectWatchResult(t, first, WatchStatusChanged, "first watch sees change")
}

func TestWatcherUnavailableWhenPoolBusy(t *testing.T) {
	pool := newTestPool(t, 1)
	w := newFolderWatcher(pool, "inbox")

	// Occupy the only regular connection with a long interactive hold.
	held := make(chan struct{})
	release := make(chan struct{})
	go func() {
		_ = pool.WithConnection(context.Background(), func(conn imapinterface.IMAPClient) error {
			close(held)
			<-release
			return nil
		})
	}()
	<-held

	resp, err := w.Watch(context.Background())
	if err != nil {
		t.Fatalf("watch failed: %v", err)
	}
	if resp.Status != WatchStatusUnavailable {
		t.Fatalf("expected unavailable when pool busy, got %q", resp.Status)
	}
	close(release)
}

func TestWatcherPreemptedByInteractiveWork(t *testing.T) {
	pool := newTestPool(t, 1)
	w := newFolderWatcher(pool, "inbox")

	results := watchAsync(w, context.Background())
	expectWatchBlocked(t, results, "watch holds the only connection idling")

	// Interactive work on a fully-idle pool must reclaim the connection.
	acquired := make(chan struct{})
	go func() {
		_ = pool.WithConnection(context.Background(), func(conn imapinterface.IMAPClient) error {
			close(acquired)
			return nil
		})
	}()

	select {
	case <-acquired:
	case <-time.After(2 * time.Second):
		t.Fatal("interactive work did not reclaim the idle connection")
	}
	expectWatchResult(t, results, WatchStatusUnavailable, "watch preempted")
}

func TestAccountWatchFolderClosedConnections(t *testing.T) {
	prev := constants.ENV_DEBUG_FAKE_IMAP
	constants.ENV_DEBUG_FAKE_IMAP = "1"
	t.Cleanup(func() { constants.ENV_DEBUG_FAKE_IMAP = prev })

	account := NewAccount(types.AccountSettings{
		Name:         types.AccountName(t.Name()),
		IMAPSettings: types.ConnectionSettings{Username: t.Name()},
	}, nil)

	results := make(chan *WatchResp, 1)
	go func() {
		resp, _ := account.WatchFolder(context.Background(), "inbox")
		results <- resp
	}()
	expectWatchBlocked(t, results, "watch should idle")

	// Watchers are closed before the pool's connections, so the in-flight watch
	// exits cleanly rather than erroring on a dead connection.
	account.CloseConnections(context.Background())
	expectWatchResult(t, results, WatchStatusCancelled, "close connections")

	if _, err := account.WatchFolder(context.Background(), "inbox"); err == nil {
		t.Fatal("watch after CloseConnections should fail")
	}
}
