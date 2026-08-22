package imaptest

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/oxygem/kanmail/internal/types"
)

// Testing an account discovers its namespaces and special folders: what the
// fake server is told to report for each shape is checked here against what
// the real one says
func TestDiscoverSettings(t *testing.T) {
	forEachTarget(t, func(t *testing.T, tg *target) {
		e := newEnv(t, tg)
		account := e.newAccount(newCaches(t))
		require.NoError(t, account.FetchAndUpdateSettings(e.ctx))

		assert.Equal(t, tg.namespaces, account.Settings.Namespaces)
		assert.Equal(t, types.FolderName("INBOX"), account.Folders.Inbox)
		for _, special := range types.SpecialFolders {
			if special.Alias == "inbox" {
				continue
			}
			want := tg.special[special.Alias]
			assert.Equal(t, want, *special.Field(&account.Folders), "mapping for %s", special.Alias)
		}
		assert.True(t, account.Settings.SaveSentCopies)
	})
}

// A shared mailbox sits outside the personal namespace, where no walk of the
// personal one reaches it: the account has to list the shared namespace roots
// too. Its name is the server's own, and must resolve back to itself rather
// than be qualified into the personal root
func TestSharedNamespaceMailboxIsListedAndReadable(t *testing.T) {
	forEachTarget(t, func(t *testing.T, tg *target) {
		if tg.sharedMailbox == "" {
			t.Skipf("%s has no mailbox in a shared namespace", tg.name)
		}
		e := newEnv(t, tg)
		e.createMailbox(tg.sharedMailbox)
		t.Cleanup(func() { e.raw.Delete(tg.sharedMailbox).Wait() })
		uids := e.seed(tg.sharedMailbox, 2)

		names, err := e.account.FetchFolderNames(e.ctx)
		require.NoError(t, err)
		assert.Contains(t, names, types.FolderName(tg.sharedMailbox))

		shared := e.folder(tg.sharedMailbox)
		assert.Equal(t, types.FolderName(tg.sharedMailbox), shared.Name)
		resp := e.paginate(shared, 10)
		assert.False(t, resp.Meta.Missing)
		assert.ElementsMatch(t, uids, emailUIDs(resp.Emails))
	})
}

// The special folder mappings come from SPECIAL-USE where the server has it,
// and the server's baseline folders carry the attributes the table claims
func TestSpecialUseAttributes(t *testing.T) {
	forEachTarget(t, func(t *testing.T, tg *target) {
		e := newEnv(t, tg)
		list, err := e.account.FetchMailboxList(e.ctx)
		require.NoError(t, err)

		for _, special := range types.SpecialFolders {
			name, mapped := tg.special[special.Alias]
			if !mapped {
				continue
			}
			var attrs []string
			for _, mailbox := range list {
				if mailbox.Mailbox == string(name) {
					for _, attr := range mailbox.Attrs {
						attrs = append(attrs, string(attr))
					}
				}
			}
			var hasSpecialUse bool
			for _, attr := range special.Attrs {
				if assert.ObjectsAreEqual(true, containsString(attrs, string(attr))) {
					hasSpecialUse = true
				}
			}
			assert.Equal(t, tg.specialUse, hasSpecialUse, "%s should%s carry SPECIAL-USE, has %v",
				name, map[bool]string{true: "", false: " not"}[tg.specialUse], attrs)
		}
	})
}

func containsString(haystack []string, needle string) bool {
	for _, s := range haystack {
		if s == needle {
			return true
		}
	}
	return false
}

// Every name the folder picker offers resolves back to the mailbox it came
// from, whatever the server's prefix and delimiter: the personal root is
// stripped from logical names, nested names keep the server's delimiter, and
// the INBOX, mapped special folders and unselectable levels are left out
func TestFolderNamesResolveBack(t *testing.T) {
	forEachTarget(t, func(t *testing.T, tg *target) {
		e := newEnv(t, tg)
		work := tg.qualify("Work")
		admin := tg.qualify(tg.join("Work", "Admin"))
		reports := tg.qualify(tg.join("Q1", "Reports"))
		for _, name := range []string{work, admin, reports} {
			e.createMailbox(name)
		}

		names, err := e.account.FetchFolderNames(e.ctx)
		require.NoError(t, err)

		logicalWork := types.FolderName("Work")
		logicalAdmin := types.FolderName(tg.join("Work", "Admin"))
		logicalReports := types.FolderName(tg.join("Q1", "Reports"))
		assert.Contains(t, names, logicalWork)
		assert.Contains(t, names, logicalAdmin)
		assert.Contains(t, names, logicalReports)
		assert.NotContains(t, names, types.FolderName("INBOX"))
		assert.NotContains(t, names, types.FolderName("inbox"))
		for alias, mapped := range tg.special {
			assert.NotContains(t, names, alias)
			assert.NotContains(t, names, mapped)
		}
		// Q1 is a level with no mailbox of its own on servers that synthesise
		// parents (\Noselect) rather than creating them
		for _, name := range names {
			resolved := e.account.GetFolder(name).Name
			assert.True(t, e.mailboxExists(string(resolved)), "%s resolves to %s which should exist", name, resolved)
		}

		assert.Equal(t, types.FolderName(work), e.folder("Work").Name)
		assert.Equal(t, types.FolderName(admin), e.folder(tg.join("Work", "Admin")).Name)
		assert.Equal(t, types.FolderName(work), e.folder(work).Name, "a full name passes through")
		assert.Same(t, e.folder("Work"), e.folder(work), "one Folder per mailbox")
	})
}

// Mailboxes nested under the INBOX (as Outlook and Maildir++ servers allow)
// are listed and addressable by their full name
func TestInboxChildrenListed(t *testing.T) {
	forEachTarget(t, func(t *testing.T, tg *target) {
		e := newEnv(t, tg)
		receipts := tg.join("INBOX", "Receipts")
		e.createMailbox(receipts)
		if !e.mailboxExists(receipts) {
			t.Skipf("%s does not nest under the INBOX", tg.name)
		}
		year := tg.join("INBOX", "Receipts", "2026")
		e.createMailbox(year)

		names, err := e.account.FetchFolderNames(e.ctx)
		require.NoError(t, err)
		assert.Contains(t, names, e.account.DisplayFolderName(types.FolderName(receipts)))
		assert.Contains(t, names, e.account.DisplayFolderName(types.FolderName(year)))

		for _, name := range []string{receipts, year} {
			folder := e.folder(name)
			assert.Equal(t, types.FolderName(name), folder.Name)
			resp := e.paginate(folder, 10)
			assert.False(t, resp.Meta.Missing, "%s should be selectable", name)
		}
	})
}

// The special folder aliases address the server's own folders, and a write
// through an alias lands where the server (and other clients) expect it
func TestSpecialFolderAliases(t *testing.T) {
	forEachTarget(t, func(t *testing.T, tg *target) {
		e := newEnv(t, tg)
		for alias, mapped := range tg.special {
			folder := e.folder(string(alias))
			assert.Equal(t, mapped, folder.Name, alias)

			before := e.count(string(mapped))
			_, err := folder.AppendEmail(e.ctx, *messageBuffer(message{subject: "Via " + string(alias)}))
			require.NoError(t, err, alias)
			assert.Equal(t, before+1, e.count(string(mapped)), "append via %s", alias)
		}

		// An alias with nothing mapped is Kanmail's to invent, inside the
		// personal namespace
		assert.Empty(t, e.account.Folders.Archive, "no server here has an archive")
		assert.Equal(t, types.FolderName(tg.qualify("archive")), e.folder("archive").Name)
	})
}
