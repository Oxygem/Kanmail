package services

import (
	"context"
	"encoding/json"
	"os"
	"path"
	"strings"
	"testing"

	"github.com/rs/zerolog"
	"github.com/zalando/go-keyring"

	"github.com/oxygem/kanmail/internal/types"
	"github.com/oxygem/kanmail/internal/util"
)

func newTestSettingsService(t *testing.T) *SettingsService {
	t.Helper()
	keyring.MockInit()
	return &SettingsService{
		log:          zerolog.Nop(),
		settingsFile: path.Join(t.TempDir(), settingsFilename),
		keyring:      util.NewCachedKeyring(),
		appService:   &AppService{DeviceID: "test-device"},
	}
}

func (s *SettingsService) mustSetKeyringEntry(t *testing.T, user, value string) {
	t.Helper()
	if err := s.keyring.Set(appDirName, user, value); err != nil {
		t.Fatalf("failed to seed keyring: %v", err)
	}
}

func (s *SettingsService) keyringEntry(t *testing.T, user string) (string, bool) {
	t.Helper()
	val, err := s.keyring.Get(appDirName, user)
	if err != nil {
		return "", false
	}
	return val, true
}

func TestEnsureAccountIDs(t *testing.T) {
	s := newTestSettingsService(t)
	s.mustSetKeyringEntry(t, s.getLegacyKeyringUser("email", "work"), "secret")
	s.mustSetKeyringEntry(t, s.getLegacyKeyringUser("oauth", "work"), "token")

	settings := types.Settings{
		Accounts:       []types.AccountSettings{{Name: "work"}, {Name: "personal"}},
		CurrentAccount: "work",
	}
	s.ensureAccountIDs(&settings)

	workID := settings.Accounts[0].ID
	if workID == "" || settings.Accounts[1].ID == "" {
		t.Fatal("accounts should be assigned IDs")
	}
	if workID == settings.Accounts[1].ID {
		t.Fatal("accounts should get distinct IDs")
	}
	if settings.CurrentAccount != string(workID) {
		t.Fatalf("CurrentAccount should be remapped to the ID, got %q", settings.CurrentAccount)
	}

	if val, ok := s.keyringEntry(t, s.getKeyringUser("email", workID)); !ok || val != "secret" {
		t.Fatal("password should be migrated to the ID key")
	}
	if val, ok := s.keyringEntry(t, s.getKeyringUser("oauth", workID)); !ok || val != "token" {
		t.Fatal("OAuth token should be migrated to the ID key")
	}
	if _, ok := s.keyringEntry(t, s.getLegacyKeyringUser("email", "work")); ok {
		t.Fatal("legacy entry should be deleted after successful persist")
	}

	b, err := os.ReadFile(s.settingsFile)
	if err != nil {
		t.Fatalf("settings file should be persisted: %v", err)
	}
	if strings.Contains(string(b), "secret") || strings.Contains(string(b), "token") {
		t.Fatal("persisted settings must not contain secrets")
	}
	var persisted types.Settings
	if err := json.Unmarshal(b, &persisted); err != nil {
		t.Fatalf("persisted settings unreadable: %v", err)
	}
	if persisted.Accounts[0].ID != workID {
		t.Fatal("persisted settings should contain the assigned IDs")
	}
}

func TestEnsureAccountIDsIdempotent(t *testing.T) {
	s := newTestSettingsService(t)

	settings := types.Settings{Accounts: []types.AccountSettings{{Name: "work"}}}
	s.ensureAccountIDs(&settings)
	id := settings.Accounts[0].ID

	if err := os.Remove(s.settingsFile); err != nil {
		t.Fatal(err)
	}
	s.ensureAccountIDs(&settings)

	if settings.Accounts[0].ID != id {
		t.Fatal("existing IDs must be stable")
	}
	if _, err := os.Stat(s.settingsFile); !os.IsNotExist(err) {
		t.Fatal("no-op run should not rewrite the settings file")
	}
}

func TestEnsureAccountIDsHealsPartialMigration(t *testing.T) {
	s := newTestSettingsService(t)
	// An ID is on disk but a previous run failed to move the credential
	s.mustSetKeyringEntry(t, s.getLegacyKeyringUser("email", "work"), "secret")

	settings := types.Settings{Accounts: []types.AccountSettings{{ID: "existing-id", Name: "work"}}}
	s.ensureAccountIDs(&settings)

	if val, ok := s.keyringEntry(t, s.getKeyringUser("email", "existing-id")); !ok || val != "secret" {
		t.Fatal("credential should be healed onto the ID key")
	}
	if _, ok := s.keyringEntry(t, s.getLegacyKeyringUser("email", "work")); ok {
		t.Fatal("legacy entry should be deleted after healing")
	}
}

func TestEnsureAccountIDsDoesNotClobberExistingIDKey(t *testing.T) {
	s := newTestSettingsService(t)
	s.mustSetKeyringEntry(t, s.getKeyringUser("email", "existing-id"), "current")
	s.mustSetKeyringEntry(t, s.getLegacyKeyringUser("email", "work"), "stale")

	settings := types.Settings{Accounts: []types.AccountSettings{{ID: "existing-id", Name: "work"}}}
	s.ensureAccountIDs(&settings)

	if val, _ := s.keyringEntry(t, s.getKeyringUser("email", "existing-id")); val != "current" {
		t.Fatalf("ID-keyed entry must never be overwritten, got %q", val)
	}
}

func TestPutSettingsMintsIDsAndAllowsDuplicateNames(t *testing.T) {
	s := newTestSettingsService(t)

	settings := types.Settings{Accounts: []types.AccountSettings{
		{Name: "same", IMAPSettings: types.ConnectionSettings{Password: "one"}},
		{Name: "same", IMAPSettings: types.ConnectionSettings{Password: "two"}},
	}}
	if err := s.PutSettings(context.Background(), settings); err != nil {
		t.Fatalf("put failed: %v", err)
	}

	stored := s.getSettingsWithSecrets(context.Background())
	one, two := stored.Accounts[0], stored.Accounts[1]
	if one.ID == "" || two.ID == "" || one.ID == two.ID {
		t.Fatalf("accounts should get distinct minted IDs, got %q and %q", one.ID, two.ID)
	}
	if one.IMAPSettings.Password != "one" || two.IMAPSettings.Password != "two" {
		t.Fatal("secrets should be stored and rehydrated per account ID")
	}
}

func TestPutSettingsKeepsCredentialsAcrossRename(t *testing.T) {
	s := newTestSettingsService(t)

	settings := types.Settings{Accounts: []types.AccountSettings{
		{Name: "before", IMAPSettings: types.ConnectionSettings{Password: "secret"}},
	}}
	if err := s.PutSettings(context.Background(), settings); err != nil {
		t.Fatalf("put failed: %v", err)
	}
	id := s.getSettingsWithSecrets(context.Background()).Accounts[0].ID

	// The frontend renames the account, sending redacted connection settings
	renamed := types.Settings{Accounts: []types.AccountSettings{{ID: id, Name: "after"}}}
	if err := s.PutSettings(context.Background(), renamed); err != nil {
		t.Fatalf("put failed: %v", err)
	}

	stored := s.getSettingsWithSecrets(context.Background())
	if stored.Accounts[0].Name != "after" {
		t.Fatalf("name should be updated, got %q", stored.Accounts[0].Name)
	}
	if stored.Accounts[0].IMAPSettings.Password != "secret" {
		t.Fatal("credentials must survive a rename")
	}
}

func TestDeleteAccountSecrets(t *testing.T) {
	s := newTestSettingsService(t)
	s.mustSetKeyringEntry(t, s.getKeyringUser("email", "acct-id"), "secret")
	s.mustSetKeyringEntry(t, s.getKeyringUser("oauth", "acct-id"), "token")

	s.deleteAccountSecrets("acct-id")

	if _, ok := s.keyringEntry(t, s.getKeyringUser("email", "acct-id")); ok {
		t.Fatal("password entry should be deleted")
	}
	if _, ok := s.keyringEntry(t, s.getKeyringUser("oauth", "acct-id")); ok {
		t.Fatal("OAuth entry should be deleted")
	}
}
