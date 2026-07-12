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

func TestResetAccountsCacheKeepsUnchangedAccounts(t *testing.T) {
	one := makeAccountSettings("one")
	two := makeAccountSettings("two")

	service := &AccountsService{
		log: zerolog.Nop(),
		accounts: map[types.AccountName]*emails.Account{
			"one": emails.NewAccount(one, nil),
			"two": emails.NewAccount(two, nil),
		},
	}
	accountOne := service.accounts["one"]

	// Unrelated settings change: both accounts unchanged
	if err := service.ResetAccountsCache(context.Background(), types.Settings{
		Accounts: []types.AccountSettings{one, two},
	}); err != nil {
		t.Fatalf("reset failed: %v", err)
	}
	if len(service.accounts) != 2 || service.accounts["one"] != accountOne {
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
	if service.accounts["one"] != accountOne {
		t.Fatal("unchanged account should be kept")
	}
	if _, ok := service.accounts["two"]; ok {
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
