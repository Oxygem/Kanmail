package services

import (
	"context"
	"fmt"
	"strings"
	"sync"

	"github.com/rs/zerolog"

	"github.com/oxygem/kanmail/internal/caches"
	"github.com/oxygem/kanmail/internal/emails"
	"github.com/oxygem/kanmail/internal/emails/oauth"
	"github.com/oxygem/kanmail/internal/types"
	"github.com/oxygem/kanmail/internal/util"
)

type AccountsService struct {
	log          zerolog.Logger
	settings     *SettingsService
	caches       *caches.Caches
	accountsLock sync.Mutex
	accounts     map[types.AccountName]*emails.Account
}

func NewAccountsService(log zerolog.Logger, settings *SettingsService, caches *caches.Caches) *AccountsService {
	accountsService := &AccountsService{
		log:      log.With().Str("component", "accounts").Logger(),
		settings: settings,
		caches:   caches,
		accounts: make(map[types.AccountName]*emails.Account),
	}

	// Drop cached accounts on settings changes
	settings.addOnPutSettingsCallbacks(accountsService.ResetAccountsCache)
	return accountsService
}

func (a *AccountsService) ResetAccountsCache(ctx context.Context) error {
	a.accountsLock.Lock()
	defer a.accountsLock.Unlock()

	for _, account := range a.accounts {
		account.CloseConnections(ctx)
	}
	clear(a.accounts)
	return nil
}

func (a *AccountsService) GetOrCreateAccount(ctx context.Context, accountName types.AccountName) *emails.Account {
	// Get settings *before* locking, so we don't deadlock sync/paginate reqs against settings changes,
	// which can both happen rapidly while clicking through the folders in the sidebar.
	settings := a.settings.GetSettings(ctx)

	a.accountsLock.Lock()
	defer a.accountsLock.Unlock()

	if account, ok := a.accounts[accountName]; ok {
		return account
	}

	for _, accountSettings := range settings.Accounts {
		if accountSettings.Name == accountName {
			account := emails.NewAccount(accountSettings, a.caches)
			a.accounts[accountName] = account
			return account
		}
	}

	return nil
}

// Test new account settings and populate folder mappings and other account settings
func (a *AccountsService) TestAccountSettings(
	ctx context.Context,
	settings types.AccountSettings,
) (types.AccountSettings, error) {
	ctx = a.log.WithContext(ctx)
	defer util.LogPanic(ctx)

	tmpAccount := emails.NewAccount(settings, a.caches)

	if err := tmpAccount.FetchAndUpdateSettings(ctx); err != nil {
		return settings, types.WrapAccountSettingsError(settings, fmt.Errorf("failed to check IMAP connection: %w", err))
	}

	if err := tmpAccount.TestSMTPConnection(ctx); err != nil {
		return settings, types.WrapAccountSettingsError(settings, fmt.Errorf("failed to check SMTP connection: %w", err))
	}

	a.log.Info().Any("folders", tmpAccount.Folders).Msg("Configured account folders")
	return tmpAccount.AccountSettings, nil
}

// Autoconfigure account settings given a username (email) and password combination by attempting
// to pull the IMAP/SMTP config from ISPDB or MX DNS records.
type AutoconfigureOptions struct {
	Domain            string `json:"domain,omitempty"`
	Password          string `json:"password,omitempty"`
	OAuthProvider     string `json:"oauthProvider,omitempty"`
	OAuthRefreshToken string `json:"oauthRefreshToken,omitempty"`
}

func (a *AccountsService) AutoconfigureNewAccount(
	ctx context.Context,
	username string,
	options AutoconfigureOptions,
) (types.AccountSettings, error) {
	ctx = a.log.WithContext(ctx)
	defer util.LogPanic(ctx)

	if options.Domain == "" {
		bits := strings.Split(username, "@")
		options.Domain = bits[len(bits)-1]
	}

	settings, err := emails.GetAutoconfigSettingsForDomain(ctx, username, options.Domain)
	if err != nil {
		return settings, types.WrapAccountSettingsError(settings, err)
	}

	settings.IMAPSettings.Username = username
	settings.SMTPSettings.Username = username

	// Log settings before setting secrets
	a.log.Info().Any("settings", settings).Msg("Autoconfigured settings, testing login...")

	if options.Password != "" {
		settings.IMAPSettings.Password = options.Password
		settings.SMTPSettings.Password = options.Password
	}

	if options.OAuthProvider != "" {
		settings.IMAPSettings.OAuthProvider = options.OAuthProvider
		settings.IMAPSettings.OAuthRefreshToken = options.OAuthRefreshToken
		settings.SMTPSettings.OAuthProvider = options.OAuthProvider
		settings.SMTPSettings.OAuthRefreshToken = options.OAuthRefreshToken
	}

	return a.TestAccountSettings(ctx, settings)
}

func (a *AccountsService) StartOAuthRequest(
	ctx context.Context,
	provider string,
) (string, error) {
	uid, url, err := oauth.GetOAuthRequestURL(ctx, provider)
	if err != nil {
		return "", err
	}
	if err := util.OpenInBrowser(url); err != nil {
		return "", err
	}
	return uid, nil
}

func (a *AccountsService) GetOAuthResponse(
	ctx context.Context,
	uid string,
) (*oauth.OAuthResponse, error) {
	return oauth.GetOAuthResponse(ctx, uid)
}
