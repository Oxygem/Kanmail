package types

import "testing"

// Two aliases can point at one mailbox, and the alias it is labelled with must
// not change between calls - an email whose label moves hops columns on every
// refresh
func TestAliasForIsStable(t *testing.T) {
	folders := FolderSettings{Trash: "Deleted Items", Junk: "Deleted Items"}
	for range 200 {
		if alias, isMapped := folders.AliasFor("Deleted Items", "/"); !isMapped || alias != "trash" {
			t.Fatalf("expected trash every time, got %q (%v)", alias, isMapped)
		}
	}
}

// The mapping fields are free text, so the INBOX segment is folded before
// comparing - as resolving one folds it before asking the server
func TestAliasForFoldsInboxSegment(t *testing.T) {
	folders := FolderSettings{Sent: "inbox.Sent"}
	if alias, isMapped := folders.AliasFor("INBOX.Sent", "."); !isMapped || alias != "sent" {
		t.Fatalf("expected sent, got %q (%v)", alias, isMapped)
	}
	if _, isMapped := folders.AliasFor("INBOX.Other", "."); isMapped {
		t.Fatal("only the mapped mailbox has an alias")
	}
	if _, isMapped := (FolderSettings{}).AliasFor("", "."); isMapped {
		t.Fatal("nothing mapped is not a match for the empty name")
	}
}

// A prefix carried over from legacy settings may lack the delimiter a server
// reports with it, and joining without one gives "INBOXWork"
func TestNamespaceRootCarriesItsDelimiter(t *testing.T) {
	for _, tc := range []struct{ prefix, delim, want string }{
		{"INBOX.", ".", "INBOX."},
		{"INBOX", ".", "INBOX."},
		{"", ".", ""},
		{"INBOX", "", "INBOX"},
	} {
		if got := (Namespace{Prefix: tc.prefix, Delim: tc.delim}).Root(); got != tc.want {
			t.Fatalf("root of %q/%q: expected %q, got %q", tc.prefix, tc.delim, tc.want, got)
		}
	}
}

// Cyrus with altnamespace off reports shared mailboxes at the root. Taking that
// at its word means every name is already inside a namespace, so nothing the
// user types is ever qualified into the personal one - the failure the personal
// root exists to fix
func TestContainsIgnoresRootedSharedNamespaces(t *testing.T) {
	ns := Namespaces{
		Personal: []Namespace{{Prefix: "INBOX.", Delim: "."}},
		Other:    []Namespace{{Prefix: "user.", Delim: "."}},
		Shared:   []Namespace{{Prefix: "", Delim: "."}},
	}
	for name, want := range map[FolderName]bool{
		"INBOX.Work":    true,
		"inbox.Work":    true,
		"user.bob.Mail": true,
		"Work":          false,
	} {
		if got := ns.Contains(name); got != want {
			t.Fatalf("contains %q: expected %v, got %v", name, want, got)
		}
	}
	// An empty personal prefix still contains everything
	if !(Namespaces{Personal: []Namespace{{Delim: "/"}}}).Contains("Work") {
		t.Fatal("an empty personal prefix contains everything")
	}
}
