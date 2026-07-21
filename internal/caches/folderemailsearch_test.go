package caches

import (
	"context"
	"fmt"
	"path"
	"testing"
	"time"

	"github.com/emersion/go-imap/v2"
	"github.com/rs/zerolog"
	"github.com/stretchr/testify/assert"

	"github.com/oxygem/kanmail/internal/types"
)

func newTestCaches(t *testing.T) *Caches {
	t.Helper()
	caches := NewCaches(zerolog.Nop(), path.Join(t.TempDir(), "caches.db"))
	t.Cleanup(func() { caches.Close() })
	return caches
}

var searchTestDate = time.Date(2026, 7, 1, 12, 0, 0, 0, time.UTC)

func makeSearchTestEmail(uid imap.UID, subject string) *types.Email {
	return &types.Email{
		AccountID:  "acct",
		FolderName: "inbox",
		UID:        uid,
		MessageID:  fmt.Sprintf("<%d@test>", uid),
		Subject:    subject,
		Date:       searchTestDate.Add(time.Duration(uid) * time.Hour),
	}
}

func storeSearchTestEmail(t *testing.T, caches *Caches, email *types.Email) {
	t.Helper()
	assert.NoError(t, caches.FolderEmailCache.Store(context.Background(), email))
}

func searchSubjects(
	t *testing.T,
	caches *Caches,
	criteria *imap.SearchCriteria,
	accountAndFolder ...string,
) []string {
	t.Helper()
	account, folder := "acct", "inbox"
	if len(accountAndFolder) == 2 {
		account, folder = accountAndFolder[0], accountAndFolder[1]
	}

	emails, err := caches.FolderEmailCache.Search(
		context.Background(),
		types.AccountID(account),
		types.FolderName(folder),
		criteria,
		100,
	)
	assert.NoError(t, err)

	subjects := make([]string, 0, len(emails))
	for _, email := range emails {
		subjects = append(subjects, email.Subject)
	}
	return subjects
}

func textCriteria(terms ...string) *imap.SearchCriteria {
	return &imap.SearchCriteria{Text: terms}
}

func TestFolderEmailSearchText(t *testing.T) {
	caches := newTestCaches(t)

	subjectEmail := makeSearchTestEmail(1, "Invoice attached")
	fromEmail := makeSearchTestEmail(2, "hello")
	fromEmail.From = []types.Address{{Name: "Alice Invoice", Email: "alice@example.com"}}
	excerptEmail := makeSearchTestEmail(3, "other")
	excerptEmail.Excerpt = "please find the invoice within"
	noMatchEmail := makeSearchTestEmail(4, "nothing here")

	for _, email := range []*types.Email{subjectEmail, fromEmail, excerptEmail, noMatchEmail} {
		storeSearchTestEmail(t, caches, email)
	}

	assert.ElementsMatch(
		t,
		[]string{"Invoice attached", "hello", "other"},
		searchSubjects(t, caches, textCriteria("Invoice")),
	)
	assert.Empty(t, searchSubjects(t, caches, textCriteria("zzznothing")))
}

func TestFolderEmailSearchUnicodeCaseInsensitive(t *testing.T) {
	caches := newTestCaches(t)
	storeSearchTestEmail(t, caches, makeSearchTestEmail(1, "Héllo WÖRLD"))

	assert.Len(t, searchSubjects(t, caches, textCriteria("wörld")), 1)
	assert.Len(t, searchSubjects(t, caches, textCriteria("héllo")), 1)
}

func TestFolderEmailSearchFromToPrecision(t *testing.T) {
	caches := newTestCaches(t)

	fromAlice := makeSearchTestEmail(1, "from alice")
	fromAlice.From = []types.Address{{Name: "Alice", Email: "alice@example.com"}}
	toAlice := makeSearchTestEmail(2, "to alice")
	toAlice.To = []types.Address{{Name: "Alice", Email: "alice@example.com"}}
	storeSearchTestEmail(t, caches, fromAlice)
	storeSearchTestEmail(t, caches, toAlice)

	fromCriteria := &imap.SearchCriteria{
		Header: []imap.SearchCriteriaHeaderField{{Key: "From", Value: "alice"}},
	}
	toCriteria := &imap.SearchCriteria{
		Header: []imap.SearchCriteriaHeaderField{{Key: "To", Value: "alice"}},
	}
	assert.Equal(t, []string{"from alice"}, searchSubjects(t, caches, fromCriteria))
	assert.Equal(t, []string{"to alice"}, searchSubjects(t, caches, toCriteria))
}

func TestFolderEmailSearchDates(t *testing.T) {
	caches := newTestCaches(t)

	early := makeSearchTestEmail(1, "early")
	early.Date = time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	late := makeSearchTestEmail(2, "late")
	late.Date = time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC)
	storeSearchTestEmail(t, caches, early)
	storeSearchTestEmail(t, caches, late)

	since := &imap.SearchCriteria{Since: time.Date(2026, 3, 1, 0, 0, 0, 0, time.UTC)}
	assert.Equal(t, []string{"late"}, searchSubjects(t, caches, since))

	before := &imap.SearchCriteria{Before: time.Date(2026, 3, 1, 0, 0, 0, 0, time.UTC)}
	assert.Equal(t, []string{"early"}, searchSubjects(t, caches, before))

	// Since is inclusive, Before is exclusive
	boundary := &imap.SearchCriteria{Since: early.Date}
	assert.ElementsMatch(t, []string{"early", "late"}, searchSubjects(t, caches, boundary))
	boundaryBefore := &imap.SearchCriteria{Before: early.Date}
	assert.Empty(t, searchSubjects(t, caches, boundaryBefore))
}

func TestFolderEmailSearchFlags(t *testing.T) {
	caches := newTestCaches(t)

	seen := makeSearchTestEmail(1, "seen")
	seen.Flags = []imap.Flag{imap.FlagSeen}
	unseenFlagged := makeSearchTestEmail(2, "unseen flagged")
	unseenFlagged.Flags = []imap.Flag{imap.FlagFlagged}
	storeSearchTestEmail(t, caches, seen)
	storeSearchTestEmail(t, caches, unseenFlagged)

	assert.Equal(t, []string{"seen"},
		searchSubjects(t, caches, &imap.SearchCriteria{Flag: []imap.Flag{imap.FlagSeen}}))
	assert.Equal(t, []string{"unseen flagged"},
		searchSubjects(t, caches, &imap.SearchCriteria{NotFlag: []imap.Flag{imap.FlagSeen}}))
	assert.Equal(t, []string{"unseen flagged"},
		searchSubjects(t, caches, &imap.SearchCriteria{Flag: []imap.Flag{imap.FlagFlagged}}))
}

func TestFolderEmailSearchNot(t *testing.T) {
	caches := newTestCaches(t)

	fromAlice := makeSearchTestEmail(1, "report from alice")
	fromAlice.From = []types.Address{{Email: "alice@example.com"}}
	fromBob := makeSearchTestEmail(2, "report from bob")
	fromBob.From = []types.Address{{Email: "bob@example.com"}}
	storeSearchTestEmail(t, caches, fromAlice)
	storeSearchTestEmail(t, caches, fromBob)

	criteria := &imap.SearchCriteria{
		Text: []string{"report"},
		Not: []imap.SearchCriteria{
			{Header: []imap.SearchCriteriaHeaderField{{Key: "From", Value: "bob"}}},
		},
	}
	assert.Equal(t, []string{"report from alice"}, searchSubjects(t, caches, criteria))
}

func TestFolderEmailSearchLikeEscaping(t *testing.T) {
	caches := newTestCaches(t)

	storeSearchTestEmail(t, caches, makeSearchTestEmail(1, "100% guaranteed"))
	storeSearchTestEmail(t, caches, makeSearchTestEmail(2, "100x guaranteed"))
	storeSearchTestEmail(t, caches, makeSearchTestEmail(3, "under_score"))
	storeSearchTestEmail(t, caches, makeSearchTestEmail(4, "underscore"))
	storeSearchTestEmail(t, caches, makeSearchTestEmail(5, `back\slash`))

	assert.Equal(t, []string{"100% guaranteed"}, searchSubjects(t, caches, textCriteria("100%")))
	assert.Equal(t, []string{"under_score"}, searchSubjects(t, caches, textCriteria("under_")))
	assert.Equal(t, []string{`back\slash`}, searchSubjects(t, caches, textCriteria(`back\`)))
}

func TestFolderEmailSearchScoping(t *testing.T) {
	caches := newTestCaches(t)

	inboxEmail := makeSearchTestEmail(1, "hello inbox")
	otherFolder := makeSearchTestEmail(2, "hello archive")
	otherFolder.FolderName = "archive"
	otherAccount := makeSearchTestEmail(3, "hello other account")
	otherAccount.AccountID = "acct2"
	for _, email := range []*types.Email{inboxEmail, otherFolder, otherAccount} {
		storeSearchTestEmail(t, caches, email)
	}

	assert.Equal(t, []string{"hello inbox"}, searchSubjects(t, caches, textCriteria("hello")))
	assert.Equal(t, []string{"hello archive"},
		searchSubjects(t, caches, textCriteria("hello"), "acct", "archive"))
	assert.Equal(t, []string{"hello other account"},
		searchSubjects(t, caches, textCriteria("hello"), "acct2", "inbox"))
}

func TestFolderEmailSearchOrderAndLimit(t *testing.T) {
	caches := newTestCaches(t)

	for uid := imap.UID(1); uid <= 5; uid++ {
		storeSearchTestEmail(t, caches, makeSearchTestEmail(uid, fmt.Sprintf("email %d", uid)))
	}

	// Newest (highest date) first
	assert.Equal(
		t,
		[]string{"email 5", "email 4", "email 3", "email 2", "email 1"},
		searchSubjects(t, caches, textCriteria("email")),
	)

	emails, err := caches.FolderEmailCache.Search(
		context.Background(), "acct", "inbox", textCriteria("email"), 2)
	assert.NoError(t, err)
	assert.Len(t, emails, 2)
	assert.Equal(t, "email 5", emails[0].Subject)
}

func TestFolderEmailSearchUntranslatable(t *testing.T) {
	caches := newTestCaches(t)
	storeSearchTestEmail(t, caches, makeSearchTestEmail(1, "hello"))

	for name, criteria := range map[string]*imap.SearchCriteria{
		"Larger":        {Larger: 100},
		"Smaller":       {Smaller: 100},
		"Body":          {Body: []string{"hello"}},
		"Or":            {Or: [][2]imap.SearchCriteria{{{Text: []string{"a"}}, {Text: []string{"b"}}}}},
		"GmailRaw":      {GmailRaw: "hello"},
		"UnknownHeader": {Header: []imap.SearchCriteriaHeaderField{{Key: "X-Custom", Value: "x"}}},
		"UnknownFlag":   {Flag: []imap.Flag{imap.FlagDraft}},
		"NotWrapped":    {Not: []imap.SearchCriteria{{Larger: 100}}},
	} {
		emails, err := caches.FolderEmailCache.Search(
			context.Background(), "acct", "inbox", criteria, 100)
		assert.NoError(t, err, name)
		assert.Nil(t, emails, name)
	}
}

func TestFolderEmailSearchAttachments(t *testing.T) {
	caches := newTestCaches(t)

	withAttachment := makeSearchTestEmail(1, "with attachment")
	withAttachment.Parts = []types.BodyPart{
		{PartStr: "2", Type: "application/pdf", Description: "file.pdf", Size: 100},
	}
	storeSearchTestEmail(t, caches, withAttachment)
	storeSearchTestEmail(t, caches, makeSearchTestEmail(2, "without attachment"))

	criteria := &imap.SearchCriteria{
		Header: []imap.SearchCriteriaHeaderField{{Key: "Content-Type", Value: "multipart/mixed"}},
	}
	assert.Equal(t, []string{"with attachment"}, searchSubjects(t, caches, criteria))
}

func TestFolderEmailSearchMissingSearchRow(t *testing.T) {
	caches := newTestCaches(t)
	storeSearchTestEmail(t, caches, makeSearchTestEmail(1, "hello"))

	// Simulate a pre-upgrade email with no search row
	_, err := caches.db.Exec("DELETE FROM folder_email_search")
	assert.NoError(t, err)

	assert.Empty(t, searchSubjects(t, caches, textCriteria("hello")))
}

func TestFolderEmailSearchReplaceRefreshes(t *testing.T) {
	caches := newTestCaches(t)

	email := makeSearchTestEmail(1, "hello")
	storeSearchTestEmail(t, caches, email)

	seenCriteria := &imap.SearchCriteria{Flag: []imap.Flag{imap.FlagSeen}}
	assert.Empty(t, searchSubjects(t, caches, seenCriteria))

	email.Flags = []imap.Flag{imap.FlagSeen}
	assert.NoError(t, caches.FolderEmailCache.Upsert(context.Background(), email))

	assert.Equal(t, []string{"hello"}, searchSubjects(t, caches, seenCriteria))
}

func TestFolderEmailSearchDeleteCascades(t *testing.T) {
	caches := newTestCaches(t)
	storeSearchTestEmail(t, caches, makeSearchTestEmail(1, "hello"))

	assert.NoError(t, caches.FolderEmailCache.Delete(context.Background(), "acct", "inbox", 1))

	var count int
	assert.NoError(t, caches.db.QueryRow("SELECT COUNT(*) FROM folder_email_search").Scan(&count))
	assert.Equal(t, 0, count)
}
