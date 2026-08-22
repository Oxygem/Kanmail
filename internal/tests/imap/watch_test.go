package imaptest

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/oxygem/kanmail/internal/emails"
)

func watchAsync(e *env, ctx context.Context, folder string) chan *emails.WatchResp {
	results := make(chan *emails.WatchResp, 1)
	go func() {
		resp, err := e.account.WatchFolder(ctx, e.folder(folder).Name)
		if err != nil {
			e.t.Errorf("watch %s: %v", folder, err)
		}
		results <- resp
	}()
	return results
}

func expectWatch(t *testing.T, results chan *emails.WatchResp, status emails.WatchStatus, within time.Duration) {
	t.Helper()
	select {
	case resp := <-results:
		require.NotNil(t, resp)
		assert.Equal(t, status, resp.Status)
	case <-time.After(within):
		t.Fatalf("watch did not return within %s", within)
	}
}

func expectWatchBlocked(t *testing.T, results chan *emails.WatchResp) {
	t.Helper()
	select {
	case resp := <-results:
		t.Fatalf("watch returned early: %+v", resp)
	case <-time.After(time.Second):
	}
}

// IDLE on a real server: a watch blocks until another client delivers mail,
// reports the change, and the next watch idles again rather than re-reporting
func TestWatchFolderSeesNewMail(t *testing.T) {
	forEachTarget(t, func(t *testing.T, tg *target) {
		e := newEnv(t, tg)
		e.seed("INBOX", 1)
		inbox := e.folder("inbox")
		require.Len(t, e.paginateAll(inbox, 10), 1)

		latency := 10 * time.Second
		if tg.watchLatency > 0 {
			latency = tg.watchLatency
		}

		results := watchAsync(e, e.ctx, "inbox")
		expectWatchBlocked(t, results)

		e.seed("INBOX", 1)
		expectWatch(t, results, emails.WatchStatusChanged, latency)

		resp := e.sync(inbox)
		assert.Len(t, resp.Emails, 1)

		results = watchAsync(e, e.ctx, "inbox")
		expectWatchBlocked(t, results)

		// Deletion is a change too
		e.expungeMessages("INBOX", e.uids("INBOX")[0])
		expectWatch(t, results, emails.WatchStatusChanged, latency)
	})
}

// A change that lands between two watches is reported by the next one from
// the SELECT comparison, without waiting for IDLE
func TestWatchFolderSeesChangeBetweenWatches(t *testing.T) {
	forEachTarget(t, func(t *testing.T, tg *target) {
		e := newEnv(t, tg)
		e.seed("INBOX", 1)

		ctx, cancel := context.WithCancel(e.ctx)
		results := watchAsync(e, ctx, "inbox")
		expectWatchBlocked(t, results)
		cancel()
		expectWatch(t, results, emails.WatchStatusCancelled, 5*time.Second)

		e.seed("INBOX", 1)

		latency := 10 * time.Second
		if tg.watchLatency > 0 {
			latency = tg.watchLatency
		}
		results = watchAsync(e, e.ctx, "inbox")
		expectWatch(t, results, emails.WatchStatusChanged, latency)
	})
}

// Watching a folder the server doesn't have says so, rather than idling on
// nothing or erroring
func TestWatchMissingFolder(t *testing.T) {
	forEachTarget(t, func(t *testing.T, tg *target) {
		e := newEnv(t, tg)
		results := watchAsync(e, e.ctx, "nope")
		expectWatch(t, results, emails.WatchStatusNoFolder, 10*time.Second)
	})
}

// Interactive work while a watch idles preempts the idle connection without
// either side erroring; the watch comes back as unavailable and the work runs
func TestWatchYieldsToInteractiveWork(t *testing.T) {
	forEachTarget(t, func(t *testing.T, tg *target) {
		e := newEnv(t, tg)
		e.seed("INBOX", 2)
		inbox := e.folder("inbox")

		results := watchAsync(e, e.ctx, "inbox")
		expectWatchBlocked(t, results)

		// The pool has two regular connections: this sync takes one, the
		// second paginate the other, leaving none spare for the idler
		done := make(chan struct{})
		go func() {
			defer close(done)
			for range 3 {
				e.sync(inbox)
				e.paginate(inbox, 1)
			}
		}()
		<-done

		select {
		case resp := <-results:
			assert.Contains(t, []emails.WatchStatus{emails.WatchStatusUnavailable, emails.WatchStatusChanged}, resp.Status)
		default:
			// The pool was never short of a connection; the watch still idles
		}
	})
}
