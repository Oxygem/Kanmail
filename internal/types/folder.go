package types

import (
	"slices"
	"strings"

	"github.com/emersion/go-imap/v2"
)

type FolderName string

func (f FolderName) IsInbox() bool {
	return strings.EqualFold(string(f), "INBOX")
}

// Canonical spells the INBOX segment of a name the one way the server does:
// "inbox" is INBOX and "inbox.Work" is INBOX.Work however the client typed it.
func (f FolderName) Canonical(delim string) FolderName {
	if f.IsInbox() {
		return "INBOX"
	}
	if delim == "" {
		return f
	}
	if head, rest, found := strings.Cut(string(f), delim); found && FolderName(head).IsInbox() {
		return FolderName("INBOX" + delim + rest)
	}
	return f
}

type FolderSettings struct {
	Inbox     FolderName `json:"inbox"`
	Flagged   FolderName `json:"flagged"`   // starred in gmail
	Important FolderName `json:"important"` // RFC 8457
	Sent      FolderName `json:"sent"`
	Drafts    FolderName `json:"drafts"`
	Archive   FolderName `json:"archive"`
	Trash     FolderName `json:"trash"`
	Junk      FolderName `json:"junk"`
}

// SpecialFolder ties an alias to the mapping it fills, the SPECIAL-USE
// attributes that identify its mailbox and the names servers commonly give it.
type SpecialFolder struct {
	Alias   FolderName
	Field   func(*FolderSettings) *FolderName
	Attrs   []imap.MailboxAttr
	Popular []FolderName
}

// SpecialFolders is the one list of the folders Kanmail knows by alias:
// lookup, labelling and discovery all read from it, so adding a ninth folder
// means editing this list alone.
var SpecialFolders = []SpecialFolder{
	{
		Alias:   "inbox",
		Field:   func(f *FolderSettings) *FolderName { return &f.Inbox },
		Popular: []FolderName{"INBOX", "Posteingang"},
	},
	{
		Alias:   "flagged",
		Field:   func(f *FolderSettings) *FolderName { return &f.Flagged },
		Attrs:   []imap.MailboxAttr{imap.MailboxAttrFlagged},
		Popular: []FolderName{"Starred", "Flagged"},
	},
	{
		Alias:   "important",
		Field:   func(f *FolderSettings) *FolderName { return &f.Important },
		Attrs:   []imap.MailboxAttr{imap.MailboxAttrImportant},
		Popular: []FolderName{"Important"},
	},
	{
		Alias:   "sent",
		Field:   func(f *FolderSettings) *FolderName { return &f.Sent },
		Attrs:   []imap.MailboxAttr{imap.MailboxAttrSent},
		Popular: []FolderName{"Sent Mail", "Sent", "Sent Items", "Sent items"},
	},
	{
		Alias:   "drafts",
		Field:   func(f *FolderSettings) *FolderName { return &f.Drafts },
		Attrs:   []imap.MailboxAttr{imap.MailboxAttrDrafts},
		Popular: []FolderName{"Drafts"},
	},
	{
		Alias:   "archive",
		Field:   func(f *FolderSettings) *FolderName { return &f.Archive },
		Attrs:   []imap.MailboxAttr{imap.MailboxAttrArchive, imap.MailboxAttrAll},
		Popular: []FolderName{"All Mail", "Archive"},
	},
	{
		Alias:   "trash",
		Field:   func(f *FolderSettings) *FolderName { return &f.Trash },
		Attrs:   []imap.MailboxAttr{imap.MailboxAttrTrash},
		Popular: []FolderName{"Trash", "Deleted Items", "Deleted Messages", "Deleted"},
	},
	{
		Alias:   "junk",
		Field:   func(f *FolderSettings) *FolderName { return &f.Junk },
		Attrs:   []imap.MailboxAttr{imap.MailboxAttrJunk},
		Popular: []FolderName{"Junk", "Spam"},
	},
}

// Lookup maps an alias (inbox, sent, ...) to the mailbox the account has for
// it, "" for an alias with nothing mapped and for any name that is not one.
func (f FolderSettings) Lookup(name FolderName) FolderName {
	for _, special := range SpecialFolders {
		if special.Alias == name {
			return *special.Field(&f)
		}
	}
	return ""
}

// AliasFor is the inverse of Lookup: the alias a mailbox is mapped as, if any.
// Mappings are compared canonically because they are free text - the user can
// spell the INBOX segment any way they like, as resolveFolderName allows.
func (f FolderSettings) AliasFor(name FolderName, delim string) (alias FolderName, isMapped bool) {
	if name == "" {
		return "", false
	}
	canonical := name.Canonical(delim)
	for _, special := range SpecialFolders {
		if mapped := *special.Field(&f); mapped != "" && mapped.Canonical(delim) == canonical {
			return special.Alias, true
		}
	}
	return "", false
}

// Namespace is one IMAP namespace (RFC 2342): the prefix its mailboxes sit
// under and the hierarchy delimiter they use, "" on a flat server.
type Namespace struct {
	Prefix string `json:"prefix"`
	Delim  string `json:"delim"`
}

// Root is the prefix with its delimiter attached: servers report it that way
// (RFC 2342), a prefix carried over from legacy settings may not.
func (n Namespace) Root() string {
	if n.Prefix == "" || n.Delim == "" || strings.HasSuffix(n.Prefix, n.Delim) {
		return n.Prefix
	}
	return n.Prefix + n.Delim
}

// contains matches the leading INBOX segment case insensitively, as Courier
// and Dovecot do, and the rest of the root byte for byte.
func (n Namespace) contains(name FolderName) bool {
	return strings.HasPrefix(
		string(name.Canonical(n.Delim)),
		string(FolderName(n.Root()).Canonical(n.Delim)),
	)
}

// Namespaces is what the server reported via NAMESPACE, discovered when the
// account is tested and never re-fetched. The zero value behaves as a
// prefix-less "/" server.
type Namespaces struct {
	Personal []Namespace `json:"personal"`
	Other    []Namespace `json:"other,omitempty"`
	Shared   []Namespace `json:"shared,omitempty"`
}

func NamespacesFromIMAP(data *imap.NamespaceData) Namespaces {
	return Namespaces{
		Personal: namespacesFromDescriptors(data.Personal),
		Other:    namespacesFromDescriptors(data.Other),
		Shared:   namespacesFromDescriptors(data.Shared),
	}
}

// Empty lists stay nil so a JSON round trip through the frontend compares
// equal to what discovery stored.
func namespacesFromDescriptors(descriptors []imap.NamespaceDescriptor) []Namespace {
	if len(descriptors) == 0 {
		return nil
	}
	namespaces := make([]Namespace, len(descriptors))
	for i, descriptor := range descriptors {
		namespaces[i] = Namespace{Prefix: descriptor.Prefix}
		// A flat server reports NIL (no hierarchy at all) rather than a delimiter
		if descriptor.Delim != 0 {
			namespaces[i].Delim = string(descriptor.Delim)
		}
	}
	return namespaces
}

// Delim is the personal hierarchy delimiter, "/" when the server reported
// none or the account has never been tested.
func (n Namespaces) Delim() string {
	if len(n.Personal) > 0 && n.Personal[0].Delim != "" {
		return n.Personal[0].Delim
	}
	return "/"
}

// PersonalRoot is what goes in front of a name Kanmail invents, "" when the
// personal namespace has no prefix.
func (n Namespaces) PersonalRoot() string {
	if len(n.Personal) == 0 {
		return ""
	}
	return n.Personal[0].Root()
}

// Contains reports whether name sits inside any namespace the server reported,
// ie is a name the server could have given us rather than one Kanmail must
// qualify. An empty personal prefix contains everything; an empty other or
// shared prefix (a Cyrus style shared root) is ignored, as taking it at its
// word would contain every name and so leave nothing to qualify.
func (n Namespaces) Contains(name FolderName) bool {
	if slices.ContainsFunc(n.Personal, func(ns Namespace) bool { return ns.contains(name) }) {
		return true
	}
	return slices.ContainsFunc(slices.Concat(n.Other, n.Shared), func(ns Namespace) bool {
		return ns.Prefix != "" && ns.contains(name)
	})
}
