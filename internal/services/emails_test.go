package services

import (
	"context"
	"path"
	"testing"

	"github.com/emersion/go-imap/v2"
	"github.com/rs/zerolog"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/oxygem/kanmail/internal/caches"
	"github.com/oxygem/kanmail/internal/constants"
	"github.com/oxygem/kanmail/internal/emails"
	"github.com/oxygem/kanmail/internal/emails/imapinterface"
	"github.com/oxygem/kanmail/internal/types"
)

// newTestEmailsService builds an emails service over one account backed by the
// fake IMAP store for this test, shaped like Courier with the given folders.
func newTestEmailsService(t *testing.T, folders ...string) (*EmailsService, types.AccountID, string) {
	t.Helper()

	prev := constants.ENV_DEBUG_FAKE_IMAP
	constants.ENV_DEBUG_FAKE_IMAP = "1"
	t.Cleanup(func() { constants.ENV_DEBUG_FAKE_IMAP = prev })

	key := t.Name()
	for _, name := range []string{"inbox", "sent", "drafts", "archive", "trash"} {
		imapinterface.DeleteFakeFolder(key, name)
	}
	imapinterface.SetFakeNamespaces(key, imap.NamespaceData{
		Personal: []imap.NamespaceDescriptor{{Prefix: "INBOX.", Delim: '.'}},
	})
	for _, name := range folders {
		imapinterface.CreateFakeFolder(key, name)
	}

	testCaches := caches.NewCaches(zerolog.Nop(), path.Join(t.TempDir(), "caches.db"))
	t.Cleanup(func() { testCaches.Close() })

	settings := makeAccountSettings(key)
	settings.IMAPSettings.Username = key
	settings.Settings.Namespaces = types.Namespaces{Personal: []types.Namespace{{Prefix: "INBOX.", Delim: "."}}}
	settings.Folders.Sent = "INBOX.Sent"
	account := emails.NewAccount(settings, testCaches, nil)
	t.Cleanup(func() { account.CloseConnections(context.Background()) })

	accounts := &AccountsService{
		log:      zerolog.Nop(),
		caches:   testCaches,
		accounts: map[types.AccountID]*emails.Account{settings.ID: account},
	}
	return &EmailsService{log: zerolog.Nop(), accounts: accounts}, settings.ID, key
}

func appendTestMessage(t *testing.T, key, folder, messageID string) {
	t.Helper()
	client := imapinterface.NewFakeIMAPClient(key)
	cmd := client.Append(folder, 0, nil)
	_, err := cmd.Write([]byte("Subject: test\r\nMessage-Id: <" + messageID + ">\r\n\r\nbody"))
	require.NoError(t, err)
	_, err = cmd.Wait()
	require.NoError(t, err)
}

func folderNames(emails []*types.Email) []types.FolderName {
	names := make([]types.FolderName, len(emails))
	for i, email := range emails {
		names[i] = email.FolderAliasName
	}
	return names
}

// One mailbox asked for by two names answers each request labelled with the
// name it was asked for, so the frontend files the emails under the column
// that asked - and emails gathered across folders carry the logical name of
// the mailbox they came from
func TestEmailsAreLabelledWithRequestedFolderName(t *testing.T) {
	service, accountID, key := newTestEmailsService(t, "INBOX", "INBOX.Sent", "INBOX.Work")
	ctx := context.Background()
	appendTestMessage(t, key, "INBOX.Work", "work@test")
	appendTestMessage(t, key, "INBOX.Sent", "sent@test")

	paginate := func(folder types.FolderName) *emails.PaginateResp {
		t.Helper()
		resp, err := service.GetAccountFolderEmails(ctx, accountID, folder, emails.PaginateOptions{BatchSize: 10, Reset: true})
		require.NoError(t, err)
		require.Len(t, resp.Emails, 1)
		return resp
	}
	assert.Equal(t, []types.FolderName{"Work"}, folderNames(paginate("Work").Emails))
	assert.Equal(t, []types.FolderName{"INBOX.Work"}, folderNames(paginate("INBOX.Work").Emails))
	assert.Equal(t, []types.FolderName{"sent"}, folderNames(paginate("sent").Emails))

	_, err := service.SyncAccountFolderEmails(ctx, accountID, "inbox.Work")
	require.NoError(t, err)
	appendTestMessage(t, key, "INBOX.Work", "work2@test")
	sync, err := service.SyncAccountFolderEmails(ctx, accountID, "inbox.Work")
	require.NoError(t, err)
	assert.Equal(t, []types.FolderName{"inbox.Work"}, folderNames(sync.Emails))

	found, err := service.FindAccountMessageIDs(ctx, accountID, []string{"work@test", "sent@test"})
	require.NoError(t, err)
	assert.ElementsMatch(t, []types.FolderName{"Work", "sent"}, folderNames(found))

	email, _, err := service.GetAccountFolderEmailAndContent(ctx, accountID, "Work", found[0].UID)
	require.NoError(t, err)
	assert.Equal(t, types.FolderName("Work"), email.FolderAliasName)
}

// Two aliases can point at one mailbox - a server with a single Deleted Items
// for both trash and junk - and the label it gets must be the same every time,
// else the email hops columns on successive refreshes
func TestCrossFolderLabellingIsStable(t *testing.T) {
	service, accountID, key := newTestEmailsService(t, "INBOX", "INBOX.Sent", "INBOX.Deleted Items")
	ctx := context.Background()
	appendTestMessage(t, key, "INBOX.Deleted Items", "gone@test")

	account := service.accounts.GetOrCreateAccount(ctx, accountID)
	account.Folders.Trash = "INBOX.Deleted Items"
	account.Folders.Junk = "INBOX.Deleted Items"

	for range 10 {
		found, err := service.FindAccountMessageIDs(ctx, accountID, []string{"gone@test"})
		require.NoError(t, err)
		require.Len(t, found, 1)
		assert.Equal(t, types.FolderName("trash"), found[0].FolderAliasName)
	}
}
