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

func init() {
	profile := os.Getenv("KANMAIL_PROFILE")
	if profile != "" {
		appDirName = appDirName + "-" + profile
	}
}

type SettingsService struct {
	log          zerolog.Logger
	settingsFile string
	logFile      string

	settings     *types.Settings
	settingsLock sync.RWMutex

	appService *AppService
	keyring    *util.CachedKeyring

	AppDir   string
	CacheDir string
	LogsDir  string

	onPutSettingsCallbacks []func(context.Context, types.Settings) error
}

func NewSettingsService(log zerolog.Logger, logFilename string, appService *AppService, keyring *util.CachedKeyring) *SettingsService {
	dirs := appdir.New(appDirName)

	if err := os.MkdirAll(dirs.UserConfig(), os.ModePerm); err != nil {
		panic(err)
	} else if err := os.MkdirAll(dirs.UserCache(), os.ModePerm); err != nil {
		panic(err)
	} else if err := os.MkdirAll(dirs.UserLogs(), os.ModePerm); err != nil {
		panic(err)
	}

	emails.InitTLDCache(path.Join(dirs.UserCache(), "tldextract"))
	emails.InitTempDirForFailedDecodes(path.Join(dirs.UserCache(), "failed-decodes"))

	appService.SetDeviceID(dirs.UserConfig())

	return &SettingsService{
		log:     log.With().Str("component", "settings").Logger(),
		logFile: logFilename,

		settingsFile: path.Join(dirs.UserConfig(), settingsFilename),
		appService:   appService,
		keyring:      keyring,

		AppDir:   dirs.UserConfig(),
		CacheDir: dirs.UserCache(),
		LogsDir:  dirs.UserLogs(),
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

	s.settingsLock.RLock()
	defer s.settingsLock.RUnlock()

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
				if err := os.WriteFile(s.settingsFile, migrated, 0644); err != nil {
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
		s.settings = &settings
	}

	// Rewrite the accounts with secrets from keychain
	unhiddenAccounts := make([]types.AccountSettings, len(s.settings.Accounts))
	for i, account := range s.settings.Accounts {
		s.unhideConnectionSettings(account.Name, &account.IMAPSettings)
		s.unhideConnectionSettings(account.Name, &account.SMTPSettings)
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

	accountNames := make(map[types.AccountName]struct{}, len(settings.Accounts))
	hiddenAccounts := make([]types.AccountSettings, len(settings.Accounts))

	for i, account := range settings.Accounts {
		// Prevent duplicate account names (frontend responsible for preventing, hence panic)
		if _, found := accountNames[account.Name]; found {
			panic("settings contain duplicate account name")
		}
		accountNames[account.Name] = struct{}{}

		// Rewrite the accounts with references to secrets from keychain
		s.hideConnectionSettings(account.Name, &account.IMAPSettings)
		s.hideConnectionSettings(account.Name, &account.SMTPSettings)
		hiddenAccounts[i] = account
	}

	hiddenSettings := settings
	hiddenSettings.Accounts = hiddenAccounts

	if json, err := json.Marshal(hiddenSettings); err != nil {
		return err
	} else if err := os.WriteFile(s.settingsFile, json, 0644); err != nil {
		return err
	}

	// The frontend only ever holds redacted settings, so rehydrate secrets from the
	// keyring for the in-memory copy used to build accounts and run the callbacks
	unhiddenAccounts := make([]types.AccountSettings, len(settings.Accounts))
	for i, account := range settings.Accounts {
		s.unhideConnectionSettings(account.Name, &account.IMAPSettings)
		s.unhideConnectionSettings(account.Name, &account.SMTPSettings)
		unhiddenAccounts[i] = account
	}
	settings.Accounts = unhiddenAccounts

	s.settings = &settings
	s.appService.SendSettingsChangedEvent(ctx, redactSettings(settings))

	for _, f := range s.onPutSettingsCallbacks {
		if err := f(ctx, settings); err != nil {
			return fmt.Errorf("put setting callback error: %w", err)
		}
	}

	return nil
}

func (s *SettingsService) getKeyringUser(subservice string, name types.AccountName) string {
	// Include deviceID in keyring user so we don't use the wrong credentails on the wrong device,
	// ie if the users keychain is synced.
	return strings.Join([]string{s.appService.DeviceID, subservice, string(name)}, ".")
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

func (s *SettingsService) hideConnectionSettings(name types.AccountName, conn *types.ConnectionSettings) {
	conn.HasCredentials = false

	if conn.Password != "" {
		if err := s.keyring.Set(appDirName, s.getKeyringUser("email", name), conn.Password); err != nil {
			panic(err)
		}
		conn.Password = ""
	}

	if conn.OAuthRefreshToken != "" {
		if err := s.keyring.Set(appDirName, s.getKeyringUser("oauth", name), conn.OAuthRefreshToken); err != nil {
			panic(err)
		}
		conn.OAuthRefreshToken = ""
	}
}

func (s *SettingsService) unhideConnectionSettings(name types.AccountName, conn *types.ConnectionSettings) {
	conn.HasCredentials = false

	val, err := s.keyring.Get(appDirName, s.getKeyringUser("email", name))
	if err != nil && !errors.Is(err, keyring.ErrNotFound) {
		panic(err)
	}
	if val != "" {
		conn.Password = val
	}

	val, err = s.keyring.Get(appDirName, s.getKeyringUser("oauth", name))
	if err != nil && !errors.Is(err, keyring.ErrNotFound) {
		panic(err)
	}
	if val != "" {
		conn.OAuthRefreshToken = val
	}
}
