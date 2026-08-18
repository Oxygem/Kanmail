package emails

import (
	"context"
	"path"
	"testing"
	"time"

	"github.com/rs/zerolog"
	"github.com/stretchr/testify/assert"

	"github.com/oxygem/kanmail/internal/caches"
	"github.com/oxygem/kanmail/internal/types"
)

func TestFolderSearchCachedEmails(t *testing.T) {
	testCaches := caches.NewCaches(zerolog.Nop(), path.Join(t.TempDir(), "caches.db"))
	t.Cleanup(func() { testCaches.Close() })
	ctx := context.Background()

	account := NewAccount(types.AccountSettings{
		ID:      types.AccountID(t.Name()),
		Name:    types.AccountName(t.Name()),
		Folders: types.FolderSettings{Inbox: "INBOX"},
	}, testCaches, nil)
	t.Cleanup(func() { account.CloseConnections(ctx) })

	for _, email := range []*types.Email{
		{
			AccountID:  types.AccountID(t.Name()),
			FolderName: "INBOX",
			UID:        1,
			MessageID:  "<1@test>",
			Subject:    "invoice from alice",
			From:       []types.Address{{Name: "Alice", Email: "alice@example.com"}},
			Date:       time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC),
		},
		{
			AccountID:  types.AccountID(t.Name()),
			FolderName: "INBOX",
			UID:        2,
			MessageID:  "<2@test>",
			Subject:    "invoice from bob",
			From:       []types.Address{{Name: "Bob", Email: "bob@example.com"}},
			Date:       time.Date(2025, 6, 1, 0, 0, 0, 0, time.UTC),
		},
	} {
		assert.NoError(t, testCaches.FolderEmailCache.Store(ctx, email))
	}

	// Alias folder name resolves to the real cached folder name
	folder := account.GetFolder("inbox")
	assert.Equal(t, types.FolderName("INBOX"), folder.Name)

	search := func(query string) []string {
		t.Helper()
		emails, err := folder.SearchCachedEmails(ctx, query, 100)
		assert.NoError(t, err)
		subjects := make([]string, 0, len(emails))
		for _, email := range emails {
			subjects = append(subjects, email.Subject)
		}
		return subjects
	}

	assert.ElementsMatch(t,
		[]string{"invoice from alice", "invoice from bob"}, search("invoice"))
	assert.Equal(t, []string{"invoice from alice"}, search("invoice -from:bob"))
	assert.Equal(t, []string{"invoice from alice"}, search("invoice after:2026/01/01"))
	assert.Empty(t, search("invoice from:carol"))

	// Untranslatable criteria degrade to no local results, not an error
	assert.Empty(t, search("invoice larger:1m"))
}
