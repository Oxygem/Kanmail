package services

import (
	"context"
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
		unsupported: map[types.AccountName]struct{}{},
		missing:     map[watchKey]struct{}{},
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
		s.Accounts = append(s.Accounts, types.AccountSettings{Name: types.AccountName(name)})
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

func TestReconcileSkipsMissingFolders(t *testing.T) {
	m, started := newTestWatchManager(t)

	m.markMissing(watchKey{"one", "archive"})
	m.reconcile(settingsWith([]types.FolderName{"inbox", "archive"}, "one"))

	// Only inbox should start; archive is known missing on the account.
	expectStarted(t, started, watchKey{"one", "inbox"})
	select {
	case key := <-started:
		t.Fatalf("missing folder should not start: %+v", key)
	case <-time.After(100 * time.Millisecond):
	}
}

func TestReconcileForgetsMissingWhenColumnRemoved(t *testing.T) {
	m, started := newTestWatchManager(t)

	m.markMissing(watchKey{"one", "archive"})
	// Column absent -> its missing marker is forgotten.
	m.reconcile(settingsWith([]types.FolderName{"inbox"}, "one"))
	expectStarted(t, started, watchKey{"one", "inbox"})

	// Re-adding the column now re-probes the folder (a loop starts).
	m.reconcile(settingsWith([]types.FolderName{"inbox", "archive"}, "one"))
	expectStarted(t, started, watchKey{"one", "archive"})
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
