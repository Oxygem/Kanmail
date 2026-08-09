package services

import (
	"context"
	"testing"

	"github.com/rs/zerolog"

	"github.com/oxygem/kanmail/internal/emails"
	"github.com/oxygem/kanmail/internal/types"
)

func makeAccountSettings(name string) types.AccountSettings {
	settings := types.AccountSettings{
		ID:   types.AccountID(name + "-id"),
		Name: types.AccountName(name),
		IMAPSettings: types.ConnectionSettings{
			Username: name + "@test.local",
			Host:     "localhost",
			Port:     993,
			Password: "secret",
			SSL:      true,
		},
	}
	settings.Folders.Inbox = "INBOX"
	return settings
}

func TestResetAccountsCacheIgnoresPresentationalChanges(t *testing.T) {
	one := makeAccountSettings("one")

	service := &AccountsService{
		log:      zerolog.Nop(),
		accounts: map[types.AccountID]*emails.Account{"one-id": emails.NewAccount(one, nil)},
	}
	accountOne := service.accounts["one-id"]

	// Signature/accent colour are frontend-only, so editing them must not drop
	// the account's connections and IDLE watchers
	presentational := makeAccountSettings("one")
	presentational.Settings.AccentColor = "#ff0000"
	signature := "<div>Regards</div>"
	presentational.Settings.Signature = &signature
	if err := service.ResetAccountsCache(context.Background(), types.Settings{
		Accounts: []types.AccountSettings{presentational},
	}); err != nil {
		t.Fatalf("reset failed: %v", err)
	}
	if service.accounts["one-id"] != accountOne {
		t.Fatal("presentational changes should keep the account")
	}

	// ...but a setting the backend actually reads still drops it
	functional := makeAccountSettings("one")
	functional.Settings.SaveSentCopies = true
	if err := service.ResetAccountsCache(context.Background(), types.Settings{
		Accounts: []types.AccountSettings{functional},
	}); err != nil {
		t.Fatalf("reset failed: %v", err)
	}
	if _, ok := service.accounts["one-id"]; ok {
		t.Fatal("functional changes should drop the account")
	}
}

func TestResetAccountsCacheKeepsUnchangedAccounts(t *testing.T) {
	one := makeAccountSettings("one")
	two := makeAccountSettings("two")

	service := &AccountsService{
		log: zerolog.Nop(),
		accounts: map[types.AccountID]*emails.Account{
			"one-id": emails.NewAccount(one, nil),
			"two-id": emails.NewAccount(two, nil),
		},
	}
	accountOne := service.accounts["one-id"]

	// Unrelated settings change: both accounts unchanged
	if err := service.ResetAccountsCache(context.Background(), types.Settings{
		Accounts: []types.AccountSettings{one, two},
	}); err != nil {
		t.Fatalf("reset failed: %v", err)
	}
	if len(service.accounts) != 2 || service.accounts["one-id"] != accountOne {
		t.Fatal("unchanged accounts should be kept")
	}

	// Changed connection settings: only that account is dropped
	twoChanged := makeAccountSettings("two")
	twoChanged.IMAPSettings.Password = "different"
	if err := service.ResetAccountsCache(context.Background(), types.Settings{
		Accounts: []types.AccountSettings{one, twoChanged},
	}); err != nil {
		t.Fatalf("reset failed: %v", err)
	}
	if service.accounts["one-id"] != accountOne {
		t.Fatal("unchanged account should be kept")
	}
	if _, ok := service.accounts["two-id"]; ok {
		t.Fatal("changed account should be dropped")
	}

	// Account removed from settings entirely
	if err := service.ResetAccountsCache(context.Background(), types.Settings{
		Accounts: []types.AccountSettings{},
	}); err != nil {
		t.Fatalf("reset failed: %v", err)
	}
	if len(service.accounts) != 0 {
		t.Fatal("removed accounts should be dropped")
	}
}
