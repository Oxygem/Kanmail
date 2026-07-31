package services

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path"
	"strings"
	"sync"

	"github.com/google/uuid"
	"github.com/rs/zerolog"
	"github.com/zalando/go-keyring"

	"github.com/emersion/go-appdir"

	"github.com/oxygem/kanmail/internal/emails"
	"github.com/oxygem/kanmail/internal/types"
	"github.com/oxygem/kanmail/internal/util"
)

const settingsFilename = "settings.json"

// Figure out the app directory name - append KANMAIL_PROFILE if set
var appDirName = "com.oxygem.kanmail"
var profile string

func init() {
	profile = os.Getenv("KANMAIL_PROFILE")
	if profile != "" {
		appDirName = appDirName + "-" + profile
	}
}

// The noop profile uses an ephemeral temp dir so nothing persists between runs
func getAppDirs() (configDir, cacheDir, logsDir string) {
	if profile == "noop" {
		tempDir, err := os.MkdirTemp("", "kanmail-noop-")
		if err != nil {
			panic(err)
		}
		return path.Join(tempDir, "config"), path.Join(tempDir, "cache"), path.Join(tempDir, "logs")
	}

	dirs := appdir.New(appDirName)
	return dirs.UserConfig(), dirs.UserCache(), dirs.UserLogs()
}

type SettingsService struct {
	log          zerolog.Logger
	settingsFile string
	logFile      string

	settings     *types.Settings
	settingsLock sync.Mutex

	appService *AppService
	keyring    *util.CachedKeyring

	AppDir   string
	CacheDir string
	LogsDir  string

	onPutSettingsCallbacks []func(context.Context, types.Settings) error
}

func NewSettingsService(log zerolog.Logger, logFilename string, appService *AppService, keyring *util.CachedKeyring) *SettingsService {
	configDir, cacheDir, logsDir := getAppDirs()

	if err := os.MkdirAll(configDir, os.ModePerm); err != nil {
		panic(err)
	} else if err := os.MkdirAll(cacheDir, os.ModePerm); err != nil {
		panic(err)
	} else if err := os.MkdirAll(logsDir, os.ModePerm); err != nil {
		panic(err)
	}

	emails.InitTempDirForFailedDecodes(path.Join(cacheDir, "failed-decodes"))

	appService.SetDeviceID(configDir)

	return &SettingsService{
		log:     log.With().Str("component", "settings").Logger(),
		logFile: logFilename,

		settingsFile: path.Join(configDir, settingsFilename),
		appService:   appService,
		keyring:      keyring,

		AppDir:   configDir,
		CacheDir: cacheDir,
		LogsDir:  logsDir,
	}
}

func (s *SettingsService) GetLogFilename() string {
	return s.logFile
}

// GetSettings returns settings with account secrets redacted - this is the only form
// that crosses into frontend JS (the binding, the injected settings script and change
// events). Backend consumers needing credentials use getSettingsWithSecrets.
func (s *SettingsService) GetSettings(ctx context.Context) types.Settings {
	return redactSettings(s.getSettingsWithSecrets(ctx))
}

func (s *SettingsService) getSettingsWithSecrets(ctx context.Context) types.Settings {
	ctx = s.log.WithContext(ctx)
	defer util.LogAndPanic(ctx)

	s.settingsLock.Lock()
	defer s.settingsLock.Unlock()

	if s.settings == nil {
		settings := types.NewDefaultSettings()
		if b, err := os.ReadFile(s.settingsFile); err != nil {
			s.log.Warn().Err(err).Msg("Failed to read settings file")
			// A missing file is normal on first run; anything else is a corrupt or
			// unreadable settings file that we're about to silently reset to defaults.
			if !os.IsNotExist(err) {
				s.trackSettingsFileError("read")
			}
		} else {
			if migrated, didMigrate, err := types.MigrateSettingsJSON(b); err != nil {
				s.log.Err(err).Msg("Failed to migrate settings file")
				s.trackSettingsFileError("migrate")
			} else if didMigrate {
				b = migrated
				if err := s.writeFileAtomic(migrated); err != nil {
					s.log.Err(err).Msg("Failed to persist migrated settings file")
				} else {
					s.log.Info().Msg("Migrated columnGroups settings to ordered list")
				}
			}
			if err := json.Unmarshal(b, &settings); err != nil {
				s.log.Err(err).Msg("Failed to unmarshal settings file")
				s.trackSettingsFileError("unmarshal")
			}
			settings.ApplyDefaults()
		}
		// Runs before the unhide below so the persisted form never contains
		// secrets - at this point settings is exactly the redacted on-disk form
		s.ensureAccountIDs(&settings)
		s.settings = &settings
	}

	// Rewrite the accounts with secrets from keychain. Keyring failures degrade to
	// missing credentials (surfacing as an auth failure on the account) because this
	// path has no error return - a transient keychain error must not crash the app.
	unhiddenAccounts := make([]types.AccountSettings, len(s.settings.Accounts))
	for i, account := range s.settings.Accounts {
		if err := errors.Join(
			s.unhideConnectionSettings(account.ID, &account.IMAPSettings),
			s.unhideConnectionSettings(account.ID, &account.SMTPSettings),
		); err != nil {
			s.log.Err(err).Str("account", string(account.Name)).Msg("Failed to load account credentials from keyring")
		}
		unhiddenAccounts[i] = account
	}

	// Copy settings, switch accounts
	outSettings := *s.settings
	outSettings.Accounts = unhiddenAccounts

	// Ensure analytics setting on AppService
	s.appService.SetAnalyticsEnabled(s.settings.System.ShareAnalytics)

	return outSettings
}

// trackSettingsFileError reports a corrupt/unreadable settings file to analytics.
// Fire-and-forget on a detached context so a slow backend cannot block settings
// reads while the lock is held. The stage records which phase failed.
func (s *SettingsService) trackSettingsFileError(stage string) {
	go func() {
		_ = s.appService.TrackAnalytics(context.Background(), "SettingsFileError", map[string]any{
			"stage": stage,
		})
	}()
}

func (s *SettingsService) addOnPutSettingsCallbacks(f func(context.Context, types.Settings) error) {
	s.onPutSettingsCallbacks = append(s.onPutSettingsCallbacks, f)
}

func (s *SettingsService) PutSettings(ctx context.Context, settings types.Settings) error {
	ctx = s.log.WithContext(ctx)
	defer util.LogAndPanic(ctx)

	s.settingsLock.Lock()
	defer s.settingsLock.Unlock()

	settings.ApplyDefaults()

	// The backend mints account identity - the frontend sends new accounts without one
	for i := range settings.Accounts {
		if settings.Accounts[i].ID == "" {
			settings.Accounts[i].ID = types.AccountID(uuid.NewString())
		}
	}

	accountIDs := make(map[types.AccountID]struct{}, len(settings.Accounts))
	hiddenAccounts := make([]types.AccountSettings, len(settings.Accounts))

	for i, account := range settings.Accounts {
		// Duplicate IDs can only be a frontend bug (eg copying an account wholesale)
		if _, found := accountIDs[account.ID]; found {
			panic("settings contain duplicate account ID")
		}
		accountIDs[account.ID] = struct{}{}

		// Rewrite the accounts with references to secrets from keychain
		if err := errors.Join(
			s.hideConnectionSettings(account.ID, &account.IMAPSettings),
			s.hideConnectionSettings(account.ID, &account.SMTPSettings),
		); err != nil {
			return fmt.Errorf("failed to store credentials for account %s: %w", account.Name, err)
		}
		hiddenAccounts[i] = account
	}

	hiddenSettings := settings
	hiddenSettings.Accounts = hiddenAccounts

	if err := s.writeSettingsFile(hiddenSettings); err != nil {
		return err
	}

	// The frontend only ever holds redacted settings, so rehydrate secrets from the
	// keyring for the in-memory copy used to build accounts and run the callbacks
	unhiddenAccounts := make([]types.AccountSettings, len(settings.Accounts))
	for i, account := range settings.Accounts {
		if err := errors.Join(
			s.unhideConnectionSettings(account.ID, &account.IMAPSettings),
			s.unhideConnectionSettings(account.ID, &account.SMTPSettings),
		); err != nil {
			return fmt.Errorf("failed to load credentials for account %s: %w", account.Name, err)
		}
		unhiddenAccounts[i] = account
	}
	settings.Accounts = unhiddenAccounts

	s.settings = &settings

	s.appService.clearAccountAuthErrors()
	s.appService.SendSettingsChangedEvent(ctx, redactSettings(settings))

	for _, f := range s.onPutSettingsCallbacks {
		if err := f(ctx, settings); err != nil {
			return fmt.Errorf("put setting callback error: %w", err)
		}
	}

	return nil
}

func (s *SettingsService) getKeyringUser(subservice string, id types.AccountID) string {
	// Include deviceID in keyring user so we don't use the wrong credentails on the wrong device,
	// ie if the users keychain is synced.
	return strings.Join([]string{s.appService.DeviceID, subservice, string(id)}, ".")
}

// Keyring user for the pre-AccountID scheme, where entries were keyed by the
// (then unique) account name. Only used to migrate old entries.
func (s *SettingsService) getLegacyKeyringUser(subservice string, name types.AccountName) string {
	return strings.Join([]string{s.appService.DeviceID, subservice, string(name)}, ".")
}

func (s *SettingsService) writeSettingsFile(settings types.Settings) error {
	b, err := json.Marshal(settings)
	if err != nil {
		return err
	}
	return s.writeFileAtomic(b)
}

func (s *SettingsService) writeFileAtomic(b []byte) error {
	dir := path.Dir(s.settingsFile)

	f, err := os.CreateTemp(dir, path.Base(s.settingsFile)+".tmp-*")
	if err != nil {
		return err
	}
	tmpName := f.Name()
	defer os.Remove(tmpName) // no-op once the rename below succeeds

	if _, err := f.Write(b); err != nil {
		f.Close()
		return err
	}
	if err := f.Sync(); err != nil {
		f.Close()
		return err
	}
	if err := f.Close(); err != nil {
		return err
	}
	if err := os.Chmod(tmpName, 0644); err != nil {
		return err
	}
	if err := os.Rename(tmpName, s.settingsFile); err != nil {
		return err
	}

	// Fsync the directory so the rename itself is durable - without this the
	// file can still be missing entirely after a crash
	if d, err := os.Open(dir); err == nil {
		defer d.Close()
		if err := d.Sync(); err != nil {
			s.log.Warn().Err(err).Msg("Settings directory sync failed")
		}
	}
	return nil
}

func redactSettings(settings types.Settings) types.Settings {
	accounts := make([]types.AccountSettings, len(settings.Accounts))
	for i, account := range settings.Accounts {
		redactConnectionSettings(&account.IMAPSettings)
		redactConnectionSettings(&account.SMTPSettings)
		accounts[i] = account
	}
	settings.Accounts = accounts
	return settings
}

func redactConnectionSettings(conn *types.ConnectionSettings) {
	conn.HasCredentials = conn.Password != "" || conn.OAuthRefreshToken != ""
	conn.Password = ""
	conn.OAuthRefreshToken = ""
}

func (s *SettingsService) hideConnectionSettings(id types.AccountID, conn *types.ConnectionSettings) error {
	conn.HasCredentials = false

	if conn.Password != "" {
		if err := s.keyring.Set(appDirName, s.getKeyringUser("email", id), conn.Password); err != nil {
			return fmt.Errorf("failed to store password in keyring: %w", err)
		}
		conn.Password = ""
	}

	if conn.OAuthRefreshToken != "" {
		if err := s.keyring.Set(appDirName, s.getKeyringUser("oauth", id), conn.OAuthRefreshToken); err != nil {
			return fmt.Errorf("failed to store OAuth token in keyring: %w", err)
		}
		conn.OAuthRefreshToken = ""
	}
	return nil
}

var keyringSubservices = []string{"email", "oauth"}

// ensureAccountIDs migrates settings to the stable-AccountID scheme: accounts
// without an ID get one minted, their keyring entries move from the legacy
// name-derived keys to ID keys, and CurrentAccount (previously a name) is
// remapped. Legacy keyring entries are only deleted once the IDs are safely on
// disk; the heal sweep below finishes any migration interrupted by a crash or
// keyring error on a previous run, so partial migrations always converge.
func (s *SettingsService) ensureAccountIDs(settings *types.Settings) {
	changed := false
	var deferredDeletes []string

	for i := range settings.Accounts {
		account := &settings.Accounts[i]

		if account.ID == "" {
			account.ID = types.AccountID(uuid.NewString())
			changed = true
			for _, subservice := range keyringSubservices {
				legacyUser := s.getLegacyKeyringUser(subservice, account.Name)
				if migrated, err := s.copyKeyringEntry(legacyUser, s.getKeyringUser(subservice, account.ID)); err != nil {
					// Leave the legacy entry in place - the heal sweep retries next run
					s.log.Err(err).Str("account", string(account.Name)).Msg("Failed to migrate keyring entry to account ID")
				} else if migrated {
					deferredDeletes = append(deferredDeletes, legacyUser)
				}
			}
			if settings.CurrentAccount == string(account.Name) {
				settings.CurrentAccount = string(account.ID)
			}
			continue
		}

		// Heal sweep: an ID exists but a credential may still live under the
		// legacy key if a previous migration was interrupted
		for _, subservice := range keyringSubservices {
			idUser := s.getKeyringUser(subservice, account.ID)
			if _, err := s.keyring.Get(appDirName, idUser); !errors.Is(err, keyring.ErrNotFound) {
				continue
			}
			legacyUser := s.getLegacyKeyringUser(subservice, account.Name)
			if migrated, err := s.copyKeyringEntry(legacyUser, idUser); err != nil {
				s.log.Err(err).Str("account", string(account.Name)).Msg("Failed to heal keyring entry migration")
			} else if migrated {
				// The ID is already durable, safe to delete immediately
				if err := s.keyring.Delete(appDirName, legacyUser); err != nil {
					s.log.Err(err).Str("account", string(account.Name)).Msg("Failed to delete legacy keyring entry")
				}
			}
		}
	}

	if !changed {
		return
	}

	// CurrentAccount referencing a since-deleted account falls back to all accounts
	validCurrent := settings.CurrentAccount == ""
	for i := range settings.Accounts {
		if settings.CurrentAccount == string(settings.Accounts[i].ID) {
			validCurrent = true
		}
	}
	if !validCurrent {
		settings.CurrentAccount = ""
	}

	if err := s.writeSettingsFile(*settings); err != nil {
		// Without the IDs on disk the next run mints fresh ones, so the legacy
		// keyring entries must survive to be copied again
		s.log.Err(err).Msg("Failed to persist settings with account IDs")
		return
	}
	for _, user := range deferredDeletes {
		if err := s.keyring.Delete(appDirName, user); err != nil {
			s.log.Err(err).Str("user", user).Msg("Failed to delete legacy keyring entry")
		}
	}
}

// copyKeyringEntry copies a keyring entry, reporting whether there was one to
// copy. An existing destination entry is never overwritten.
func (s *SettingsService) copyKeyringEntry(fromUser, toUser string) (bool, error) {
	val, err := s.keyring.Get(appDirName, fromUser)
	if errors.Is(err, keyring.ErrNotFound) {
		return false, nil
	} else if err != nil {
		return false, fmt.Errorf("failed to read keyring entry: %w", err)
	}

	if _, err := s.keyring.Get(appDirName, toUser); errors.Is(err, keyring.ErrNotFound) {
		if err := s.keyring.Set(appDirName, toUser, val); err != nil {
			return false, fmt.Errorf("failed to store keyring entry: %w", err)
		}
	} else if err != nil {
		return false, fmt.Errorf("failed to check keyring entry: %w", err)
	}
	return true, nil
}

// deleteAccountSecrets best-effort removes an account's keyring entries when
// the account is deleted.
func (s *SettingsService) deleteAccountSecrets(id types.AccountID) {
	for _, subservice := range keyringSubservices {
		if err := s.keyring.Delete(appDirName, s.getKeyringUser(subservice, id)); err != nil && !errors.Is(err, keyring.ErrNotFound) {
			s.log.Err(err).Str("accountID", string(id)).Msg("Failed to delete account keyring entry")
		}
	}
}

func (s *SettingsService) unhideConnectionSettings(id types.AccountID, conn *types.ConnectionSettings) error {
	conn.HasCredentials = false

	val, err := s.keyring.Get(appDirName, s.getKeyringUser("email", id))
	if err != nil && !errors.Is(err, keyring.ErrNotFound) {
		return fmt.Errorf("failed to read password from keyring: %w", err)
	}
	if val != "" {
		conn.Password = val
	}

	val, err = s.keyring.Get(appDirName, s.getKeyringUser("oauth", id))
	if err != nil && !errors.Is(err, keyring.ErrNotFound) {
		return fmt.Errorf("failed to read OAuth token from keyring: %w", err)
	}
	if val != "" {
		conn.OAuthRefreshToken = val
	}
	return nil
}
