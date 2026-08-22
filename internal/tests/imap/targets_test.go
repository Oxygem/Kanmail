package imaptest

import (
	"fmt"
	"strings"
	"time"

	"github.com/emersion/go-imap/v2"

	"github.com/oxygem/kanmail/internal/types"
)

// target is one server from docker/docker-compose.yml together with what
// Kanmail should make of it, which is where servers legitimately differ: the
// namespaces they report, the special folders a fresh user has and how they are
// recognised, and the extensions they do and don't speak.
type target struct {
	name     string
	services []string
	// Host ports: implicit TLS and STARTTLS
	port, plainPort int
	// Login name for user n, "user%d" when empty
	userFmt string

	namespaces types.Namespaces
	// The special folders a fresh user has, by alias
	special map[types.FolderName]types.FolderName
	// Whether the server flags those with SPECIAL-USE, so discovery maps them by
	// attribute, or leaves Kanmail to recognise them by name
	specialUse bool
	caps       []imap.Cap
	noCaps     []imap.Cap
	// Whether the server does substring SEARCH BODY/TEXT without an external
	// index (Cyrus needs a search engine configured, so it matches nothing)
	noBodySearch bool
	// Whether SEARCH HEADER covers the message id headers (Stalwart searches
	// only From/To/Cc/Bcc/Subject, so Message-ID and In-Reply-To match nothing)
	noMessageIDSearch bool
	// A mailbox this rig provisions in a shared namespace outside the personal
	// one, "" where there is none. Courier and Cyrus declare shared roots too,
	// but nothing is set up in them (and a shared root at "" - cyrus-legacy -
	// can't be told apart from a personal name anyway)
	sharedMailbox string
	// How long the server can take to push an IDLE notification after a change
	// (Courier polls its maildir, so it's seconds not instant); 0 = default
	watchLatency time.Duration
	// Max concurrent envs (users) for this server; 0 = defaultConcurrency
	maxConcurrent int
	// Whether the server indexes messages for search asynchronously, so a
	// search right after an append may briefly miss them (Stalwart's FTS)
	searchIndexLag bool
}

func (tg *target) concurrency() int {
	if tg.maxConcurrent > 0 {
		return tg.maxConcurrent
	}
	return defaultConcurrency
}

func (tg *target) user(n int) string {
	format := tg.userFmt
	if format == "" {
		format = "user%d"
	}
	return fmt.Sprintf(format, n)
}

func (tg *target) delim() string {
	return tg.namespaces.Delim()
}

// qualify is where a name Kanmail invents lands on this server: a logical
// column name or unmapped alias gains the personal namespace root.
func (tg *target) qualify(name string) string {
	return tg.namespaces.PersonalRoot() + name
}

// join builds a nested name from its segments in the server's delimiter.
func (tg *target) join(segments ...string) string {
	return strings.Join(segments, tg.delim())
}

// baseline is every mailbox a fresh user has besides the INBOX; the harness
// restores it when it resets a user.
func (tg *target) baseline() []string {
	names := make([]string, 0, len(tg.special))
	for _, name := range tg.special {
		names = append(names, string(name))
	}
	return names
}

func (tg *target) accountSettings(user string) types.AccountSettings {
	var settings types.AccountSettings
	settings.ID = types.AccountID(tg.name + "/" + user)
	settings.Name = types.AccountName(settings.ID)
	settings.IMAPSettings = types.ConnectionSettings{
		Host:     "127.0.0.1",
		Port:     tg.port,
		Username: user,
		Password: password,
		SSL:      true,
	}
	return settings
}

var (
	dovecotSpecial = map[types.FolderName]types.FolderName{
		"sent": "Sent", "drafts": "Drafts", "trash": "Trash", "junk": "Junk",
	}
	dovecotCaps = []imap.Cap{
		imap.CapIMAP4rev1, imap.CapIdle, imap.CapNamespace, imap.CapMove, imap.CapUIDPlus,
		imap.CapSpecialUse, imap.CapCondStore, imap.CapUnselect, imap.CapLiteralPlus,
	}
	cyrusCaps = []imap.Cap{
		imap.CapIMAP4rev1, imap.CapIdle, imap.CapNamespace, imap.CapMove, imap.CapUIDPlus,
		imap.CapSpecialUse, imap.CapCondStore, imap.CapUnselect, imap.CapLiteralPlus, imap.CapChildren,
	}
)

func dovecotTarget(name string, port int, prefix, delim string) *target {
	special := dovecotSpecial
	if prefix != "" {
		special = make(map[types.FolderName]types.FolderName, len(dovecotSpecial))
		for alias, folder := range dovecotSpecial {
			special[alias] = types.FolderName(prefix + string(folder))
		}
	}
	return &target{
		name:       name,
		services:   []string{name},
		port:       port,
		plainPort:  port - 850,
		namespaces: types.Namespaces{Personal: []types.Namespace{{Prefix: prefix, Delim: delim}}},
		special:    special,
		specialUse: true,
		caps:       dovecotCaps,
	}
}

// allTargets is every server the compose file has, in the order they are run.
var allTargets = []*target{
	// Dovecot 2.3, Maildir++: "." delimiter, no prefix
	dovecotTarget("dovecot", 11993, "", "."),
	// Dovecot 2.3, Maildir LAYOUT=fs: "/" delimiter, no prefix (the Gmail /
	// Fastmail / Outlook shape)
	dovecotTarget("dovecot-fs", 12993, "", "/"),
	// Dovecot 2.3, Maildir++ under an "INBOX." personal prefix (the Courier
	// shape), with a public namespace at "shared." - a mailbox no walk of the
	// personal namespace reaches
	func() *target {
		tg := dovecotTarget("dovecot-prefix", 13993, "INBOX.", ".")
		tg.namespaces.Shared = []types.Namespace{{Prefix: "shared.", Delim: "."}}
		tg.sharedMailbox = "shared.Announcements"
		return tg
	}(),
	// Dovecot 2.3, Maildir++ without NAMESPACE advertised: the delimiter is
	// learnt from LIST and the personal prefix taken as empty
	func() *target {
		tg := dovecotTarget("dovecot-nonamespace", 14993, "", ".")
		tg.caps = []imap.Cap{imap.CapIMAP4rev1, imap.CapIdle, imap.CapMove, imap.CapUIDPlus, imap.CapSpecialUse, imap.CapLiteralPlus}
		tg.noCaps = []imap.Cap{imap.CapNamespace}
		return tg
	}(),
	// Courier IMAP 5.0, Maildir++: everything personal under "INBOX.", shared
	// namespaces at "#shared." and "shared.", no MOVE or SPECIAL-USE - the
	// special folders are recognised by name, and SELECT reports no UIDNEXT
	// (RFC 3501 says SHOULD), so Kanmail falls back to a STATUS for it
	{
		name:      "courier",
		services:  []string{"courier"},
		port:      15993,
		plainPort: 15143,
		namespaces: types.Namespaces{
			Personal: []types.Namespace{{Prefix: "INBOX.", Delim: "."}},
			Shared:   []types.Namespace{{Prefix: "#shared.", Delim: "."}, {Prefix: "shared.", Delim: "."}},
		},
		special: map[types.FolderName]types.FolderName{
			"sent": "INBOX.Sent", "drafts": "INBOX.Drafts", "trash": "INBOX.Trash",
		},
		caps:   []imap.Cap{imap.CapIMAP4rev1, imap.CapIdle, imap.CapNamespace, imap.CapUIDPlus, imap.CapChildren},
		noCaps: []imap.Cap{imap.CapMove, imap.CapSpecialUse, imap.CapCondStore, imap.CapUnselect, imap.CapLiteralPlus},
		// Courier rescans the maildir on a timer, so IDLE can lag several seconds
		watchLatency: 70 * time.Second,
	},
	// Cyrus IMAP 3.6 as configured out of the box: personal folders beside the
	// INBOX with "/", other users and shared folders under named roots,
	// SPECIAL-USE on the autocreated special folders
	{
		name:      "cyrus",
		services:  []string{"cyrus"},
		port:      16993,
		plainPort: 16143,
		namespaces: types.Namespaces{
			Personal: []types.Namespace{{Prefix: "", Delim: "/"}},
			Other:    []types.Namespace{{Prefix: "Other Users/", Delim: "/"}},
			Shared:   []types.Namespace{{Prefix: "Shared Folders/", Delim: "/"}},
		},
		special:       dovecotSpecial,
		specialUse:    true,
		caps:          cyrusCaps,
		noBodySearch:  true,
		maxConcurrent: 1,
	},
	// Cyrus IMAP 3.6 with the pre-3.0 namespace: personal under "INBOX." with
	// ".", other users under "user." and shared mailboxes at the root
	{
		name:      "cyrus-legacy",
		services:  []string{"cyrus-legacy"},
		port:      17993,
		plainPort: 17143,
		namespaces: types.Namespaces{
			Personal: []types.Namespace{{Prefix: "INBOX.", Delim: "."}},
			Other:    []types.Namespace{{Prefix: "user.", Delim: "."}},
			Shared:   []types.Namespace{{Prefix: "", Delim: "."}},
		},
		special: map[types.FolderName]types.FolderName{
			"sent": "INBOX.Sent", "drafts": "INBOX.Drafts", "trash": "INBOX.Trash", "junk": "INBOX.Junk",
		},
		specialUse:    true,
		caps:          cyrusCaps,
		noBodySearch:  true,
		maxConcurrent: 1,
	},
	// Stalwart 0.16: "/" delimiter and no prefix, the special folders named as
	// Outlook names them and flagged with SPECIAL-USE
	{
		name:       "stalwart",
		services:   []string{"stalwart"},
		port:       18993,
		plainPort:  18143,
		namespaces: types.Namespaces{Personal: []types.Namespace{{Prefix: "", Delim: "/"}}},
		special: map[types.FolderName]types.FolderName{
			"sent": "Sent Items", "drafts": "Drafts", "trash": "Deleted Items", "junk": "Junk Mail",
		},
		specialUse:        true,
		searchIndexLag:    true,
		noMessageIDSearch: true,
		caps: []imap.Cap{
			imap.CapIMAP4rev1, imap.CapIdle, imap.CapNamespace, imap.CapMove, imap.CapUIDPlus,
			imap.CapSpecialUse, imap.CapCondStore, imap.CapUnselect, imap.CapLiteralPlus,
		},
	},
}

func findTarget(name string) *target {
	for _, tg := range allTargets {
		if tg.name == name {
			return tg
		}
	}
	return nil
}
