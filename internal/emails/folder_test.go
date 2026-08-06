package emails

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"path"
	"testing"

	"github.com/emersion/go-imap/v2"
	"github.com/rs/zerolog"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/oxygem/kanmail/internal/caches"
	"github.com/oxygem/kanmail/internal/constants"
	"github.com/oxygem/kanmail/internal/emails/imapinterface"
	"github.com/oxygem/kanmail/internal/types"
)

// newTestAccount builds an account backed by the fake IMAP store for this test
// (keyed by name, so tests don't share folders) and a real on-disk cache.
func newTestAccount(t *testing.T) (*Account, *caches.Caches, context.Context) {
	t.Helper()

	prev := constants.ENV_DEBUG_FAKE_IMAP
	constants.ENV_DEBUG_FAKE_IMAP = "1"
	t.Cleanup(func() { constants.ENV_DEBUG_FAKE_IMAP = prev })

	testCaches := caches.NewCaches(zerolog.Nop(), path.Join(t.TempDir(), "caches.db"))
	t.Cleanup(func() { testCaches.Close() })

	ctx := context.Background()
	account := NewAccount(types.AccountSettings{
		ID:           types.AccountID(t.Name()),
		Name:         types.AccountName(t.Name()),
		IMAPSettings: types.ConnectionSettings{Username: t.Name()},
	}, testCaches)
	t.Cleanup(func() { account.CloseConnections(ctx) })

	return account, testCaches, ctx
}

func fakeFolderExists(accountKey, name string) bool {
	_, err := imapinterface.NewFakeIMAPClient(accountKey).Select(name, nil).Wait()
	return err == nil
}

func fakeFolderMessages(t *testing.T, accountKey, name string) uint32 {
	t.Helper()
	data, err := imapinterface.NewFakeIMAPClient(accountKey).Select(name, nil).Wait()
	require.NoError(t, err, "folder %s should exist", name)
	return data.NumMessages
}

func paginateUIDs(t *testing.T, folder *Folder, ctx context.Context) []imap.UID {
	t.Helper()
	resp, err := folder.PaginateEmails(ctx, PaginateOptions{BatchSize: 10})
	require.NoError(t, err)
	uids := make([]imap.UID, 0, len(resp.Emails))
	for _, email := range resp.Emails {
		uids = append(uids, email.UID)
	}
	return uids
}

func TestFolderErrorClassifiers(t *testing.T) {
	no := func(code imap.ResponseCode) error {
		return &imap.Error{Type: imap.StatusResponseTypeNo, Code: code}
	}
	noText := func(text string) error {
		return &imap.Error{Type: imap.StatusResponseTypeNo, Text: text}
	}

	for _, tc := range []struct {
		desc    string
		err     error
		missing bool
	}{
		{"nonexistent", no(imap.ResponseCodeNonExistent), true},
		{"trycreate", no(imap.ResponseCodeTryCreate), true},
		{"wrapped nonexistent", fmt.Errorf("select: %w", no(imap.ResponseCodeNonExistent)), true},
		{"missing mailbox", errMailboxMissing, true},
		{"wrapped missing mailbox", fmt.Errorf("select: %w", errMailboxMissing), true},
		{"exchange bare no", noText("INBOX doesn't exist."), true},
		{"dovecot bare no", noText("Mailbox doesn't exist: Kanmail/Done"), true},
		{"cyrus bare no", noText("Mailbox does not exist"), true},
		{"courier bare no", noText("Mailbox does not exist, or must be subscribed to."), true},
		{"uw bare no", noText("Can't open mailbox Archive: no such mailbox"), true},
		{"old gmail bare no", noText("Unknown Mailbox: [Gmail]/Trash (Failure)"), true},
		{"wrapped bare no", fmt.Errorf("select: %w", noText("Mailbox does not exist")), true},
		{"bare no", no(""), false},
		{"permission denied", noText("Permission denied"), false},
		{"transient", noText("Server busy, try again later"), false},
		{"other code overrides text", &imap.Error{
			Type: imap.StatusResponseTypeNo, Code: imap.ResponseCodeInUse, Text: "Mailbox does not exist",
		}, false},
		{"in use", no(imap.ResponseCodeInUse), false},
		{"already exists", no(imap.ResponseCodeAlreadyExists), false},
		{"bad", &imap.Error{Type: imap.StatusResponseTypeBad, Text: "Folder could not be found."}, false},
		{"network", io.ErrUnexpectedEOF, false},
	} {
		assert.Equal(t, tc.missing, isMissingMailboxErr(tc.err), "isMissingMailboxErr: %s", tc.desc)
	}
}

func TestPaginateMissingFolderIsEmpty(t *testing.T) {
	account, _, ctx := newTestAccount(t)

	resp, err := account.GetFolder("nope").PaginateEmails(ctx, PaginateOptions{BatchSize: 10})
	assert.NoError(t, err)
	assert.Empty(t, resp.Emails)
	assert.Equal(t, 0, resp.Meta.Count)
	assert.True(t, resp.Meta.Exhausted)
	assert.True(t, resp.Meta.Missing)
}

// Displaying a column must not create the mailbox - folders are only created
// when mail is written into them.
func TestReadingMissingFolderDoesNotCreateIt(t *testing.T) {
	account, _, ctx := newTestAccount(t)
	folder := account.GetFolder("nope")

	_, err := folder.PaginateEmails(ctx, PaginateOptions{BatchSize: 10})
	assert.NoError(t, err)
	_, err = folder.SyncEmails(ctx)
	assert.NoError(t, err)

	assert.False(t, fakeFolderExists(t.Name(), "nope"), "folder should not have been created")
}

func TestSyncMissingFolderNeverErrors(t *testing.T) {
	account, _, ctx := newTestAccount(t)
	folder := account.GetFolder("nope")

	for i := range 3 {
		resp, err := folder.SyncEmails(ctx)
		assert.NoError(t, err, "sync %d", i)
		assert.Empty(t, resp.Emails)
		assert.Empty(t, resp.DeletedUIDs)
		assert.True(t, resp.Meta.Missing)
	}
}

// The reported bug: a folder deleted on the server whilst we hold its UIDs must
// empty the column rather than erroring on every sync.
func TestSyncFolderDeletedRemotely(t *testing.T) {
	account, testCaches, ctx := newTestAccount(t)
	for range 3 {
		appendFakeMessage(t, t.Name(), "inbox")
	}

	folder := account.GetFolder("inbox")
	uids := paginateUIDs(t, folder, ctx)
	assert.Len(t, uids, 3)

	imapinterface.DeleteFakeFolder(t.Name(), "inbox")

	resp, err := folder.SyncEmails(ctx)
	assert.NoError(t, err)
	assert.ElementsMatch(t, uids, resp.DeletedUIDs)
	assert.True(t, resp.Meta.Missing)
	assert.Equal(t, 0, resp.Meta.Count)

	// The cached UID list must go, else we'd skip the select probe next launch
	_, _, cachedUIDs, err := testCaches.FolderUIDCache.Get(ctx, account.ID, "inbox")
	assert.NoError(t, err)
	assert.Empty(t, cachedUIDs)

	// ...but the cached emails stay, ready for the folder coming back
	email, err := testCaches.FolderEmailCache.Get(ctx, account.ID, "inbox", uids[0])
	assert.NoError(t, err)
	assert.NotNil(t, email)

	// Subsequent syncs are quiet: no error, nothing more to delete
	resp, err = folder.SyncEmails(ctx)
	assert.NoError(t, err)
	assert.Empty(t, resp.DeletedUIDs)
	assert.True(t, resp.Meta.Missing)
}

func TestSyncFolderRestoredRemotely(t *testing.T) {
	account, _, ctx := newTestAccount(t)
	folder := account.GetFolder("inbox")

	imapinterface.DeleteFakeFolder(t.Name(), "inbox")
	resp, err := folder.SyncEmails(ctx)
	require.NoError(t, err)
	require.True(t, resp.Meta.Missing)

	imapinterface.CreateFakeFolder(t.Name(), "inbox")
	appendFakeMessage(t, t.Name(), "inbox")

	// First sync notices the folder is back and resets it
	resp, err = folder.SyncEmails(ctx)
	assert.NoError(t, err)
	assert.False(t, resp.Meta.Missing)

	// ...then it behaves as any other folder
	assert.Len(t, paginateUIDs(t, folder, ctx), 1)
}

func TestMoveCreatesMissingDestination(t *testing.T) {
	account, _, ctx := newTestAccount(t)
	appendFakeMessage(t, t.Name(), "inbox")

	folder := account.GetFolder("inbox")
	uids := paginateUIDs(t, folder, ctx)
	require.Len(t, uids, 1)

	assert.NoError(t, folder.MoveEmails(ctx, "brand-new", uids))
	assert.Equal(t, uint32(1), fakeFolderMessages(t, t.Name(), "brand-new"))
}

func TestCopyCreatesMissingDestination(t *testing.T) {
	account, _, ctx := newTestAccount(t)
	appendFakeMessage(t, t.Name(), "inbox")

	folder := account.GetFolder("inbox")
	uids := paginateUIDs(t, folder, ctx)
	require.Len(t, uids, 1)

	assert.NoError(t, folder.CopyEmails(ctx, "brand-new", uids))
	assert.Equal(t, uint32(1), fakeFolderMessages(t, t.Name(), "brand-new"))
	assert.Equal(t, uint32(1), fakeFolderMessages(t, t.Name(), "inbox"))
}

// Saving a sent copy must work even when the account's sent folder has gone
func TestAppendCreatesMissingFolder(t *testing.T) {
	account, _, ctx := newTestAccount(t)
	folder := account.GetFolder("brand-new")

	var b bytes.Buffer
	b.WriteString("Subject: test\r\n\r\nbody")
	uid, err := folder.AppendEmail(ctx, b)
	assert.NoError(t, err)
	assert.Equal(t, imap.UID(1), uid)
	assert.Equal(t, uint32(1), fakeFolderMessages(t, t.Name(), "brand-new"))
}

// Threading searches common folders that may not exist on every account. Servers
// differ in how they report that: some tag the NO with NONEXISTENT, others send a
// bare NO that only a LIST can disambiguate.
func TestSearchMissingFolderReturnsEmpty(t *testing.T) {
	for _, bareNo := range []bool{false, true} {
		t.Run(fmt.Sprintf("bare_no=%v", bareNo), func(t *testing.T) {
			account, _, ctx := newTestAccount(t)
			imapinterface.SetFakeBareStatusResponses(t.Name(), bareNo)
			folder := account.GetFolder("nope")

			emails, err := folder.SearchEmails(ctx, "test", 10)
			assert.NoError(t, err)
			assert.Empty(t, emails)

			results, missing, err := folder.SearchMessageIDs(ctx, []string{"<1@test>"})
			assert.NoError(t, err)
			assert.Empty(t, results)
			assert.Equal(t, []string{"<1@test>"}, missing)

			refResults, refMissing, err := folder.SearchReferences(ctx, []EmailRef{{Reference: "<1@test>"}})
			assert.NoError(t, err)
			assert.Empty(t, refResults)
			assert.Len(t, refMissing, 1)
		})
	}
}

// Message ID lookups fall back to the account's archive/sent/trash folders, which
// are only searched when the account maps them to a real mailbox - probing the
// literal names is what surfaced "Mailbox doesn't exist: archive".
func TestFindMessageIDsOnlySearchesMappedFolders(t *testing.T) {
	const messageID = "<found@kanmail>"

	setup := func(t *testing.T) (*Account, context.Context) {
		account, _, ctx := newTestAccount(t)
		imapinterface.SetFakeBareStatusResponses(t.Name(), true)
		appendFakeMessageWithID(t, t.Name(), "archive", messageID)
		return account, ctx
	}

	t.Run("unmapped", func(t *testing.T) {
		account, ctx := setup(t)

		emails, err := account.FindMessageIDs(ctx, []string{messageID})
		assert.NoError(t, err)
		assert.Empty(t, emails)
	})

	t.Run("mapped", func(t *testing.T) {
		account, ctx := setup(t)
		account.Folders.Archive = "archive"

		emails, err := account.FindMessageIDs(ctx, []string{messageID})
		require.NoError(t, err)
		require.Len(t, emails, 1)
		assert.Equal(t, messageID, emails[0].MessageID)
	})
}

// Fetching from a missing folder must not fabricate "failed to parse" emails
func TestFetchEmailMissingFolderHasNoPlaceholder(t *testing.T) {
	account, _, ctx := newTestAccount(t)

	email, err := account.GetFolder("nope").FetchEmail(ctx, 1)
	assert.NoError(t, err)
	assert.Nil(t, email)
}
