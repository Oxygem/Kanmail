package services

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/rs/zerolog"

	"github.com/oxygem/kanmail/internal/types"
)

// newTestWatchManager builds a manager with the loop body stubbed so reconcile's
// start/stop bookkeeping can be exercised without real IMAP connections. started
// receives a key each time a loop is spawned; the stub blocks until its context
// is cancelled (ie the loop is stopped).
func newTestWatchManager(t *testing.T) (*FolderWatchManager, chan watchKey) {
	t.Helper()
	started := make(chan watchKey, 16)
	m := &FolderWatchManager{
		log:         zerolog.Nop(),
		loops:       map[watchKey]context.CancelFunc{},
		unsupported: map[types.AccountID]struct{}{},
		authFailed:  map[types.AccountID]struct{}{},
	}
	m.run = func(ctx context.Context, key watchKey) {
		started <- key
		<-ctx.Done()
	}
	return m, started
}

func settingsWith(columns []types.FolderName, accounts ...string) types.Settings {
	s := types.Settings{
		ColumnGroups: []types.ColumnGroup{{Name: "Default", Columns: columns}},
	}
	for _, name := range accounts {
		s.Accounts = append(s.Accounts, types.AccountSettings{ID: types.AccountID(name), Name: types.AccountName(name)})
	}
	return s
}

func activeKeys(m *FolderWatchManager) map[watchKey]struct{} {
	m.mu.Lock()
	defer m.mu.Unlock()
	keys := make(map[watchKey]struct{}, len(m.loops))
	for key := range m.loops {
		keys[key] = struct{}{}
	}
	return keys
}

func expectStarted(t *testing.T, started chan watchKey, want ...watchKey) {
	t.Helper()
	got := map[watchKey]struct{}{}
	for range want {
		select {
		case key := <-started:
			got[key] = struct{}{}
		case <-time.After(time.Second):
			t.Fatalf("expected %d loops started, got %d", len(want), len(got))
		}
	}
	for _, key := range want {
		if _, ok := got[key]; !ok {
			t.Fatalf("expected loop %+v to start", key)
		}
	}
}

func TestReconcileStartsPerAccountAndColumn(t *testing.T) {
	m, started := newTestWatchManager(t)

	m.reconcile(settingsWith([]types.FolderName{"inbox", "archive"}, "one", "two"))

	expectStarted(t, started,
		watchKey{"one", "inbox"}, watchKey{"one", "archive"},
		watchKey{"two", "inbox"}, watchKey{"two", "archive"},
	)
	if got := len(activeKeys(m)); got != 4 {
		t.Fatalf("expected 4 active loops, got %d", got)
	}
}

func TestReconcileStopsRemovedColumnsAndAccounts(t *testing.T) {
	m, started := newTestWatchManager(t)

	m.reconcile(settingsWith([]types.FolderName{"inbox", "archive"}, "one", "two"))
	expectStarted(t, started,
		watchKey{"one", "inbox"}, watchKey{"one", "archive"},
		watchKey{"two", "inbox"}, watchKey{"two", "archive"},
	)

	// Drop the archive column and account two.
	m.reconcile(settingsWith([]types.FolderName{"inbox"}, "one"))

	keys := activeKeys(m)
	if len(keys) != 1 {
		t.Fatalf("expected 1 active loop, got %d: %+v", len(keys), keys)
	}
	if _, ok := keys[watchKey{"one", "inbox"}]; !ok {
		t.Fatalf("expected one/inbox to remain, got %+v", keys)
	}
}

func TestReconcileIsIdempotent(t *testing.T) {
	m, started := newTestWatchManager(t)

	settings := settingsWith([]types.FolderName{"inbox"}, "one")
	m.reconcile(settings)
	expectStarted(t, started, watchKey{"one", "inbox"})

	// Same settings again must not restart the loop.
	m.reconcile(settings)
	select {
	case key := <-started:
		t.Fatalf("unexpected loop (re)start: %+v", key)
	case <-time.After(100 * time.Millisecond):
	}
}

func TestReconcileSkipsUnsupportedAccounts(t *testing.T) {
	m, started := newTestWatchManager(t)

	m.markUnsupported("one")
	m.reconcile(settingsWith([]types.FolderName{"inbox"}, "one", "two"))

	// Only account two should start; one is known unsupported.
	expectStarted(t, started, watchKey{"two", "inbox"})
	select {
	case key := <-started:
		t.Fatalf("unsupported account should not start: %+v", key)
	case <-time.After(100 * time.Millisecond):
	}
	keys := activeKeys(m)
	if _, ok := keys[watchKey{"one", "inbox"}]; ok {
		t.Fatal("unsupported account should have no loop")
	}
}

func TestReconcileForgetsUnsupportedWhenAccountRemoved(t *testing.T) {
	m, started := newTestWatchManager(t)

	m.markUnsupported("one")
	// Account one absent -> its unsupported marker is forgotten.
	m.reconcile(settingsWith([]types.FolderName{"inbox"}, "two"))
	expectStarted(t, started, watchKey{"two", "inbox"})

	// Re-adding one now re-probes it (a loop starts).
	m.reconcile(settingsWith([]types.FolderName{"inbox"}, "one", "two"))
	expectStarted(t, started, watchKey{"one", "inbox"})
}

func TestMarkAuthFailedStopsAccountAndPromptsOnce(t *testing.T) {
	m, started := newTestWatchManager(t)
	prompts := make(chan types.AccountID, 4)
	m.emitAuthError = func(account types.AccountID, _ string) { prompts <- account }

	m.reconcile(settingsWith([]types.FolderName{"inbox", "archive"}, "one", "two"))
	expectStarted(t, started,
		watchKey{"one", "inbox"}, watchKey{"one", "archive"},
		watchKey{"two", "inbox"}, watchKey{"two", "archive"},
	)

	// Every folder on the account shares the rejected credentials, so all of
	// them stop - and sibling loops racing to the same conclusion must not each
	// prompt the user.
	m.markAuthFailed("one", errors.New("revoked"))
	m.markAuthFailed("one", errors.New("revoked"))

	keys := activeKeys(m)
	if len(keys) != 2 {
		t.Fatalf("expected only account two watching, got %+v", keys)
	}
	for key := range keys {
		if key.account == "one" {
			t.Fatalf("account one should have no loops, got %+v", key)
		}
	}

	select {
	case account := <-prompts:
		if account != "one" {
			t.Fatalf("prompted for %q, want one", account)
		}
	case <-time.After(time.Second):
		t.Fatal("expected a reconnect prompt")
	}
	select {
	case account := <-prompts:
		t.Fatalf("expected a single prompt, got a second for %q", account)
	case <-time.After(100 * time.Millisecond):
	}
}

func TestReconcileRestartsAuthFailedAccounts(t *testing.T) {
	m, started := newTestWatchManager(t)
	m.emitAuthError = func(types.AccountID, string) {}

	settings := settingsWith([]types.FolderName{"inbox"}, "one")
	m.reconcile(settings)
	expectStarted(t, started, watchKey{"one", "inbox"})

	m.markAuthFailed("one", errors.New("revoked"))
	if got := len(activeKeys(m)); got != 0 {
		t.Fatalf("expected no loops after auth failure, got %d", got)
	}

	// Reconciling is how a reconnect reaches us - the watch must come back
	// rather than stay dead for the rest of the session.
	m.reconcile(settings)
	expectStarted(t, started, watchKey{"one", "inbox"})
}

func TestRunGuardedRecoversPanic(t *testing.T) {
	m, _ := newTestWatchManager(t)
	panicked := make(chan struct{})
	m.run = func(ctx context.Context, key watchKey) {
		close(panicked)
		panic("boom")
	}

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		m.runGuarded(ctx, watchKey{"one", "inbox"})
		close(done)
	}()

	// The panic must be recovered (not crash the process) and the guard must
	// exit cleanly once cancelled while waiting to restart.
	select {
	case <-panicked:
	case <-time.After(time.Second):
		t.Fatal("loop body never ran")
	}
	cancel()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("runGuarded did not exit after cancel")
	}
}

func TestStopCancelsAllLoops(t *testing.T) {
	m, started := newTestWatchManager(t)

	m.reconcile(settingsWith([]types.FolderName{"inbox"}, "one", "two"))
	expectStarted(t, started, watchKey{"one", "inbox"}, watchKey{"two", "inbox"})

	m.Stop()
	if got := len(activeKeys(m)); got != 0 {
		t.Fatalf("expected no loops after stop, got %d", got)
	}
	// A stopped manager ignores further reconciles.
	m.reconcile(settingsWith([]types.FolderName{"inbox"}, "one"))
	select {
	case key := <-started:
		t.Fatalf("stopped manager should not start loops: %+v", key)
	case <-time.After(100 * time.Millisecond):
	}
}
