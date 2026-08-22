package imaptest

import (
	"bytes"
	"fmt"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/emersion/go-imap/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/oxygem/kanmail/internal/emails"
	"github.com/oxygem/kanmail/internal/types"
)

// Pagination walks a folder newest first in batches until exhausted (the
// order within a batch is the server's, the frontend sorts), and what comes
// back has the envelope and excerpt the frontend renders
func TestPaginateEmails(t *testing.T) {
	forEachTarget(t, func(t *testing.T, tg *target) {
		e := newEnv(t, tg)
		uids := e.seed("INBOX", 7)
		inbox := e.folder("inbox")

		resp := e.paginate(inbox, 3)
		assert.ElementsMatch(t, []string{"Message 7", "Message 6", "Message 5"}, emailSubjects(resp.Emails))
		assert.Equal(t, 7, resp.Meta.Count)
		assert.False(t, resp.Meta.Exhausted)
		assert.False(t, resp.Meta.Missing)

		resp = e.paginate(inbox, 3)
		assert.ElementsMatch(t, []string{"Message 4", "Message 3", "Message 2"}, emailSubjects(resp.Emails))
		assert.False(t, resp.Meta.Exhausted)

		resp = e.paginate(inbox, 3)
		assert.Equal(t, []string{"Message 1"}, emailSubjects(resp.Emails))
		assert.True(t, resp.Meta.Exhausted)

		resp = e.paginate(inbox, 3)
		assert.Empty(t, resp.Emails)
		assert.True(t, resp.Meta.Exhausted)

		first, err := inbox.FetchEmail(e.ctx, uids[6])
		require.NoError(t, err)
		require.NotNil(t, first)
		assert.Equal(t, "Message 7", first.Subject)
		// Servers may store the body with a trailing newline, which the
		// excerpt renders as a sentence break
		assert.True(t, strings.HasPrefix(first.Excerpt, "Body of message 7"), "excerpt %q", first.Excerpt)
		assert.Equal(t, []types.Address{{Name: "Alice Example", Email: "alice@example.org"}}, first.From)
		assert.Equal(t, []types.Address{{Name: "Bob Example", Email: "bob@example.org"}}, first.To)
		assert.NotEmpty(t, first.MessageID)
		assert.NotContains(t, first.MessageID, "<", "message IDs are bare")
		assert.WithinDuration(t, time.Now(), first.Date, 2*time.Minute)
		assert.NotZero(t, first.Size)
		assert.NotNil(t, first.PartText)
		assert.Nil(t, first.PartHTML)
		assert.Equal(t, types.FolderName("INBOX"), first.FolderName)
	})
}

// Multipart mail: the html and text parts are found in the structure, the
// excerpt prefers text, and the body and attachment fetch and decode
func TestFetchContentAndAttachment(t *testing.T) {
	forEachTarget(t, func(t *testing.T, tg *target) {
		e := newEnv(t, tg)
		attachment := bytes.Repeat([]byte("attachment data\n"), 100)
		uid := e.appendMessage("INBOX", message{
			subject:        "Rich",
			text:           "Plain text body",
			html:           "<p>HTML <b>body</b></p>",
			attachment:     attachment,
			attachmentName: "data.txt",
		})
		inbox := e.folder("inbox")

		// The excerpt is peeked at during pagination, which must not mark the
		// message read
		require.Len(t, e.paginateAll(inbox, 10), 1)
		assert.NotContains(t, e.flags("INBOX", uid), imap.FlagSeen)

		email, body, err := inbox.FetchEmailAndContent(e.ctx, uid)
		require.NoError(t, err)
		assert.Equal(t, "Rich", email.Subject)
		assert.Equal(t, "Plain text body", email.Excerpt)
		require.NotNil(t, email.PartText)
		require.NotNil(t, email.PartHTML)
		assert.Equal(t, "text/plain", email.PartText.Type)
		assert.Equal(t, "text/html", email.PartHTML.Type)
		assert.Contains(t, body.Data, "<b>body</b>")
		assert.True(t, body.Trusted)

		var attachmentPart *types.BodyPart
		for i, part := range email.Parts {
			if part.Description == "data.txt" {
				attachmentPart = &email.Parts[i]
			}
		}
		require.NotNil(t, attachmentPart, "attachment should be in the parts: %+v", email.Parts)
		data, err := inbox.FetchEmailPartData(e.ctx, emails.FetchPartsMap{uid: *attachmentPart})
		require.NoError(t, err)
		assert.Equal(t, attachment, data[uid].Bytes)

		// Opening the message, unlike the excerpt, is what marks it read
		assert.Contains(t, e.flags("INBOX", uid), imap.FlagSeen)
	})
}

// Sync picks up what another client did since: new mail, deletions, and
// messages read or unread
func TestSyncSeesOtherClientChanges(t *testing.T) {
	forEachTarget(t, func(t *testing.T, tg *target) {
		e := newEnv(t, tg)
		uids := e.seed("INBOX", 4)
		inbox := e.folder("inbox")
		require.Len(t, e.paginateAll(inbox, 10), 4)

		resp := e.sync(inbox)
		assert.Empty(t, resp.Emails)
		assert.Empty(t, resp.DeletedUIDs)
		assert.Empty(t, resp.ReadUIDs)

		newUIDs := e.seed("INBOX", 2)
		e.expungeMessages("INBOX", uids[0], uids[2])
		e.storeFlags("INBOX", imap.StoreFlagsAdd, []imap.Flag{imap.FlagSeen}, uids[1])

		resp = e.sync(inbox)
		assert.ElementsMatch(t, newUIDs, emailUIDs(resp.Emails))
		assert.ElementsMatch(t, []imap.UID{uids[0], uids[2]}, resp.DeletedUIDs)
		assert.Equal(t, []imap.UID{uids[1]}, resp.ReadUIDs)
		assert.Empty(t, resp.UnreadUIDs)
		assert.Equal(t, 4, resp.Meta.Count)

		e.storeFlags("INBOX", imap.StoreFlagsDel, []imap.Flag{imap.FlagSeen}, uids[1])
		resp = e.sync(inbox)
		assert.Equal(t, []imap.UID{uids[1]}, resp.UnreadUIDs)
		assert.Empty(t, resp.ReadUIDs)
		assert.Empty(t, resp.Emails)
	})
}

// A folder that was empty when first opened still reports everything that
// arrives afterwards, several messages at a time - the sync range starts where
// the server said the next UID would be, whether that came from the SELECT or
// (Courier) from a STATUS afterwards
func TestSyncEmptyFolderSeesAllNewMail(t *testing.T) {
	forEachTarget(t, func(t *testing.T, tg *target) {
		e := newEnv(t, tg)
		inbox := e.folder("inbox")
		resp := e.paginate(inbox, 10)
		require.Empty(t, resp.Emails)
		require.True(t, resp.Meta.Exhausted)

		uids := e.seed("INBOX", 3)
		sync := e.sync(inbox)
		assert.ElementsMatch(t, uids, emailUIDs(sync.Emails))
		assert.Equal(t, 3, sync.Meta.Count)

		more := e.seed("INBOX", 2)
		sync = e.sync(inbox)
		assert.ElementsMatch(t, more, emailUIDs(sync.Emails))
		assert.Equal(t, 5, sync.Meta.Count)
	})
}

// Flag and delete changes Kanmail makes are what the server (and so every
// other client) sees
func TestFlagAndDelete(t *testing.T) {
	forEachTarget(t, func(t *testing.T, tg *target) {
		e := newEnv(t, tg)
		uids := e.seed("INBOX", 3)
		inbox := e.folder("inbox")
		require.Len(t, e.paginateAll(inbox, 10), 3)

		require.NoError(t, inbox.FlagEmails(e.ctx, uids[:2]))
		assert.Contains(t, e.flags("INBOX", uids[0]), imap.FlagFlagged)
		assert.Contains(t, e.flags("INBOX", uids[1]), imap.FlagFlagged)
		assert.NotContains(t, e.flags("INBOX", uids[2]), imap.FlagFlagged)

		require.NoError(t, inbox.UnflagEmails(e.ctx, uids[:1]))
		assert.NotContains(t, e.flags("INBOX", uids[0]), imap.FlagFlagged)
		assert.Contains(t, e.flags("INBOX", uids[1]), imap.FlagFlagged)

		require.NoError(t, inbox.DeleteEmails(e.ctx, uids[1:2]))
		assert.Equal(t, []imap.UID{uids[0], uids[2]}, e.uids("INBOX"))

		resp := e.sync(inbox)
		assert.Equal(t, []imap.UID{uids[1]}, resp.DeletedUIDs)
		assert.Equal(t, 2, resp.Meta.Count)
	})
}

// Move and copy between folders, by alias, logical and full name, land the
// right messages in the right mailbox - on servers with MOVE and without
func TestMoveAndCopy(t *testing.T) {
	forEachTarget(t, func(t *testing.T, tg *target) {
		e := newEnv(t, tg)
		uids := e.seed("INBOX", 4)
		inbox := e.folder("inbox")
		require.Len(t, e.paginateAll(inbox, 10), 4)
		work := tg.qualify("Work")
		trash := string(tg.special["trash"])
		e.createMailbox(work)

		require.NoError(t, inbox.MoveEmails(e.ctx, "Work", uids[:2]))
		assert.Equal(t, []imap.UID{uids[2], uids[3]}, e.uids("INBOX"))
		assert.Equal(t, uint32(2), e.count(work))

		require.NoError(t, inbox.CopyEmails(e.ctx, "trash", uids[2:3]))
		assert.Equal(t, []imap.UID{uids[2], uids[3]}, e.uids("INBOX"))
		assert.Equal(t, uint32(1), e.count(trash))

		require.NoError(t, e.folder("Work").MoveEmails(e.ctx, types.FolderName(trash), e.uids(work)))
		assert.Equal(t, uint32(0), e.count(work))
		assert.Equal(t, uint32(3), e.count(trash))

		resp := e.sync(inbox)
		assert.ElementsMatch(t, uids[:2], resp.DeletedUIDs)
		assert.Equal(t, 2, resp.Meta.Count)

		// The moved mail is readable where it went, with its content intact
		moved := e.paginateAll(e.folder("trash"), 10)
		require.Len(t, moved, 3)
		subjects := emailSubjects(moved)
		slices.Sort(subjects)
		assert.Equal(t, []string{"Message 1", "Message 2", "Message 3"}, subjects)
	})
}

// Message ID searches - the threading lookups - find mail by its headers, and
// a bare ID (as envelopes carry them) is what goes in and comes out. Servers
// that don't search the message id headers at all sit this out (FINDINGS.md)
func TestSearchByMessageID(t *testing.T) {
	forEachTarget(t, func(t *testing.T, tg *target) {
		if tg.noMessageIDSearch {
			t.Skipf("%s has no Message-ID header search", tg.name)
		}
		e := newEnv(t, tg)
		rootID := newMessageID()
		bareRootID := strings.Trim(rootID, "<>")
		sentAt := time.Now().Add(-48 * time.Hour)
		e.appendMessage("INBOX", message{subject: "Root", messageID: rootID, date: sentAt})
		replyID := newMessageID()
		e.appendMessage("INBOX", message{
			subject: "Re: Root", messageID: replyID, inReplyTo: rootID, references: []string{rootID},
			date: sentAt.Add(time.Hour),
		})
		e.appendMessage("INBOX", message{subject: "Unrelated"})
		inbox := e.folder("inbox")

		found, missing, err := inbox.SearchMessageIDs(e.ctx, []string{bareRootID, "nothing@imaptest.kanmail"})
		require.NoError(t, err)
		assert.Equal(t, []string{"nothing@imaptest.kanmail"}, missing)
		require.Contains(t, found, bareRootID)
		assert.Equal(t, "Root", found[bareRootID].Subject)
		assert.Equal(t, bareRootID, found[bareRootID].MessageID)

		// The reply's References header comes back parsed and bare too
		reply, _, err := inbox.SearchMessageIDs(e.ctx, []string{strings.Trim(replyID, "<>")})
		require.NoError(t, err)
		require.Len(t, reply, 1)
		for _, email := range reply {
			assert.Equal(t, []string{bareRootID}, email.References)
		}

		// FindMessageIDs searches the mapped special folders, sent among them
		sent := string(tg.special["sent"])
		sentID := newMessageID()
		e.appendMessage(sent, message{subject: "Sent one", messageID: sentID})
		results, err := e.account.FindMessageIDs(e.ctx, []string{strings.Trim(sentID, "<>")})
		require.NoError(t, err)
		require.Len(t, results, 1)
		assert.Equal(t, "Sent one", results[0].Subject)
		assert.Equal(t, types.FolderName(sent), results[0].FolderName)
	})
}

// Free text search: Kanmail's query syntax becomes standard SEARCH criteria
// the server evaluates against subject, addresses and body
func TestSearchEmails(t *testing.T) {
	forEachTarget(t, func(t *testing.T, tg *target) {
		e := newEnv(t, tg)
		e.appendMessage("INBOX", message{subject: "Quarterly invoice", text: "Please find the zebra attached"})
		e.appendMessage("INBOX", message{subject: "Lunch", text: "Pizza on Friday?", from: "Carol <carol@example.net>"})
		e.appendMessage("INBOX", message{subject: "Another", text: "zebra crossing"})
		inbox := e.folder("inbox")

		bySubject := e.searchEmails(inbox, "invoice", 10)
		assert.Equal(t, []string{"Quarterly invoice"}, emailSubjects(bySubject))

		byFrom := e.searchEmails(inbox, "from:carol", 10)
		assert.Equal(t, []string{"Lunch"}, emailSubjects(byFrom))

		none, err := inbox.SearchEmails(e.ctx, "giraffe", 10)
		require.NoError(t, err)
		assert.Empty(t, none)

		// Substring body search needs a server-side index Cyrus doesn't have by
		// default, so the body-term matches are only checked where it's supported
		if tg.noBodySearch {
			return
		}
		byBody := e.searchEmails(inbox, "zebra", 10)
		subjects := emailSubjects(byBody)
		slices.Sort(subjects)
		assert.Equal(t, []string{"Another", "Quarterly invoice"}, subjects)

		limited := e.searchEmails(inbox, "zebra", 1)
		assert.Len(t, limited, 1)
	})
}

// Folders past the UID pagination threshold are opened on their newest
// thousand UIDs and extended as the user scrolls; every message is reached
// exactly once
func TestLargeFolderPagination(t *testing.T) {
	if testing.Short() {
		t.Skip("appends over a thousand messages")
	}
	forEachTarget(t, func(t *testing.T, tg *target) {
		e := newEnv(t, tg)
		const total = 1050
		messages := make([]message, total)
		start := time.Now().Add(-time.Duration(total) * time.Minute)
		for i := range messages {
			messages[i] = message{subject: fmt.Sprintf("Bulk %04d", i+1), text: "bulk", date: start.Add(time.Duration(i) * time.Minute)}
		}
		uids := e.appendMessages("INBOX", messages...)
		inbox := e.folder("inbox")

		// Opened on the newest thousand UIDs...
		first := e.paginate(inbox, 100)
		assert.Equal(t, 1000, first.Meta.Count)
		assert.False(t, first.Meta.Exhausted)
		resp := e.sync(inbox)
		assert.Empty(t, resp.Emails)
		assert.False(t, resp.Reset)

		// ...and extended as the user scrolls, reaching every message once
		all := append(first.Emails, e.paginateAll(inbox, 100)...)
		require.Len(t, all, total)
		got := emailUIDs(all)
		slices.Sort(got)
		assert.Equal(t, uids, got, "every UID exactly once")
		assert.Equal(t, total, e.paginate(inbox, 100).Meta.Count)
	})
}
