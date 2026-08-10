package services

import (
	"context"
	"errors"
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
	accounts     map[types.AccountID]*emails.Account

	// GetOrCreateAccount reads outside the lock, we use generations
	generation uint64
}

func NewAccountsService(log zerolog.Logger, settings *SettingsService, caches *caches.Caches) *AccountsService {
	accountsService := &AccountsService{
		log:      log.With().Str("component", "accounts").Logger(),
		settings: settings,
		caches:   caches,
		accounts: make(map[types.AccountID]*emails.Account),
	}

	// Drop cached accounts on settings changes
	settings.addOnPutSettingsCallbacks(accountsService.ResetAccountsCache)
	return accountsService
}

// ResetAccountsCache drops cached accounts whose settings changed or that were
// removed. Unchanged accounts keep their connections (pools and IDLE watchers)
// alive - most settings changes don't touch accounts at all.
func (a *AccountsService) ResetAccountsCache(ctx context.Context, settings types.Settings) error {
	newSettings := make(map[types.AccountID]types.AccountSettings, len(settings.Accounts))
	for _, accountSettings := range settings.Accounts {
		newSettings[accountSettings.ID] = accountSettings
	}

	a.accountsLock.Lock()
	defer a.accountsLock.Unlock()
	a.generation++

	for id, account := range a.accounts {
		if accountSettings, ok := newSettings[id]; ok &&
			!account.AccountSettings.NeedsReconnect(accountSettings) {
			continue
		}
		a.log.Info().
			Str("account", string(account.Name)).
			Msg("Account settings changed, closing connections")
		account.CloseConnections(ctx)
		delete(a.accounts, id)
	}
	return nil
}

func (a *AccountsService) AfterDeleteAccount(ctx context.Context, accountID types.AccountID) error {
	a.accountsLock.Lock()
	defer a.accountsLock.Unlock()
	a.generation++

	// Remove any cached account
	if account, ok := a.accounts[accountID]; ok {
		account.CloseConnections(ctx)
		delete(a.accounts, accountID)
	}

	a.settings.deleteAccountSecrets(accountID)

	// Delete the folder from the cache
	return a.caches.DeleteByAccount(ctx, accountID)
}

func (a *AccountsService) CloseAccount(ctx context.Context, accountID types.AccountID) {
	a.accountsLock.Lock()
	a.generation++
	account, ok := a.accounts[accountID]
	delete(a.accounts, accountID)
	a.accountsLock.Unlock()

	if ok {
		account.CloseConnections(ctx)
	}
}

func (a *AccountsService) GetOrCreateAccount(ctx context.Context, accountID types.AccountID) *emails.Account {
	// We can't hold accountsLock for the entire function because it deadlocks w/settings writes:
	// GetOrCreateAccount -> accountsLock -> settingsLock via getSettingsWithSecrets
	// PutSettings -> settingsLock -> accountsLock via ResetAccountsCache
	for {
		a.accountsLock.Lock()
		if account, ok := a.accounts[accountID]; ok {
			a.accountsLock.Unlock()
			return account
		}
		generation := a.generation
		a.accountsLock.Unlock()

		// Get settings *without* holding the lock, so we don't deadlock sync/paginate reqs against
		// settings changes, which can both happen rapidly while clicking through the folders in the
		// sidebar. The generation check below catches the snapshot going stale in the meantime.
		settings := a.settings.getSettingsWithSecrets(ctx)

		var accountSettings *types.AccountSettings
		for i := range settings.Accounts {
			if settings.Accounts[i].ID == accountID {
				accountSettings = &settings.Accounts[i]
				break
			}
		}
		if accountSettings == nil {
			// Deleted or unknown - never build (or resurrect) an account for it
			return nil
		}

		a.accountsLock.Lock()
		if account, ok := a.accounts[accountID]; ok {
			a.accountsLock.Unlock()
			return account
		}
		if a.generation != generation {
			// Accounts were invalidated while we read settings - our snapshot may
			// predate the change, so re-read rather than cache stale settings
			a.accountsLock.Unlock()
			continue
		}
		account := emails.NewAccount(*accountSettings, a.caches)
		a.accounts[accountID] = account
		a.accountsLock.Unlock()
		return account
	}
}

// Test new account settings and populate folder mappings and other account settings
func (a *AccountsService) TestAccountSettings(
	ctx context.Context,
	settings types.AccountSettings,
) (types.AccountSettings, error) {
	ctx = a.log.WithContext(ctx)
	defer util.LogAndPanic(ctx)

	// The frontend never holds existing secrets, so an unchanged password/token arrives
	// empty - fill from the keyring for the test, restoring the as-sent values in the
	// returned settings so secrets stay out of the frontend
	testSettings := settings
	if err := errors.Join(
		a.fillConnectionSecretsIfEmpty(settings.ID, &testSettings.IMAPSettings),
		a.fillConnectionSecretsIfEmpty(settings.ID, &testSettings.SMTPSettings),
	); err != nil {
		return settings, types.WrapAccountSettingsError(settings, err)
	}

	tmpAccount := emails.NewAccount(testSettings, a.caches)
	// The test account opens real IMAP/SMTP sessions - close them regardless of
	// outcome, it's thrown away either way
	defer tmpAccount.CloseConnections(ctx)

	if err := tmpAccount.FetchAndUpdateSettings(ctx); err != nil {
		return settings, types.WrapAccountSettingsError(settings, fmt.Errorf("failed to check IMAP connection: %w", err))
	}

	if err := tmpAccount.TestSMTPConnection(ctx); err != nil {
		return settings, types.WrapAccountSettingsError(settings, fmt.Errorf("failed to check SMTP connection: %w", err))
	}

	a.log.Info().Any("folders", tmpAccount.Folders).Msg("Configured account folders")

	updatedSettings := tmpAccount.AccountSettings
	updatedSettings.IMAPSettings.Password = settings.IMAPSettings.Password
	updatedSettings.IMAPSettings.OAuthRefreshToken = settings.IMAPSettings.OAuthRefreshToken
	updatedSettings.SMTPSettings.Password = settings.SMTPSettings.Password
	updatedSettings.SMTPSettings.OAuthRefreshToken = settings.SMTPSettings.OAuthRefreshToken
	return updatedSettings, nil
}

func (a *AccountsService) fillConnectionSecretsIfEmpty(
	id types.AccountID,
	conn *types.ConnectionSettings,
) error {
	// New accounts have no ID yet - their secrets always arrive as-sent
	if id == "" {
		return nil
	}
	if conn.Password == "" && conn.OAuthRefreshToken == "" {
		return a.settings.unhideConnectionSettings(id, conn)
	}
	return nil
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
	defer util.LogAndPanic(ctx)

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

type OAuthRequest struct {
	UID string `json:"uid"`
	URL string `json:"url"`
}

func (a *AccountsService) StartOAuthRequest(
	ctx context.Context,
	provider string,
) (*OAuthRequest, error) {
	uid, url, err := oauth.GetOAuthRequestURL(ctx, provider)
	if err != nil {
		return nil, err
	}
	if err := util.OpenInBrowser(url); err != nil {
		return nil, err
	}
	return &OAuthRequest{uid, url}, nil
}

func (a *AccountsService) GetOAuthResponse(
	ctx context.Context,
	uid string,
) (*oauth.OAuthResponse, error) {
	return oauth.GetOAuthResponse(ctx, uid)
}
