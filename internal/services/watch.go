package services

import (
	"context"
	"sync"
	"time"

	"github.com/rs/zerolog"

	"github.com/oxygem/kanmail/internal/emails"
	"github.com/oxygem/kanmail/internal/types"
	"github.com/oxygem/kanmail/internal/util"
)

const (
	watchInitialBackoff   = 5 * time.Second
	watchMaxBackoff       = 60 * time.Second
	watchUnavailableRetry = 5 * time.Second
)

type watchKey struct {
	account types.AccountName
	folder  types.FolderName
}

// FolderWatchManager owns one IMAP IDLE loop per displayed (account, folder),
// starting and stopping them as settings change. On a server-side change it
// emits a FolderSyncEvent and the frontend syncs that folder. The set of
// displayed folders lives in settings, so watching is driven entirely by the
// backend - the frontend no longer long-polls. Connection usage is unchanged:
// each idle borrows a pooled connection and yields it (via pool preemption) the
// moment interactive work or the follow-up sync needs it.
type FolderWatchManager struct {
	log      zerolog.Logger
	settings *SettingsService
	accounts *AccountsService
	app      *AppService

	// Seams, overridable in tests. emit reports a change to the frontend; run is
	// the per-folder loop body reconcile spawns.
	emit func(types.AccountName, types.FolderName)
	run  func(ctx context.Context, key watchKey)

	mu          sync.Mutex
	loops       map[watchKey]context.CancelFunc
	unsupported map[types.AccountName]struct{}
	missing     map[watchKey]struct{} // folders that don't exist on the account
	stopped     bool
}

func NewFolderWatchManager(
	log zerolog.Logger,
	settings *SettingsService,
	accounts *AccountsService,
	app *AppService,
) *FolderWatchManager {
	m := &FolderWatchManager{
		log:         log.With().Str("component", "watch").Logger(),
		settings:    settings,
		accounts:    accounts,
		app:         app,
		loops:       map[watchKey]context.CancelFunc{},
		unsupported: map[types.AccountName]struct{}{},
		missing:     map[watchKey]struct{}{},
	}
	m.emit = app.EmitFolderSync
	m.run = m.runLoop
	// Reconcile whenever columns or accounts change.
	settings.addOnPutSettingsCallbacks(func(ctx context.Context, s types.Settings) error {
		m.reconcile(s)
		return nil
	})
	return m
}

// Start opens watches for the current settings; call once the app is running.
func (m *FolderWatchManager) Start(ctx context.Context) {
	m.reconcile(m.settings.GetSettings(ctx))
}

// Stop cancels every loop; the manager is unusable afterwards.
func (m *FolderWatchManager) Stop() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.stopped = true
	for key, cancel := range m.loops {
		cancel()
		delete(m.loops, key)
	}
}

func (m *FolderWatchManager) reconcile(settings types.Settings) {
	desired := map[watchKey]struct{}{}
	for _, folder := range currentColumns(settings) {
		for _, account := range settings.Accounts {
			desired[watchKey{account.Name, folder}] = struct{}{}
		}
	}

	present := map[types.AccountName]struct{}{}
	for _, account := range settings.Accounts {
		present[account.Name] = struct{}{}
	}

	m.mu.Lock()
	defer m.mu.Unlock()
	if m.stopped {
		return
	}

	// Forget IDLE-unsupported markers for accounts no longer present, and
	// missing-folder markers for keys no longer displayed, so both are
	// re-probed if they come back.
	for account := range m.unsupported {
		if _, ok := present[account]; !ok {
			delete(m.unsupported, account)
		}
	}
	for key := range m.missing {
		if _, ok := desired[key]; !ok {
			delete(m.missing, key)
		}
	}

	// Stop + delete loops no longer desired, note we don't bother waiting for completion
	for key, cancel := range m.loops {
		if _, ok := desired[key]; !ok {
			cancel()
			delete(m.loops, key)
		}
	}

	// Start newly desired loops, skipping accounts known not to support IDLE
	for key := range desired {
		if _, running := m.loops[key]; running {
			continue
		}
		if _, unsupported := m.unsupported[key.account]; unsupported {
			continue
		}
		if _, missing := m.missing[key]; missing {
			continue
		}
		ctx, cancel := context.WithCancel(context.Background())
		m.loops[key] = cancel
		go m.runGuarded(ctx, key)
	}
}

// runGuarded wraps the loop body so a panic in the watch path takes down only
// this watch - it is reported, then the loop restarts after a delay - instead
// of crashing the whole app.
func (m *FolderWatchManager) runGuarded(ctx context.Context, key watchKey) {
	ctx = m.log.With().
		Str("account", string(key.account)).
		Str("folder", string(key.folder)).
		Logger().
		WithContext(ctx)

	for ctx.Err() == nil {
		if m.runOnce(ctx, key) {
			return
		}
		if !sleepCtx(ctx, watchMaxBackoff) {
			return
		}
	}
}

func (m *FolderWatchManager) runOnce(ctx context.Context, key watchKey) (finished bool) {
	defer func() {
		if err := recover(); err != nil {
			util.ReportPanic(ctx, err)
		}
	}()
	m.run(ctx, key)
	return true
}

func (m *FolderWatchManager) runLoop(ctx context.Context, key watchKey) {
	log := zerolog.Ctx(ctx)

	backoff := watchInitialBackoff

	// Consecutive network failures form one episode, aggregated for telemetry
	// when the watch recovers or fails some other way.
	var netErrCount int
	var lastNetErr error
	recordEpisode := func(recovered bool) {
		if lastNetErr != nil {
			util.RecordNetworkError(ctx, string(key.account), lastNetErr, netErrCount, recovered)
			lastNetErr = nil
			netErrCount = 0
		}
	}

	for ctx.Err() == nil {
		account := m.accounts.GetOrCreateAccount(ctx, key.account)
		if account == nil {
			if !sleepCtx(ctx, backoff) {
				return
			}
			backoff = min(backoff*2, watchMaxBackoff)
			continue
		}

		resp, err := account.WatchFolder(ctx, key.folder)
		if ctx.Err() != nil {
			return
		}
		if err != nil {
			if util.IsRetryableNetworkError(err) {
				lastNetErr = err
				netErrCount++
			} else {
				recordEpisode(false)
			}
			log.Warn().Err(err).Dur("backoff", backoff).Msg("Watch failed, retrying")
			if !sleepCtx(ctx, backoff) {
				return
			}
			backoff = min(backoff*2, watchMaxBackoff)
			continue
		}
		recordEpisode(true)
		backoff = watchInitialBackoff

		switch resp.Status {
		case emails.WatchStatusChanged:
			log.Debug().Msg("Folder changed, emitting sync event")
			m.emit(key.account, key.folder)
		case emails.WatchStatusUnsupported:
			log.Info().Msg("Account does not support IDLE, stopping watches")
			m.markUnsupported(key.account)
			return
		case emails.WatchStatusNoFolder:
			log.Info().Msg("Folder does not exist on account, stopping watch")
			m.markMissing(key)
			return
		case emails.WatchStatusUnavailable:
			// No spare pooled connection to idle on right now; the interval sync
			// covers the folder until one frees up.
			if !sleepCtx(ctx, watchUnavailableRetry) {
				return
			}
		case emails.WatchStatusCancelled:
			// Re-enter the loop (or exit via the cancelled context).
		}
	}
}

// markUnsupported records that an account can't IDLE and stops its folder loops,
// which would only reach the same conclusion.
func (m *FolderWatchManager) markUnsupported(account types.AccountName) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.unsupported[account] = struct{}{}
	for key, cancel := range m.loops {
		if key.account == account {
			cancel()
			delete(m.loops, key)
		}
	}
}

// markMissing records that the folder doesn't exist on the account and drops
// its loop. The marker is forgotten (and the folder re-probed) once reconcile
// sees the key leave the desired set.
func (m *FolderWatchManager) markMissing(key watchKey) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.missing[key] = struct{}{}
	if cancel, ok := m.loops[key]; ok {
		cancel()
		delete(m.loops, key)
	}
}

// currentColumns returns the folders displayed by the active column group.
func currentColumns(settings types.Settings) []types.FolderName {
	if len(settings.ColumnGroups) == 0 {
		return nil
	}
	idx := settings.CurrentColumnGroupIndex
	if idx < 0 || idx >= len(settings.ColumnGroups) {
		idx = 0
	}
	return settings.ColumnGroups[idx].Columns
}

// sleepCtx waits for d or until ctx is done; returns false if ctx ended.
func sleepCtx(ctx context.Context, d time.Duration) bool {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-t.C:
		return true
	case <-ctx.Done():
		return false
	}
}
