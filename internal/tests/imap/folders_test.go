package imaptest

import (
	"bytes"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/oxygem/kanmail/internal/emails"
	"github.com/oxygem/kanmail/internal/types"
)

func messageBuffer(m message) *bytes.Buffer {
	return bytes.NewBuffer(m.build())
}

// A folder that isn't on the server stands in as empty for every read, without
// being created - whatever wording the server uses to say it doesn't exist
func TestMissingFolderReadsAsEmpty(t *testing.T) {
	forEachTarget(t, func(t *testing.T, tg *target) {
		e := newEnv(t, tg)
		folder := e.folder("nope")
		name := string(folder.Name)
		assert.Equal(t, tg.qualify("nope"), name)

		resp := e.paginate(folder, 10)
		assert.Empty(t, resp.Emails)
		assert.True(t, resp.Meta.Missing)
		assert.True(t, resp.Meta.Exhausted)

		sync := e.sync(folder)
		assert.True(t, sync.Meta.Missing)
		assert.Empty(t, sync.Emails)

		emails, err := folder.SearchEmails(e.ctx, "anything", 10)
		assert.NoError(t, err)
		assert.Empty(t, emails)

		found, missing, err := folder.SearchMessageIDs(e.ctx, []string{"x@y"})
		assert.NoError(t, err)
		assert.Empty(t, found)
		assert.Equal(t, []string{"x@y"}, missing)

		email, err := folder.FetchEmail(e.ctx, 1)
		assert.NoError(t, err)
		assert.Nil(t, email)

		assert.False(t, e.mailboxExists(name), "reading must not create the mailbox")
	})
}

// Writing into a folder that isn't there creates it, inside the personal
// namespace, for append, move and copy alike - including nested names, and on
// servers without LITERAL+ or MOVE, where the optimistic write-then-create is
// not recoverable (see FINDINGS.md)
func TestWritesCreateMissingFolder(t *testing.T) {
	forEachTarget(t, func(t *testing.T, tg *target) {
		e := newEnv(t, tg)
		uids := e.seed("INBOX", 3)
		inbox := e.folder("inbox")
		require.Len(t, e.paginateAll(inbox, 10), 3)

		appended := tg.qualify("Appended")
		uid, err := e.folder("Appended").AppendEmail(e.ctx, *messageBuffer(message{subject: "appended"}))
		require.NoError(t, err)
		assert.True(t, e.mailboxExists(appended), "append should create %s", appended)
		assert.Equal(t, uint32(1), e.count(appended))
		if e.raw.Caps().Has("UIDPLUS") {
			assert.NotZero(t, uid, "APPENDUID should give the new UID")
		}

		moved := tg.qualify(tg.join("Moved", "Here"))
		require.NoError(t, inbox.MoveEmails(e.ctx, types.FolderName(tg.join("Moved", "Here")), uids[:1]))
		assert.True(t, e.mailboxExists(moved), "move should create %s", moved)
		assert.Equal(t, uint32(1), e.count(moved))
		assert.Equal(t, uint32(2), e.count("INBOX"))

		copied := tg.qualify("Copied")
		require.NoError(t, inbox.CopyEmails(e.ctx, "Copied", uids[1:]))
		assert.True(t, e.mailboxExists(copied), "copy should create %s", copied)
		assert.Equal(t, uint32(2), e.count(copied))
		assert.Equal(t, uint32(2), e.count("INBOX"))
	})
}

// A name typed the way the user sees it and the server's own name for that
// mailbox are one Folder, so a move between them is refused as a no-op rather
// than sent to the server
func TestOneFolderPerMailbox(t *testing.T) {
	forEachTarget(t, func(t *testing.T, tg *target) {
		e := newEnv(t, tg)
		work := tg.qualify("Work")
		e.createMailbox(work)
		uids := e.seed(work, 1)

		folder := e.folder("Work")
		assert.Same(t, folder, e.folder(work))
		assert.Same(t, e.folder("inbox"), e.folder("INBOX"))
		assert.Same(t, e.folder("inbox"), e.folder("Inbox"))

		err := folder.MoveEmails(e.ctx, types.FolderName(work), uids)
		assert.ErrorContains(t, err, "same mailbox")
		err = folder.CopyEmails(e.ctx, "Work", uids)
		assert.ErrorContains(t, err, "same mailbox")
		assert.Equal(t, uint32(1), e.count(work))
	})
}

// A folder deleted on the server while Kanmail holds its UIDs empties the
// column on the next sync rather than erroring, and comes back to life when
// it is recreated
func TestFolderDeletedAndRestoredRemotely(t *testing.T) {
	forEachTarget(t, func(t *testing.T, tg *target) {
		e := newEnv(t, tg)
		work := tg.qualify("Work")
		e.createMailbox(work)
		e.seed(work, 3)

		folder := e.folder("Work")
		emails := e.paginateAll(folder, 10)
		require.Len(t, emails, 3)

		e.deleteMailbox(work)

		resp := e.sync(folder)
		assert.ElementsMatch(t, emailUIDs(emails), resp.DeletedUIDs)
		assert.True(t, resp.Meta.Missing)
		assert.Equal(t, 0, resp.Meta.Count)

		resp = e.sync(folder)
		assert.Empty(t, resp.DeletedUIDs)
		assert.True(t, resp.Meta.Missing)

		// Most servers derive UIDVALIDITY from the clock
		time.Sleep(1100 * time.Millisecond)
		e.createMailbox(work)
		e.seed(work, 1)

		resp = e.sync(folder)
		assert.False(t, resp.Meta.Missing)
		assert.True(t, resp.Reset, "a restored folder asks the frontend to re-paginate")
		assert.Len(t, e.paginateAll(folder, 10), 1)
	})
}

// A folder recreated on the server (new UIDVALIDITY, old UIDs meaning other
// messages) is noticed on sync: everything sent is dropped and the frontend
// told to start over
func TestUIDValidityChange(t *testing.T) {
	forEachTarget(t, func(t *testing.T, tg *target) {
		e := newEnv(t, tg)
		work := tg.qualify("Work")
		e.createMailbox(work)
		e.seed(work, 2)
		before := e.status(work).UIDValidity

		folder := e.folder("Work")
		emails := e.paginateAll(folder, 10)
		require.Len(t, emails, 2)

		e.deleteMailbox(work)
		time.Sleep(1100 * time.Millisecond)
		e.createMailbox(work)
		e.seed(work, 3)
		if e.status(work).UIDValidity == before {
			t.Skipf("%s reused UIDVALIDITY %d for the recreated mailbox", tg.name, before)
		}

		resp := e.sync(folder)
		assert.True(t, resp.Reset)
		assert.ElementsMatch(t, emailUIDs(emails), resp.DeletedUIDs)
		assert.Len(t, e.paginateAll(folder, 10), 3)
	})
}

// UIDs persist across a relaunch: the folder picks up where it left off from
// the cache, sync finds nothing new and pagination continues past what was
// already shown
func TestRestartResumesFromCache(t *testing.T) {
	forEachTarget(t, func(t *testing.T, tg *target) {
		e := newEnv(t, tg)
		e.seed("INBOX", 6)
		inbox := e.folder("inbox")
		first := e.paginate(inbox, 4)
		require.Len(t, first.Emails, 4)

		e.restartAccount()
		inbox = e.folder("inbox")

		resp := e.sync(inbox)
		assert.Empty(t, resp.Emails)
		assert.Empty(t, resp.DeletedUIDs)
		assert.False(t, resp.Reset)
		assert.Equal(t, 6, resp.Meta.Count)

		all := e.paginateAll(inbox, 4)
		assert.Len(t, all, 6)
		assert.ElementsMatch(t, emailUIDs(first.Emails), emailUIDs(all[:4]))
	})
}

// The account is driven through the folders the way the services do: by
// alias for the specials, logical names for columns, and the INBOX by any
// spelling; all of which must select on the real server
func TestFolderNamesSelectable(t *testing.T) {
	forEachTarget(t, func(t *testing.T, tg *target) {
		e := newEnv(t, tg)
		names := []string{"inbox", "INBOX", "Inbox"}
		for alias := range tg.special {
			names = append(names, string(alias))
		}
		for _, name := range names {
			folder := e.folder(name)
			resp, err := folder.PaginateEmails(e.ctx, emails.PaginateOptions{BatchSize: 5})
			require.NoError(t, err, name)
			assert.False(t, resp.Meta.Missing, "%s resolves to %s which should exist", name, folder.Name)
		}
	})
}
