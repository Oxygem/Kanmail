package imapinterface

import (
	"errors"
	"fmt"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/emersion/go-imap/v2"
)

func listNames(t *testing.T, client *FakeIMAPClient, reference, pattern string) []string {
	t.Helper()
	data, err := client.List(reference, pattern, &imap.ListOptions{}).Collect()
	if err != nil {
		t.Fatalf("list %q %q failed: %v", reference, pattern, err)
	}
	names := make([]string, 0, len(data))
	for _, d := range data {
		names = append(names, d.Mailbox)
	}
	return names
}

var courierNamespaces = imap.NamespaceData{
	Personal: []imap.NamespaceDescriptor{{Prefix: "INBOX.", Delim: '.'}},
	Shared:   []imap.NamespaceDescriptor{{Prefix: "shared.", Delim: '.'}},
}

// newCourierClient shapes the account's fake server like Courier: an "INBOX."
// personal namespace (and a "shared." one) holding the given folders and
// nothing else.
func newCourierClient(t *testing.T, folders ...string) *FakeIMAPClient {
	t.Helper()
	for _, name := range standardFakeFolders {
		DeleteFakeFolder(t.Name(), name)
	}
	SetFakeNamespaces(t.Name(), courierNamespaces)
	for _, name := range folders {
		CreateFakeFolder(t.Name(), name)
	}
	return NewFakeIMAPClient(t.Name())
}

func expectNamespaceRejection(t *testing.T, err error, desc string) {
	t.Helper()
	var imapErr *imap.Error
	if !errors.As(err, &imapErr) || imapErr.Code != "" || !strings.Contains(imapErr.Text, "nonexistent namespace") {
		t.Fatalf("%s: expected a bare namespace rejection, got %v", desc, err)
	}
}

// RFC 3501 6.3.8: a trailing "%" also returns the hierarchy levels it matches,
// flagged \Noselect where no mailbox exists - else a client walking the tree
// one level at a time never reaches the grandchild
func TestFakeListSynthesisesNoselectLevels(t *testing.T) {
	client := newCourierClient(t, "INBOX", "INBOX.Work.Admin")

	data, err := client.List("INBOX.", "%", &imap.ListOptions{}).Collect()
	if err != nil {
		t.Fatal(err)
	}
	if len(data) != 1 || data[0].Mailbox != "INBOX.Work" {
		t.Fatalf("expected just INBOX.Work, got %v", listNames(t, client, "INBOX.", "%"))
	}
	if !slices.Contains(data[0].Attrs, imap.MailboxAttrNoSelect) {
		t.Fatalf("INBOX.Work should be \\Noselect, got %v", data[0].Attrs)
	}
	if got := listNames(t, client, "INBOX.Work.", "%"); !slices.Equal(got, []string{"INBOX.Work.Admin"}) {
		t.Fatalf("expected INBOX.Work.Admin, got %v", got)
	}
}

// A name outside every namespace doesn't exist as far as the server is
// concerned, so it's no more listed than it can be selected - where a shared
// mailbox is both
func TestFakeListHidesMailboxesOutsideNamespace(t *testing.T) {
	SetFakeNamespaces(t.Name(), courierNamespaces)
	CreateFakeFolder(t.Name(), "INBOX.Sent")
	CreateFakeFolder(t.Name(), "shared.announcements")
	client := NewFakeIMAPClient(t.Name())

	if got := listNames(t, client, "", "*"); !slices.Equal(got, []string{"INBOX.Sent", "inbox", "shared.announcements"}) {
		t.Fatalf("expected only the namespaces and the INBOX, got %v", got)
	}
	_, err := client.Select("sent", nil).Wait()
	expectNamespaceRejection(t, err, "select")
	if _, err := client.Select("shared.announcements", nil).Wait(); err != nil {
		t.Fatalf("shared mailbox should select: %v", err)
	}
}

// The INBOX is one mailbox however the store spells it, so walking the top
// level never shows a phantom "INBOX" level beside a stored "inbox"
func TestFakeListSingleInboxEntry(t *testing.T) {
	SetFakeNamespaces(t.Name(), courierNamespaces)
	CreateFakeFolder(t.Name(), "INBOX.Sent")
	client := NewFakeIMAPClient(t.Name())

	if got := listNames(t, client, "", "%"); !slices.Equal(got, []string{"inbox"}) {
		t.Fatalf("expected exactly one INBOX entry, got %v", got)
	}
}

// LIST "" "" returns the hierarchy delimiter alone (RFC 3501 6.3.8), and a
// server told not to advertise NAMESPACE still answers it
func TestFakeListRootDelimiter(t *testing.T) {
	SetFakeNamespaces(t.Name(), imap.NamespaceData{
		Personal: []imap.NamespaceDescriptor{{Prefix: "", Delim: '.'}},
	})
	SetFakeNamespaceSupported(t.Name(), false)
	client := NewFakeIMAPClient(t.Name())

	if client.Caps().Has(imap.CapNamespace) {
		t.Fatal("NAMESPACE should not be advertised")
	}
	data, err := client.List("", "", &imap.ListOptions{}).Collect()
	if err != nil {
		t.Fatal(err)
	}
	if len(data) != 1 || data[0].Mailbox != "" || data[0].Delim != '.' ||
		!slices.Contains(data[0].Attrs, imap.MailboxAttrNoSelect) {
		t.Fatalf("expected a single \\Noselect root entry with '.', got %+v", data)
	}
	// An empty personal prefix with a delimiter accepts and lists everything
	CreateFakeFolder(t.Name(), "Work.Admin")
	if got := listNames(t, client, "Work.", "%"); !slices.Equal(got, []string{"Work.Admin"}) {
		t.Fatalf("expected Work.Admin, got %v", got)
	}
}

// Every command answers an outside-namespace name the way Courier does, a
// MOVE or COPY included - not with a TRYCREATE inviting the client to create it
func TestFakeMoveOutsideNamespaceRejected(t *testing.T) {
	client := newCourierClient(t, "INBOX")
	uid := appendMessage(t, client, "INBOX")
	if _, err := client.Select("INBOX", nil).Wait(); err != nil {
		t.Fatal(err)
	}

	_, err := client.Move(imap.UIDSetNum(uid), "Archive").Wait()
	expectNamespaceRejection(t, err, "move")
	_, err = client.Copy(imap.UIDSetNum(uid), "Archive").Wait()
	expectNamespaceRejection(t, err, "copy")
}

// The helpers address the INBOX as loosely as the client may - by any spelling -
// and never leave two spellings of it behind, a client sitting in the old
// spelling following it to the new one
func TestFakeFolderHelpersResolveInboxSpelling(t *testing.T) {
	client := NewFakeIMAPClient(t.Name())

	DeleteFakeFolder(t.Name(), "INBOX")
	if _, err := client.Select("inbox", nil).Wait(); err == nil {
		t.Fatal("expected the inbox to be gone")
	}

	CreateFakeFolder(t.Name(), "inbox")
	if _, err := client.Select("inbox", nil).Wait(); err != nil {
		t.Fatal(err)
	}
	CreateFakeFolder(t.Name(), "INBOX")
	if got := client.getCurrentFolder(); got != "INBOX" {
		t.Fatalf("selected client should follow the respelling, got %q", got)
	}
	if _, err := client.Fetch(imap.UIDSetNum(1), &imap.FetchOptions{}).Collect(); err != nil {
		t.Fatalf("fetch in the respelt folder: %v", err)
	}
	names := listNames(t, client, "", "*")
	var inboxes []string
	for _, name := range names {
		if strings.EqualFold(name, "INBOX") {
			inboxes = append(inboxes, name)
		}
	}
	if !slices.Equal(inboxes, []string{"INBOX"}) {
		t.Fatalf("expected a single INBOX, got %v", names)
	}
	if _, err := client.Select("Inbox", nil).Wait(); err != nil {
		t.Fatalf("select by any spelling: %v", err)
	}
}

// LIST walks the folder map while another connection creates or deletes a
// folder - five pooled connections per account make that routine. Reading the
// map twice over, the outer read still held, deadlocks the moment a writer
// queues between the two.
func TestFakeListConcurrentWithFolderWrites(t *testing.T) {
	client := newCourierClient(t, "INBOX", "INBOX.Work.Admin")

	listing, writing := make(chan struct{}), make(chan struct{})
	stop := make(chan struct{})
	go func() {
		defer close(listing)
		for {
			select {
			case <-stop:
				return
			default:
			}
			client.List("INBOX.", "%", &imap.ListOptions{}).Collect()
		}
	}()
	go func() {
		defer close(writing)
		for i := range 200 {
			name := fmt.Sprintf("INBOX.Folder%d", i)
			CreateFakeFolder(t.Name(), name)
			DeleteFakeFolder(t.Name(), name)
		}
	}()

	select {
	case <-writing:
		close(stop)
		<-listing
	case <-time.After(30 * time.Second):
		t.Fatal("LIST deadlocked against concurrent folder writes")
	}
}

// The INBOX segment of a child name folds like the mailbox itself does: a
// client spelling it "inbox.Work" means the one mailbox, as it does on the
// servers this emulates - not a second one it may then go and create
func TestFakeInboxChildSpellingIsOneMailbox(t *testing.T) {
	for _, name := range standardFakeFolders {
		DeleteFakeFolder(t.Name(), name)
	}
	SetFakeNamespaces(t.Name(), imap.NamespaceData{
		Personal: []imap.NamespaceDescriptor{{Prefix: "", Delim: '.'}},
	})
	CreateFakeFolder(t.Name(), "INBOX")
	CreateFakeFolder(t.Name(), "INBOX.Work")
	client := NewFakeIMAPClient(t.Name())

	if _, err := client.Select("inbox.Work", nil).Wait(); err != nil {
		t.Fatalf("select by any spelling: %v", err)
	}
	err := client.Create("inbox.Work", nil).Wait()
	var imapErr *imap.Error
	if !errors.As(err, &imapErr) || imapErr.Code != imap.ResponseCodeAlreadyExists {
		t.Fatalf("expected the mailbox to already exist, got %v", err)
	}
}
