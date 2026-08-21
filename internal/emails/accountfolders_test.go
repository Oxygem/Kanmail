package emails

import (
	"bytes"
	"encoding/json"
	"testing"

	"github.com/emersion/go-imap/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/oxygem/kanmail/internal/emails/imapinterface"
	"github.com/oxygem/kanmail/internal/types"
)

var (
	// Courier: everything personal lives under "INBOX.", shared mailboxes
	// under "shared.", and any other name is rejected outright
	courierNamespaces = imap.NamespaceData{
		Personal: []imap.NamespaceDescriptor{{Prefix: "INBOX.", Delim: '.'}},
		Shared:   []imap.NamespaceDescriptor{{Prefix: "shared.", Delim: '.'}},
	}
	// Cyrus with altnamespace on: an empty personal prefix, other users under
	// "user." and shared mailboxes at the root
	cyrusNamespaces = imap.NamespaceData{
		Personal: []imap.NamespaceDescriptor{{Prefix: "", Delim: '.'}},
		Other:    []imap.NamespaceDescriptor{{Prefix: "user.", Delim: '.'}},
		Shared:   []imap.NamespaceDescriptor{{Prefix: "", Delim: '.'}},
	}
	// Cyrus with altnamespace off: everything personal lives under "INBOX." as
	// on Courier, with other users and shared mailboxes still at the root
	cyrusSharedRootNamespaces = imap.NamespaceData{
		Personal: []imap.NamespaceDescriptor{{Prefix: "INBOX.", Delim: '.'}},
		Other:    []imap.NamespaceDescriptor{{Prefix: "user.", Delim: '.'}},
		Shared:   []imap.NamespaceDescriptor{{Prefix: "", Delim: '.'}},
	}
)

// recordingIMAPClient passes everything through to the fake server, keeping the
// LIST references it was asked for: what the server sees is the whole point of
// a namespace root, and the fake is more forgiving about a reference missing
// its delimiter than a real server is.
type recordingIMAPClient struct {
	imapinterface.IMAPClient
	references []string
}

func (c *recordingIMAPClient) List(reference, pattern string, options *imap.ListOptions) imapinterface.ListCommand {
	c.references = append(c.references, reference)
	return c.IMAPClient.List(reference, pattern, options)
}

// newNamespacedTestAccount builds an account against a fake server with the
// given namespaces, holding the given folders and nothing else.
func newNamespacedTestAccount(t *testing.T, namespaces imap.NamespaceData, folders ...string) (*Account, string) {
	t.Helper()

	account, _, _ := newTestAccount(t)
	for _, name := range []string{"inbox", "sent", "drafts", "archive", "trash"} {
		imapinterface.DeleteFakeFolder(t.Name(), name)
	}
	imapinterface.SetFakeNamespaces(t.Name(), namespaces)
	for _, name := range folders {
		imapinterface.CreateFakeFolder(t.Name(), name)
	}
	return account, t.Name()
}

func newCourierTestAccount(t *testing.T, folders ...string) (*Account, string) {
	t.Helper()
	return newNamespacedTestAccount(t, courierNamespaces, folders...)
}

func TestFetchSettingsMapsPrefixedNamespace(t *testing.T) {
	account, _ := newCourierTestAccount(t, "INBOX", "INBOX.Sent", "INBOX.Drafts", "INBOX.Trash", "INBOX.spam")
	ctx := t.Context()

	require.NoError(t, account.FetchAndUpdateSettings(ctx))

	assert.Equal(t, types.Namespaces{
		Personal: []types.Namespace{{Prefix: "INBOX.", Delim: "."}},
		Shared:   []types.Namespace{{Prefix: "shared.", Delim: "."}},
	}, account.Settings.Namespaces)
	// The INBOX sits outside the namespace, so only an explicit lookup finds it
	assert.Equal(t, types.FolderName("INBOX"), account.Folders.Inbox)
	assert.Equal(t, types.FolderName("INBOX.Sent"), account.Folders.Sent)
	assert.Equal(t, types.FolderName("INBOX.Drafts"), account.Folders.Drafts)
	assert.Equal(t, types.FolderName("INBOX.Trash"), account.Folders.Trash)
	// Servers vary on casing, matching it exactly would leave this unmapped
	assert.Equal(t, types.FolderName("INBOX.spam"), account.Folders.Junk)
	// Nothing on the server looks like an archive
	assert.Empty(t, account.Folders.Archive)

	// Everything on this server is the INBOX or mapped, so nothing is left to
	// make a column from
	names, err := account.FetchFolderNames(ctx)
	assert.NoError(t, err)
	assert.Empty(t, names)
}

// The reported bug: an unmapped column asked for the bare alias, which Courier
// refuses as outside the namespace rather than reporting it missing - so the
// column errored instead of showing up empty.
func TestUnmappedFolderStaysInsideNamespace(t *testing.T) {
	account, _ := newCourierTestAccount(t, "INBOX", "INBOX.Sent")
	ctx := t.Context()
	require.NoError(t, account.FetchAndUpdateSettings(ctx))

	folder := account.GetFolder("archive")
	assert.Equal(t, types.FolderName("INBOX.archive"), folder.Name)

	resp, err := folder.PaginateEmails(ctx, PaginateOptions{BatchSize: 10})
	assert.NoError(t, err)
	assert.Empty(t, resp.Emails)
	assert.True(t, resp.Meta.Missing)

	sync, err := folder.SyncEmails(ctx)
	assert.NoError(t, err)
	assert.True(t, sync.Meta.Missing)
}

// Writing into an unmapped folder creates it - which only works if the name is
// inside the namespace, servers reject a CREATE outside it just as they do a SELECT.
func TestAppendToUnmappedFolderCreatesItInNamespace(t *testing.T) {
	account, key := newCourierTestAccount(t, "INBOX", "INBOX.Sent")
	ctx := t.Context()
	require.NoError(t, account.FetchAndUpdateSettings(ctx))

	var b bytes.Buffer
	b.WriteString("Subject: test\r\n\r\nbody")
	_, err := account.GetFolder("archive").AppendEmail(ctx, b)
	assert.NoError(t, err)
	assert.Equal(t, uint32(1), fakeFolderMessages(t, key, "INBOX.archive"))
}

// Custom columns are free text the user types, so they arrive unqualified and
// hit the same wall as an unmapped alias - both reading and creating them.
func TestCustomFolderQualifiedIntoNamespace(t *testing.T) {
	account, key := newCourierTestAccount(t, "INBOX", "INBOX.Sent")
	ctx := t.Context()
	require.NoError(t, account.FetchAndUpdateSettings(ctx))

	folder := account.GetFolder("needs Reply")
	assert.Equal(t, types.FolderName("INBOX.needs Reply"), folder.Name)

	resp, err := folder.PaginateEmails(ctx, PaginateOptions{BatchSize: 10})
	assert.NoError(t, err)
	assert.True(t, resp.Meta.Missing)

	inbox := account.GetFolder("inbox")
	appendFakeMessage(t, key, "INBOX")
	uids := paginateUIDs(t, inbox, ctx)
	require.Len(t, uids, 1)

	assert.NoError(t, inbox.MoveEmails(ctx, "needs Reply", uids))
	assert.Equal(t, uint32(1), fakeFolderMessages(t, key, "INBOX.needs Reply"))
}

// Names inside a namespace (as the server would list them) are left alone,
// the INBOX segment folded to its canonical spelling rather than prefixed
// again; anything else is a logical name and gets qualified - including names
// with the delimiter in them, which mean a nested folder.
func TestQualifiedFolderNamesAreLeftAlone(t *testing.T) {
	account, _ := newCourierTestAccount(t, "INBOX", "INBOX.Sent")
	ctx := t.Context()
	require.NoError(t, account.FetchAndUpdateSettings(ctx))

	for name, want := range map[types.FolderName]types.FolderName{
		"INBOX.Sent":           "INBOX.Sent",
		"INBOX.Work.Admin":     "INBOX.Work.Admin",
		"inbox.Work":           "INBOX.Work",
		"Inbox.Sent":           "INBOX.Sent",
		"INBOX":                "INBOX",
		"inbox":                "INBOX",
		"shared.announcements": "shared.announcements",
		"Reply":                "INBOX.Reply",
		"Work.Admin":           "INBOX.Work.Admin",
		"Q1.Reports":           "INBOX.Q1.Reports",
		"INBOXES.Q1":           "INBOX.INBOXES.Q1",
	} {
		assert.Equal(t, want, account.resolveFolderName(name), "resolve %s", name)
	}
}

// Nothing moves on an account that has never been tested (zero namespaces) or
// a server without a prefix, which is most of them - existing accounts keep
// addressing (and caching) the mailboxes they always have, bar the INBOX
// gaining its one canonical spelling
func TestFolderNamesUnchangedWithoutPrefix(t *testing.T) {
	account, _, _ := newTestAccount(t)

	for _, name := range []types.FolderName{"archive", "Reply", "Work/Admin", "INBOX.Sent"} {
		assert.Equal(t, name, account.resolveFolderName(name))
	}
	assert.Equal(t, types.FolderName("INBOX"), account.resolveFolderName("inbox"))
	assert.Equal(t, types.FolderName("INBOX"), account.resolveFolderName("Inbox"))
}

// A legacy prefix the user typed may lack its delimiter, so it gains one before
// being joined on - else "INBOXReply"
func TestLegacyPrefixWithoutDelimiterIsJoined(t *testing.T) {
	account, _, _ := newTestAccount(t)
	account.Settings.Namespaces = types.Namespaces{Personal: []types.Namespace{{Prefix: "INBOX", Delim: "."}}}

	for name, want := range map[types.FolderName]types.FolderName{
		"Reply":      "INBOX.Reply",
		"INBOX.Sent": "INBOX.Sent",
		"INBOXES":    "INBOX.INBOXES",
		"inbox":      "INBOX",
	} {
		assert.Equal(t, want, account.resolveFolderName(name), "resolve %s", name)
	}
}

// The INBOX is namespace exempt and case insensitive, so it resolves whatever
// the server does or doesn't report about it - and without gaining the prefix
func TestInboxResolvesWithoutMapping(t *testing.T) {
	account, _ := newCourierTestAccount(t, "INBOX", "INBOX.Sent")
	account.Settings.Namespaces = types.NamespacesFromIMAP(&courierNamespaces)
	ctx := t.Context()

	folder := account.GetFolder("inbox")
	assert.Equal(t, types.FolderName("INBOX"), folder.Name)

	resp, err := folder.PaginateEmails(ctx, PaginateOptions{BatchSize: 10})
	assert.NoError(t, err)
	assert.False(t, resp.Meta.Missing)
}

// A mailbox merely named like the inbox, inside the namespace, must not displace
// the INBOX itself - whichever order the server lists them in
func TestInboxMappingPrefersTheInbox(t *testing.T) {
	account, _ := newCourierTestAccount(t, "INBOX", "INBOX.Inbox", "INBOX.Sent")
	require.NoError(t, account.FetchAndUpdateSettings(t.Context()))

	assert.Equal(t, types.FolderName("INBOX"), account.Folders.Inbox)
}

// Nor may a localised look-alike at the root: the INBOX is listed first and
// claims the mapping
func TestLookalikeInboxDoesNotTakeMapping(t *testing.T) {
	account, _, ctx := newTestAccount(t)
	imapinterface.CreateFakeFolder(t.Name(), "Posteingang")

	require.NoError(t, account.FetchAndUpdateSettings(ctx))
	assert.Equal(t, types.FolderName("INBOX"), account.Folders.Inbox)
}

// Discovery fills empty mappings only, so an inbox mapping the user set stays
func TestUserInboxMappingSurvivesDiscovery(t *testing.T) {
	account, _ := newCourierTestAccount(t, "INBOX", "INBOX.Triage", "INBOX.Sent")
	account.Folders.Inbox = "INBOX.Triage"

	require.NoError(t, account.FetchAndUpdateSettings(t.Context()))
	assert.Equal(t, types.FolderName("INBOX.Triage"), account.Folders.Inbox)
	assert.Equal(t, types.FolderName("INBOX.Triage"), account.GetFolder("inbox").Name)
}

// Other users' mailboxes (Cyrus "user.") are server-given names and pass
// through untouched, even though the personal prefix is empty
func TestOtherUsersNamespacePassesThrough(t *testing.T) {
	account, _ := newNamespacedTestAccount(t, cyrusNamespaces, "INBOX", "Sent", "user.bob.Projects")
	ctx := t.Context()
	require.NoError(t, account.FetchAndUpdateSettings(ctx))

	assert.Equal(t, types.Namespaces{
		Personal: []types.Namespace{{Prefix: "", Delim: "."}},
		Other:    []types.Namespace{{Prefix: "user.", Delim: "."}},
		Shared:   []types.Namespace{{Prefix: "", Delim: "."}},
	}, account.Settings.Namespaces)
	assert.Equal(t, types.FolderName("Sent"), account.Folders.Sent)
	assert.Equal(t, types.FolderName("user.bob.Projects"), account.resolveFolderName("user.bob.Projects"))
	assert.Equal(t, types.FolderName("Work"), account.resolveFolderName("Work"))

	names, err := account.FetchFolderNames(ctx)
	assert.NoError(t, err)
	assert.Contains(t, names, types.FolderName("user.bob.Projects"))
}

// Shared mailboxes on a prefixed server likewise pass through, where the same
// name typed without its namespace is a logical one and lands in the personal
// namespace
func TestSharedNamespacePassesThrough(t *testing.T) {
	account, _ := newCourierTestAccount(t, "INBOX", "shared.announcements")
	ctx := t.Context()
	require.NoError(t, account.FetchAndUpdateSettings(ctx))

	assert.Equal(t, types.FolderName("shared.announcements"), account.resolveFolderName("shared.announcements"))
	assert.Equal(t, types.FolderName("INBOX.announcements"), account.resolveFolderName("announcements"))

	names, err := account.FetchFolderNames(ctx)
	assert.NoError(t, err)
	assert.Contains(t, names, types.FolderName("shared.announcements"))

	resp, err := account.GetFolder("shared.announcements").PaginateEmails(ctx, PaginateOptions{BatchSize: 10})
	assert.NoError(t, err)
	assert.False(t, resp.Meta.Missing)
}

// Without NAMESPACE the server is taken as prefix-less and the delimiter comes
// from LIST "" "", so nested folders still list
func TestDelimiterLearntWithoutNamespaceCapability(t *testing.T) {
	account, key := newNamespacedTestAccount(t, imap.NamespaceData{
		Personal: []imap.NamespaceDescriptor{{Prefix: "", Delim: '.'}},
	}, "INBOX", "Work", "Work.Admin")
	imapinterface.SetFakeNamespaceSupported(key, false)
	ctx := t.Context()

	require.NoError(t, account.FetchAndUpdateSettings(ctx))
	assert.Equal(t, types.Namespaces{Personal: []types.Namespace{{Prefix: "", Delim: "."}}}, account.Settings.Namespaces)

	names, err := account.FetchFolderNames(ctx)
	assert.NoError(t, err)
	assert.Contains(t, names, types.FolderName("Work.Admin"))
	assert.Equal(t, types.FolderName("Work.Admin"), account.resolveFolderName("Work.Admin"))
}

// A flat server reports NIL for its delimiter, which must not be stored as a
// NUL byte separator that then sneaks into LIST patterns and prefix checks
func TestFlatNamespaceGetsDefaultSeparator(t *testing.T) {
	account, _, ctx := newTestAccount(t)
	require.NoError(t, account.FetchAndUpdateSettings(ctx))

	assert.Equal(t, types.Namespaces{Personal: []types.Namespace{{}}}, account.Settings.Namespaces)
	assert.Equal(t, "/", account.Settings.Namespaces.Delim())
	assert.Empty(t, account.Settings.Namespaces.PersonalRoot())
	assert.Equal(t, types.FolderName("INBOX"), account.Folders.Inbox)
}

// An account that listed nested folders before the settings migration still
// does after it, without being re-tested: the delimiter it had is carried
// across into its personal namespace
func TestMigratedDelimiterListsNestedFolders(t *testing.T) {
	account, _ := newNamespacedTestAccount(t, imap.NamespaceData{
		Personal: []imap.NamespaceDescriptor{{Prefix: "", Delim: '.'}},
	}, "INBOX", "Work", "Work.Admin")
	ctx := t.Context()

	migrated, did, err := types.MigrateSettingsJSON([]byte(
		`{"accounts": [{"settings": {"folderPrefix": "", "folderSeparator": "."}}]}`,
	))
	require.NoError(t, err)
	require.True(t, did)
	var settings types.Settings
	require.NoError(t, json.Unmarshal(migrated, &settings))
	account.Settings.Namespaces = settings.Accounts[0].Settings.Namespaces

	names, err := account.FetchFolderNames(ctx)
	assert.NoError(t, err)
	assert.Contains(t, names, types.FolderName("Work.Admin"))
	assert.Equal(t, types.FolderName("Work.Admin"), account.resolveFolderName("Work.Admin"))
	assert.Equal(t, types.FolderName("INBOX"), account.resolveFolderName("inbox"))
}

// The picker offers logical names - the personal root stripped, other and
// shared mailboxes in full, the INBOX, mapped folders and unselectable levels
// left out - and resolving any of them gets the mailbox back. So a column made
// from one account's list works on another with a different prefix: "Work" is
// INBOX.Work on Courier and Work on Gmail.
func TestFolderNamesAreLogicalAndResolveBack(t *testing.T) {
	for _, tc := range []struct {
		name       string
		namespaces imap.NamespaceData
		folders    []string
		mapArchive types.FolderName
		wantNames  []types.FolderName
		wantWork   types.FolderName
	}{
		{
			name:       "courier",
			namespaces: courierNamespaces,
			folders:    []string{"INBOX", "INBOX.Sent", "INBOX.Work", "INBOX.Work.Admin", "INBOX.Q1.Reports", "shared.announcements"},
			wantNames:  []types.FolderName{"Work", "Work.Admin", "Q1.Reports", "shared.announcements"},
			wantWork:   "INBOX.Work",
		},
		{
			name:       "cyrus",
			namespaces: cyrusNamespaces,
			folders:    []string{"INBOX", "Sent", "Work.Admin", "user.bob.Projects"},
			wantNames:  []types.FolderName{"Work.Admin", "user.bob.Projects"},
			wantWork:   "Work",
		},
		{
			name:       "gmail",
			namespaces: imap.NamespaceData{Personal: []imap.NamespaceDescriptor{{Prefix: "", Delim: '/'}}},
			folders:    []string{"INBOX", "Sent", "[Gmail]/All Mail", "Work", "Work/Admin"},
			mapArchive: "[Gmail]/All Mail",
			wantNames:  []types.FolderName{"Work", "Work/Admin"},
			wantWork:   "Work",
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			account, key := newNamespacedTestAccount(t, tc.namespaces, tc.folders...)
			ctx := t.Context()
			require.NoError(t, account.FetchAndUpdateSettings(ctx))
			if tc.mapArchive != "" {
				account.Folders.Archive = tc.mapArchive
			}

			names, err := account.FetchFolderNames(ctx)
			require.NoError(t, err)
			assert.ElementsMatch(t, tc.wantNames, names)
			for _, name := range names {
				resolved := account.resolveFolderName(name)
				assert.True(t, fakeFolderExists(key, string(resolved)), "%s resolves to %s which should exist", name, resolved)
			}
			assert.Equal(t, tc.wantWork, account.resolveFolderName("Work"))
		})
	}
}

// However a mailbox is asked for - logical name, full name, alias - there is
// one Folder for it, and a move between two names for it is refused rather
// than sent to the server as a move onto itself
func TestOneFolderPerMailbox(t *testing.T) {
	account, key := newCourierTestAccount(t, "INBOX", "INBOX.Sent", "INBOX.Work")
	ctx := t.Context()
	require.NoError(t, account.FetchAndUpdateSettings(ctx))

	work := account.GetFolder("Work")
	assert.Same(t, work, account.GetFolder("INBOX.Work"))
	assert.Same(t, work, account.GetFolder("inbox.Work"))
	assert.Same(t, account.GetFolder("sent"), account.GetFolder("INBOX.Sent"))
	assert.Same(t, account.GetFolder("inbox"), account.GetFolder("INBOX"))

	appendFakeMessage(t, key, "INBOX.Work")
	uids := paginateUIDs(t, work, ctx)
	require.Len(t, uids, 1)
	assert.ErrorIs(t, work.MoveEmails(ctx, "INBOX.Work", uids), errSameFolder)
	assert.ErrorIs(t, work.CopyEmails(ctx, "inbox.Work", uids), errSameFolder)
	assert.Equal(t, uint32(1), fakeFolderMessages(t, key, "INBOX.Work"))

	// Names resolving to different mailboxes still move
	assert.NoError(t, work.MoveEmails(ctx, "Work.Done", uids))
	assert.Equal(t, uint32(1), fakeFolderMessages(t, key, "INBOX.Work.Done"))
}

// The logical name of a mailbox is the inverse of resolving it: the alias for a
// mapped mailbox and the INBOX, the root stripped otherwise - and the full name
// where stripping would mean something else
func TestLogicalFolderName(t *testing.T) {
	account, _ := newCourierTestAccount(t, "INBOX", "INBOX.Sent", "INBOX.Work", "shared.announcements")
	ctx := t.Context()
	require.NoError(t, account.FetchAndUpdateSettings(ctx))

	for name, want := range map[types.FolderName]types.FolderName{
		"INBOX":                "inbox",
		"INBOX.Sent":           "sent",
		"INBOX.Work":           "Work",
		"INBOX.Work.Admin":     "Work.Admin",
		"INBOX.archive":        "archive",
		"INBOX.Inbox":          "INBOX.Inbox",
		"shared.announcements": "shared.announcements",
	} {
		assert.Equal(t, want, account.DisplayFolderName(name), "logical %s", name)
		assert.Equal(t, name, account.resolveFolderName(account.DisplayFolderName(name)), "round trip %s", name)
	}
}

// Servers with an empty personal prefix nest folders under the INBOX
// (Office365, Dovecot Maildir++), which the namespace roots never reach - the
// INBOX being listed on its own, outside them
func TestInboxChildrenAreListed(t *testing.T) {
	account, _ := newNamespacedTestAccount(t, imap.NamespaceData{
		Personal: []imap.NamespaceDescriptor{{Prefix: "", Delim: '/'}},
	}, "INBOX", "INBOX/Receipts", "INBOX/Receipts/2026", "Work")
	ctx := t.Context()
	require.NoError(t, account.FetchAndUpdateSettings(ctx))

	list, err := account.FetchMailboxList(ctx)
	require.NoError(t, err)
	mailboxes := make([]string, 0, len(list))
	for _, mailbox := range list {
		mailboxes = append(mailboxes, mailbox.Mailbox)
	}
	assert.ElementsMatch(t, []string{"INBOX", "INBOX/Receipts", "INBOX/Receipts/2026", "Work"}, mailboxes)

	names, err := account.FetchFolderNames(ctx)
	require.NoError(t, err)
	assert.ElementsMatch(t, []types.FolderName{"INBOX/Receipts", "INBOX/Receipts/2026", "Work"}, names)
}

// Children are listed under the namespace root, delimiter attached: a legacy
// prefix without one asks a real server for "INBOX%", which matches no child
func TestListChildrenUsesTheNamespaceRoot(t *testing.T) {
	account, key := newNamespacedTestAccount(t, imap.NamespaceData{
		Personal: []imap.NamespaceDescriptor{{Prefix: "INBOX.", Delim: '.'}},
	}, "INBOX", "INBOX.Work")
	account.Settings.Namespaces = types.Namespaces{Personal: []types.Namespace{{Prefix: "INBOX", Delim: "."}}}

	client := &recordingIMAPClient{IMAPClient: imapinterface.NewFakeIMAPClient(key)}
	list, err := listMailboxesRecursive(t.Context(), client, account.Settings.Namespaces)
	require.NoError(t, err)

	assert.Contains(t, client.references, "INBOX.")
	assert.NotContains(t, client.references, "INBOX")
	mailboxes := make([]string, 0, len(list))
	for _, mailbox := range list {
		mailboxes = append(mailboxes, mailbox.Mailbox)
	}
	assert.Contains(t, mailboxes, "INBOX.Work")
}

// A shared namespace at the root would contain every name, leaving nothing to
// qualify into the personal one - recreating the failure this all exists to fix
func TestSharedRootDoesNotDefeatQualification(t *testing.T) {
	account, _ := newNamespacedTestAccount(t, cyrusSharedRootNamespaces, "INBOX", "INBOX.Sent", "user.bob.Projects")
	ctx := t.Context()
	require.NoError(t, account.FetchAndUpdateSettings(ctx))

	assert.Equal(t, types.FolderName("INBOX.Work"), account.resolveFolderName("Work"))
	assert.Equal(t, types.FolderName("INBOX.Sent"), account.resolveFolderName("sent"))
	assert.Equal(t, types.FolderName("INBOX.archive"), account.resolveFolderName("archive"))
	assert.Equal(t, types.FolderName("user.bob.Projects"), account.resolveFolderName("user.bob.Projects"))
}

// The mapping fields are free text, so a short name typed into one is as
// logical a name as a column is - and lands in the namespace the same way,
// rather than outside it where the server refuses to select or create it
func TestMappedFolderQualifiedIntoNamespace(t *testing.T) {
	account, _ := newCourierTestAccount(t, "INBOX", "INBOX.Sent")
	ctx := t.Context()
	require.NoError(t, account.FetchAndUpdateSettings(ctx))
	account.Folders.Archive = "Archive"

	folder := account.GetFolder("archive")
	assert.Equal(t, types.FolderName("INBOX.Archive"), folder.Name)

	resp, err := folder.PaginateEmails(ctx, PaginateOptions{BatchSize: 10})
	assert.NoError(t, err)
	assert.True(t, resp.Meta.Missing)
}

// A mapping typed with another INBOX spelling still resolves, so the mailbox it
// points at is recognised as mapped too - else its column is listed a second
// time as a spare folder and search results file under a name nothing uses
func TestNonCanonicalMappingIsRecognised(t *testing.T) {
	account, _ := newCourierTestAccount(t, "INBOX", "INBOX.Sent")
	ctx := t.Context()
	require.NoError(t, account.FetchAndUpdateSettings(ctx))
	account.Folders.Sent = "inbox.Sent"

	assert.Equal(t, types.FolderName("INBOX.Sent"), account.resolveFolderName("sent"))
	assert.Equal(t, types.FolderName("sent"), account.DisplayFolderName("INBOX.Sent"))

	names, err := account.FetchFolderNames(ctx)
	require.NoError(t, err)
	assert.Empty(t, names)
}

// Where the inbox column is mapped to another mailbox the INBOX is not the
// inbox: labelling it so files its emails into the mapped column, whose UIDs
// mean different emails entirely
func TestLogicalFolderNameWithRemappedInbox(t *testing.T) {
	account, _ := newCourierTestAccount(t, "INBOX", "INBOX.Triage", "INBOX.Sent")
	account.Folders.Inbox = "INBOX.Triage"
	require.NoError(t, account.FetchAndUpdateSettings(t.Context()))

	assert.Equal(t, types.FolderName("inbox"), account.DisplayFolderName("INBOX.Triage"))
	assert.Equal(t, types.FolderName("INBOX"), account.DisplayFolderName("INBOX"))
	assert.Equal(t, types.FolderName("INBOX"), account.resolveFolderName(account.DisplayFolderName("INBOX")))
}

// A mailbox named like an alias mapped elsewhere can't be addressed - the alias
// wins - so it is left out rather than offered as a name that means another
// mailbox, keeping every listed name one that resolves back to itself
func TestMailboxShadowedByMappingIsNotListed(t *testing.T) {
	account, key := newNamespacedTestAccount(t, imap.NamespaceData{
		Personal: []imap.NamespaceDescriptor{{Prefix: "", Delim: '/'}},
	}, "INBOX", "[Gmail]/Sent Mail", "sent", "Work")
	ctx := t.Context()
	require.NoError(t, account.FetchAndUpdateSettings(ctx))
	account.Folders.Sent = "[Gmail]/Sent Mail"

	names, err := account.FetchFolderNames(ctx)
	require.NoError(t, err)
	assert.NotContains(t, names, types.FolderName("sent"))
	assert.NotContains(t, names, types.FolderName("[Gmail]/Sent Mail"))
	assert.Contains(t, names, types.FolderName("Work"))
	for _, name := range names {
		resolved := account.resolveFolderName(name)
		assert.True(t, fakeFolderExists(key, string(resolved)), "%s resolves to %s which should exist", name, resolved)
	}
}
