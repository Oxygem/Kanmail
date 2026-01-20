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

	AppDir   string
	CacheDir string
	LogsDir  string

	onPutSettingsCallbacks []func(context.Context) error
}

func NewSettingsService(log zerolog.Logger, logFilename string, appService *AppService) *SettingsService {
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

		AppDir:   dirs.UserConfig(),
		CacheDir: dirs.UserCache(),
		LogsDir:  dirs.UserLogs(),
	}
}

func (s *SettingsService) GetLogFilename() string {
	return s.logFile
}

func (s *SettingsService) GetSettings(ctx context.Context) types.Settings {
	ctx = s.log.WithContext(ctx)
	defer util.LogPanic(ctx)

	s.settingsLock.RLock()
	defer s.settingsLock.RUnlock()

	if s.settings == nil {
		settings := types.NewDefaultSettings()
		if b, err := os.ReadFile(s.settingsFile); err != nil {
			s.log.Warn().Err(err).Msg("Failed to read settings file")
		} else if err := json.Unmarshal(b, &settings); err != nil {
			s.log.Err(err).Msg("Failed to unmarshal settings file")
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

	return outSettings
}

func (s *SettingsService) addOnPutSettingsCallbacks(f func(context.Context) error) {
	s.onPutSettingsCallbacks = append(s.onPutSettingsCallbacks, f)
}

func (s *SettingsService) PutSettings(ctx context.Context, settings types.Settings) {
	ctx = s.log.WithContext(ctx)
	defer util.LogPanic(ctx)

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
		panic(err)
	} else if err := os.WriteFile(s.settingsFile, json, 0644); err != nil {
		panic(err)
	}

	s.settings = &settings
	s.appService.SendSettingsChangedEvent(ctx, settings)

	for _, f := range s.onPutSettingsCallbacks {
		if err := f(ctx); err != nil {
			panic(fmt.Errorf("put setting callback error: %w", err))
		}
	}
}

func (s *SettingsService) getKeyringUser(subservice string, name types.AccountName) string {
	// Include deviceID in keyring user so we don't use the wrong credentails on the wrong device,
	// ie if the users keychain is synced.
	return strings.Join([]string{s.appService.DeviceID, subservice, string(name)}, ".")
}

func (s *SettingsService) hideConnectionSettings(name types.AccountName, conn *types.ConnectionSettings) {
	if conn.Password != "" {
		if err := keyring.Set(appDirName, s.getKeyringUser("email", name), conn.Password); err != nil {
			panic(err)
		}
		conn.Password = ""
	}

	if conn.OAuthRefreshToken != "" {
		if err := keyring.Set(appDirName, s.getKeyringUser("oauth", name), conn.OAuthRefreshToken); err != nil {
			panic(err)
		}
		conn.OAuthRefreshToken = ""
	}
}

func (s *SettingsService) unhideConnectionSettings(name types.AccountName, conn *types.ConnectionSettings) {
	val, err := keyring.Get(appDirName, s.getKeyringUser("email", name))
	if err != nil && !errors.Is(err, keyring.ErrNotFound) {
		panic(err)
	}
	if val != "" {
		conn.Password = val
	}

	val, err = keyring.Get(appDirName, s.getKeyringUser("oauth", name))
	if err != nil && !errors.Is(err, keyring.ErrNotFound) {
		panic(err)
	}
	if val != "" {
		conn.OAuthRefreshToken = val
	}
}
