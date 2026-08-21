package imapinterface

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"math/rand"
	"net/mail"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/emersion/go-imap/v2"
	"github.com/emersion/go-imap/v2/imapclient"
	"github.com/emersion/go-imap/v2/imapserver"
	"github.com/emersion/go-sasl"
	"github.com/rs/zerolog"

	"github.com/oxygem/kanmail/internal/constants"
	"github.com/oxygem/kanmail/internal/types"
)

// Our fake imap client implements IMAPClient
var _ IMAPClient = (*FakeIMAPClient)(nil)

// FakeIMAPClient implements the IMAPClient interface with fake data
// for testing and development purposes
type FakeIMAPClient struct {
	log zerolog.Logger

	store   *fakeIMAPStore
	caps    imap.CapSet
	handler *imapclient.UnilateralDataHandler

	// The real imapclient.Client is safe for concurrent use (eg a watcher
	// closing a connection mid-IDLE), so guard our mutable state to match
	mu            sync.Mutex
	state         imap.ConnState
	currentFolder string
}

func (c *FakeIMAPClient) getCurrentFolder() string {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.currentFolder
}

// Simple fake command that just returns success
type FakeCommand struct {
	err error
}

func (c *FakeCommand) Wait() error {
	if constants.ENV_DEBUG_FAKE_JITTER != "" {
		// Sleep anywhere between 0-1s
		time.Sleep(time.Millisecond * time.Duration(rand.Intn(1000)))
	}
	return c.err
}

func (c *FakeCommand) Close() error {
	return nil
}

// FakeSearchCommand implements SearchCommand interface
var _ SearchCommand = (*FakeSearchCommand)(nil)

type FakeSearchCommand struct {
	*FakeCommand
	data *imap.SearchData
}

func (c *FakeSearchCommand) Wait() (*imap.SearchData, error) {
	if err := c.FakeCommand.Wait(); err != nil {
		return nil, err
	}
	return c.data, nil
}

// FakeFetchCommand implements FetchCommand interface
var _ FetchCommand = (*FakeFetchCommand)(nil)

type FakeFetchCommand struct {
	*FakeCommand
	messages []*imapclient.FetchMessageBuffer
}

func (c *FakeFetchCommand) Collect() ([]*imapclient.FetchMessageBuffer, error) {
	if err := c.Wait(); err != nil {
		return nil, c.err
	}
	return c.messages, nil
}

// FakeExpungeCommand implements ExpungeCommand interface
var _ ExpungeCommand = (*FakeExpungeCommand)(nil)

type FakeExpungeCommand struct {
	*FakeCommand
	uids []imap.UID
}

func (c *FakeExpungeCommand) Collect() ([]uint32, error) {
	if err := c.Wait(); err != nil {
		return nil, err
	}
	uids := make([]uint32, len(c.uids))
	for i, id := range c.uids {
		uids[i] = uint32(id)
	}
	return uids, nil
}

// FakeSelectCommand implements SelectCommand interface
var _ SelectCommand = (*FakeSelectCommand)(nil)

type FakeSelectCommand struct {
	*FakeCommand
	data *imap.SelectData
}

func (c *FakeSelectCommand) Wait() (*imap.SelectData, error) {
	if err := c.FakeCommand.Wait(); err != nil {
		return nil, err
	}
	return c.data, nil
}

// FakeListCommand implements ListCommand interface
var _ ListCommand = (*FakeListCommand)(nil)

type FakeListCommand struct {
	*FakeCommand
	data []*imap.ListData
}

func (c *FakeListCommand) Collect() ([]*imap.ListData, error) {
	if err := c.Wait(); err != nil {
		return nil, err
	}
	return c.data, nil
}

// FakeNamespaceCommand implements NamespaceCommand interface
var _ NamespaceCommand = (*FakeNamespaceCommand)(nil)

type FakeNamespaceCommand struct {
	*FakeCommand
	data *imap.NamespaceData
}

func (c *FakeNamespaceCommand) Wait() (*imap.NamespaceData, error) {
	if err := c.FakeCommand.Wait(); err != nil {
		return nil, err
	}
	return c.data, nil
}

// FakeMoveCommand implements MoveCommand interface
var _ MoveCommand = (*FakeMoveCommand)(nil)

type FakeMoveCommand struct {
	*FakeCommand
	data *imapclient.MoveData
}

func (c *FakeMoveCommand) Wait() (*imapclient.MoveData, error) {
	if err := c.FakeCommand.Wait(); err != nil {
		return nil, err
	}
	return c.data, nil
}

// FakeCopyCommand implements CopyCommand interface
var _ CopyCommand = (*FakeCopyCommand)(nil)

type FakeCopyCommand struct {
	*FakeCommand
	data *imap.CopyData
}

func (c *FakeCopyCommand) Wait() (*imap.CopyData, error) {
	if err := c.FakeCommand.Wait(); err != nil {
		return nil, err
	}
	return c.data, nil
}

// FakeAppendCommand implements AppendCommand interface
var _ AppendCommand = (*FakeAppendCommand)(nil)

type FakeAppendCommand struct {
	*FakeCommand
	store  *fakeIMAPStore
	folder string
	buf    bytes.Buffer
	data   *imap.AppendData
}

func (c *FakeAppendCommand) Wait() (*imap.AppendData, error) {
	if err := c.FakeCommand.Wait(); err != nil {
		return nil, err
	}
	if c.data != nil {
		return c.data, nil
	}

	folder, exists := c.store.getFolder(c.folder)
	if !exists {
		return nil, missingMailboxErr(c.folder)
	}

	msg := parseAppendedMessage(c.buf.Bytes())

	folder.mu.Lock()
	msg.uid = folder.uidNext
	folder.uidNext++
	folder.messages.Set(msg.uid, msg)
	folder.exists++
	folder.mu.Unlock()
	folder.notify()

	c.data = &imap.AppendData{UID: msg.uid, UIDValidity: folder.uidValidity}
	return c.data, nil
}

func (c *FakeAppendCommand) Close() error {
	return nil
}

func (c *FakeAppendCommand) Write(b []byte) (int, error) {
	return c.buf.Write(b)
}

// parseAppendedMessage builds a fakeMessage from a raw RFC822 message, falling
// back to a minimal message if parsing fails - fake mode should stay forgiving.
func parseAppendedMessage(raw []byte) *fakeMessage {
	now := time.Now()
	msg := &fakeMessage{
		flags:    []imap.Flag{imap.FlagSeen},
		size:     uint32(len(raw)),
		date:     now,
		envelope: &imap.Envelope{Date: now},
	}

	parsed, err := mail.ReadMessage(bytes.NewReader(raw))
	if err != nil {
		return msg
	}

	header := parsed.Header
	msg.envelope.Subject = header.Get("Subject")
	// Envelope msgids are bare - a real client's parse strips the brackets
	msg.envelope.MessageID = strings.Trim(header.Get("Message-Id"), "<>")
	if inReplyTo := strings.Trim(header.Get("In-Reply-To"), "<>"); inReplyTo != "" {
		msg.envelope.InReplyTo = []string{inReplyTo}
	}
	for _, ref := range strings.Fields(header.Get("References")) {
		if ref = strings.Trim(ref, "<>"); ref != "" {
			msg.references = append(msg.references, ref)
		}
	}
	if date, err := header.Date(); err == nil {
		msg.date = date
		msg.envelope.Date = date
	}
	msg.envelope.From = parseAddressList(header, "From")
	msg.envelope.To = parseAddressList(header, "To")
	msg.envelope.Cc = parseAddressList(header, "Cc")
	msg.envelope.Bcc = parseAddressList(header, "Bcc")

	if body, err := io.ReadAll(parsed.Body); err == nil {
		msg.content = string(body)
	}
	return msg
}

func parseAddressList(header mail.Header, key string) []imap.Address {
	addrs, err := header.AddressList(key)
	if err != nil {
		return nil
	}
	result := make([]imap.Address, 0, len(addrs))
	for _, addr := range addrs {
		mailbox, host, _ := strings.Cut(addr.Address, "@")
		result = append(result, imap.Address{Name: addr.Name, Mailbox: mailbox, Host: host})
	}
	return result
}

// NewFakeIMAPClient creates a new fake IMAP client backed by the given account's
// store, so each account sees its own distinct set of sample emails.
func NewFakeIMAPClient(accountKey string) *FakeIMAPClient {
	return NewFakeIMAPClientWithHandler(accountKey, nil)
}

// NewFakeIMAPClientWithHandler additionally receives unilateral mailbox updates
// when the selected folder changes, mirroring a real connection's dial options.
func NewFakeIMAPClientWithHandler(accountKey string, handler *imapclient.UnilateralDataHandler) *FakeIMAPClient {
	log := zerolog.Ctx(context.TODO()).With().
		Str("component", "FakeIMAPClient").
		Str("account", accountKey).
		Logger()

	client := &FakeIMAPClient{
		store: getOrCreateFakeStore(accountKey),
		state: imap.ConnStateAuthenticated,
		caps: imap.CapSet{
			imap.CapIMAP4rev1: {},
			imap.CapNamespace: {},
			imap.CapMove:      {},
			imap.CapUIDPlus:   {},
			imap.CapIdle:      {},
		},
		log:     log,
		handler: handler,
	}
	if client.store.namespaceUnsupported.Load() {
		delete(client.caps, imap.CapNamespace)
	}

	return client
}

// IMAPClient interface implementation

func (c *FakeIMAPClient) Close() error {
	c.unsubscribeCurrentFolder()
	c.mu.Lock()
	c.currentFolder = ""
	c.state = imap.ConnStateLogout
	c.mu.Unlock()
	return nil
}

func (c *FakeIMAPClient) unsubscribeCurrentFolder() {
	current := c.getCurrentFolder()
	if current == "" {
		return
	}
	if folder, exists := c.store.folders.Get(current); exists {
		folder.unsubscribe(c)
	}
}

func (c *FakeIMAPClient) State() imap.ConnState {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.state
}

func (c *FakeIMAPClient) Noop() Command {
	return &FakeCommand{err: nil}
}

func (c *FakeIMAPClient) Login(username, password string) Command {
	c.mu.Lock()
	c.state = imap.ConnStateAuthenticated
	c.mu.Unlock()
	return &FakeCommand{err: nil}
}

func (c *FakeIMAPClient) Authenticate(sasl sasl.Client) error {
	c.mu.Lock()
	c.state = imap.ConnStateAuthenticated
	c.mu.Unlock()
	return nil
}

func (c *FakeIMAPClient) Caps() imap.CapSet {
	return c.caps
}

func (c *FakeIMAPClient) Namespace() NamespaceCommand {
	data := c.store.namespaces.Load()
	if data == nil {
		data = &imap.NamespaceData{Personal: []imap.NamespaceDescriptor{{}}}
	}
	return &FakeNamespaceCommand{
		FakeCommand: &FakeCommand{err: nil},
		data:        data,
	}
}

// missingMailboxErr matches a real server rejecting a write to a mailbox that
// isn't there, which clients are expected to handle by creating it.
func missingMailboxErr(name string) *imap.Error {
	return &imap.Error{
		Type: imap.StatusResponseTypeNo,
		Code: imap.ResponseCodeTryCreate,
		Text: fmt.Sprintf("folder %s does not exist", name),
	}
}

func (c *FakeIMAPClient) Select(name string, options *imap.SelectOptions) SelectCommand {
	if err := c.outsideNamespaceErr(name); err != nil {
		return &FakeSelectCommand{FakeCommand: &FakeCommand{err: err}}
	}

	folder, exists := c.store.getFolder(name)
	if !exists {
		// Match the real client: a failed SELECT surfaces as a NO status response,
		// carrying a response code only when the server bothers to send one
		selectErr := &imap.Error{
			Type: imap.StatusResponseTypeNo,
			Code: imap.ResponseCodeNonExistent,
			Text: fmt.Sprintf("folder %s does not exist", name),
		}
		if c.store.bareStatusResponses.Load() {
			selectErr.Code = ""
		}
		return &FakeSelectCommand{FakeCommand: &FakeCommand{err: selectErr}}
	}

	c.unsubscribeCurrentFolder()
	c.mu.Lock()
	// Track however the store spells it, not however the client asked for it
	c.currentFolder = folder.name
	c.mu.Unlock()
	folder.subscribe(c)
	folder.mu.Lock()
	data := &imap.SelectData{
		UIDValidity: folder.uidValidity,
		UIDNext:     folder.uidNext,
		NumMessages: folder.exists,
		Flags:       []imap.Flag{imap.FlagSeen, imap.FlagAnswered, imap.FlagDeleted, imap.FlagDraft},
	}
	folder.mu.Unlock()

	cmd := &FakeSelectCommand{
		FakeCommand: &FakeCommand{err: nil},
		data:        data,
	}

	return cmd
}

func (c *FakeIMAPClient) Unselect() Command {
	c.unsubscribeCurrentFolder()
	c.mu.Lock()
	c.currentFolder = ""
	c.mu.Unlock()
	cmd := &FakeCommand{err: nil}
	return cmd
}

// FakeIdleCommand mimics the real IdleCommand lifecycle: Wait blocks until
// Close. Fake change delivery happens via the folder subscription, which is
// active whenever a folder is selected.
type FakeIdleCommand struct {
	once sync.Once
	done chan struct{}
}

func (c *FakeIdleCommand) Close() error {
	c.once.Do(func() { close(c.done) })
	return nil
}

func (c *FakeIdleCommand) Wait() error {
	<-c.done
	return nil
}

func (c *FakeIMAPClient) Idle() (IdleCommand, error) {
	if c.getCurrentFolder() == "" {
		return nil, fmt.Errorf("no folder selected")
	}
	return &FakeIdleCommand{done: make(chan struct{})}, nil
}

// outsideNamespaceErr rejects a mailbox name that isn't the INBOX and doesn't
// sit inside any namespace, matching Courier's refusal - a bare NO rather than
// a TRYCREATE inviting the client to create it.
func (c *FakeIMAPClient) outsideNamespaceErr(name string) error {
	ns := c.store.namespaces.Load()
	if namespacesContain(ns, name) {
		return nil
	}
	return &imap.Error{
		Type: imap.StatusResponseTypeNo,
		Text: fmt.Sprintf(
			"Client tried to access nonexistent namespace. (Mailbox name should probably be prefixed with: %s)",
			types.NamespacesFromIMAP(ns).PersonalRoot(),
		),
	}
}

func (c *FakeIMAPClient) List(reference, pattern string, options *imap.ListOptions) ListCommand {
	ns := c.store.namespaces.Load()
	delim := c.store.delim()

	// LIST "" "" asks for the hierarchy delimiter alone (RFC 3501 6.3.8)
	if reference == "" && pattern == "" {
		return &FakeListCommand{
			FakeCommand: &FakeCommand{err: nil},
			data:        []*imap.ListData{{Attrs: []imap.MailboxAttr{imap.MailboxAttrNoSelect}, Delim: delim}},
		}
	}

	// Candidates are every mailbox in the namespaces plus, when the pattern ends
	// in "%" (RFC 3501 6.3.8), the hierarchy levels above them - reported as
	// \Noselect where no mailbox exists at that level
	selectable := map[string]bool{}
	// Over a copy: getFolder below reads the same map, and exsync.Map holds its
	// read lock for the whole of an Iter, so nesting the two deadlocks
	for name := range c.store.folders.CopyData() {
		if !namespacesContain(ns, name) {
			continue
		}
		selectable[name] = true
		if delim == 0 || !strings.HasSuffix(pattern, "%") {
			continue
		}
		for i, r := range name {
			if r != delim || i == 0 {
				continue
			}
			// A level that is the INBOX under another spelling is that mailbox,
			// not a phantom beside it
			parent := name[:i]
			if folder, exists := c.store.getFolder(parent); exists {
				parent = folder.name
			}
			if _, seen := selectable[parent]; !seen {
				selectable[parent] = false
			}
		}
	}

	var data []*imap.ListData
	for name, isSelectable := range selectable {
		if !imapserver.MatchList(name, delim, reference, pattern) &&
			// The INBOX matches case insensitively (RFC 9051)
			!(strings.EqualFold(reference+pattern, "INBOX") && strings.EqualFold(name, "INBOX")) {
			continue
		}
		attrs := []imap.MailboxAttr{}
		if !isSelectable {
			attrs = append(attrs, imap.MailboxAttrNoSelect)
		}
		data = append(data, &imap.ListData{Attrs: attrs, Mailbox: name, Delim: delim})
	}
	slices.SortFunc(data, func(a, b *imap.ListData) int {
		return strings.Compare(a.Mailbox, b.Mailbox)
	})

	return &FakeListCommand{
		FakeCommand: &FakeCommand{err: nil},
		data:        data,
	}
}

func (c *FakeIMAPClient) Create(name string, options *imap.CreateOptions) Command {
	if err := c.outsideNamespaceErr(name); err != nil {
		return &FakeCommand{err: err}
	}

	if _, exists := c.store.getFolder(name); exists {
		return &FakeCommand{err: &imap.Error{
			Type: imap.StatusResponseTypeNo,
			Code: imap.ResponseCodeAlreadyExists,
			Text: fmt.Sprintf("folder %s already exists", name),
		}}
	}

	// As per a real server: a created mailbox starts empty
	c.store.createEmptyFolderData(name)

	return &FakeCommand{err: nil}
}

func (c *FakeIMAPClient) UIDSearch(criteria *imap.SearchCriteria, options *imap.SearchOptions) SearchCommand {
	if c.getCurrentFolder() == "" {
		cmd := &FakeSearchCommand{
			FakeCommand: &FakeCommand{err: fmt.Errorf("no folder selected")},
		}
		return cmd
	}

	folder, exists := c.store.folders.Get(c.getCurrentFolder())
	if !exists {
		panic("folder does not exist but is current")
	}
	var matchingUIDs []imap.UID

	folder.mu.Lock()
	for uid, msg := range folder.messages.CopyData() {
		if matchesCriteria(uid, msg, criteria) {
			matchingUIDs = append(matchingUIDs, uid)
		}
	}
	folder.mu.Unlock()
	slices.Sort(matchingUIDs)

	data := &imap.SearchData{
		All: imap.UIDSetNum(matchingUIDs...),
	}

	cmd := &FakeSearchCommand{
		FakeCommand: &FakeCommand{err: nil},
		data:        data,
	}
	return cmd
}

// matchesCriteria evaluates the search criteria the app actually uses against a
// message; all set fields must match (zero values are skipped).
func matchesCriteria(uid imap.UID, msg *fakeMessage, criteria *imap.SearchCriteria) bool {
	if criteria == nil {
		return true
	}

	for _, uidSet := range criteria.UID {
		// Contains handles dynamic ranges (eg 123:*), unlike Nums
		if !uidSet.Contains(uid) {
			return false
		}
	}

	if !criteria.Since.IsZero() && msg.date.Before(criteria.Since) {
		return false
	}
	if !criteria.Before.IsZero() && !msg.date.Before(criteria.Before) {
		return false
	}
	if !criteria.SentSince.IsZero() && msg.envelope.Date.Before(criteria.SentSince) {
		return false
	}
	if !criteria.SentBefore.IsZero() && !msg.envelope.Date.Before(criteria.SentBefore) {
		return false
	}

	for _, header := range criteria.Header {
		if !matchesHeader(msg, header) {
			return false
		}
	}
	for _, body := range criteria.Body {
		if !containsFold(msg.content, body) {
			return false
		}
	}
	for _, text := range criteria.Text {
		if !matchesText(msg, text) {
			return false
		}
	}

	for _, flag := range criteria.Flag {
		if !containsFlag(msg.flags, flag) {
			return false
		}
	}
	for _, flag := range criteria.NotFlag {
		if containsFlag(msg.flags, flag) {
			return false
		}
	}

	if criteria.Larger > 0 && int64(msg.size) <= criteria.Larger {
		return false
	}
	if criteria.Smaller > 0 && int64(msg.size) >= criteria.Smaller {
		return false
	}

	for _, not := range criteria.Not {
		if matchesCriteria(uid, msg, &not) {
			return false
		}
	}
	for _, or := range criteria.Or {
		if !matchesCriteria(uid, msg, &or[0]) && !matchesCriteria(uid, msg, &or[1]) {
			return false
		}
	}

	return true
}

func matchesHeader(msg *fakeMessage, field imap.SearchCriteriaHeaderField) bool {
	switch strings.ToLower(field.Key) {
	// Real servers substring-match the raw bracketed msgid headers, where the
	// envelope holds bare msgids - so match the msgid fields bracket-blind
	case "message-id":
		return containsFold(msg.envelope.MessageID, strings.Trim(field.Value, "<>"))
	case "in-reply-to":
		value := strings.Trim(field.Value, "<>")
		return slices.ContainsFunc(msg.envelope.InReplyTo, func(id string) bool {
			return containsFold(id, value)
		})
	case "references":
		value := strings.Trim(field.Value, "<>")
		return slices.ContainsFunc(msg.references, func(id string) bool {
			return containsFold(id, value)
		})
	case "subject":
		return containsFold(msg.envelope.Subject, field.Value)
	case "from":
		return matchesAddresses(msg.envelope.From, field.Value)
	case "to":
		return matchesAddresses(msg.envelope.To, field.Value)
	case "cc":
		return matchesAddresses(msg.envelope.Cc, field.Value)
	case "bcc":
		return matchesAddresses(msg.envelope.Bcc, field.Value)
	default:
		return false
	}
}

func matchesAddresses(addrs []imap.Address, text string) bool {
	return slices.ContainsFunc(addrs, func(addr imap.Address) bool {
		return containsFold(addr.Name, text) || containsFold(addr.Addr(), text)
	})
}

func matchesText(msg *fakeMessage, text string) bool {
	if containsFold(msg.content, text) || containsFold(msg.envelope.Subject, text) {
		return true
	}
	return matchesAddresses(msg.envelope.From, text) || matchesAddresses(msg.envelope.To, text)
}

func containsFold(s, substr string) bool {
	return strings.Contains(strings.ToLower(s), strings.ToLower(substr))
}

// fakeMessageHeaderBytes synthesizes the header body section for a message -
// just the headers the app parses out of it, which the plain text content the
// other sections serve doesn't contain.
func fakeMessageHeaderBytes(msg *fakeMessage) []byte {
	var b strings.Builder
	b.WriteString("Subject: " + msg.envelope.Subject + "\r\n")
	b.WriteString("Message-Id: <" + msg.envelope.MessageID + ">\r\n")
	if len(msg.references) > 0 {
		b.WriteString("References: <" + strings.Join(msg.references, "> <") + ">\r\n")
	}
	if msg.unsubscribe {
		b.WriteString("List-Unsubscribe: <https://lists.example.com/unsubscribe>\r\n")
		b.WriteString("List-Unsubscribe-Post: List-Unsubscribe=One-Click\r\n")
	}
	b.WriteString("\r\n")
	return []byte(b.String())
}

func (c *FakeIMAPClient) Fetch(numSet imap.NumSet, options *imap.FetchOptions) FetchCommand {
	if c.getCurrentFolder() == "" {
		cmd := &FakeFetchCommand{
			FakeCommand: &FakeCommand{err: fmt.Errorf("no folder selected")},
		}
		return cmd
	}

	c.log.Debug().Str("current_folder", c.getCurrentFolder()).Msg("Fetch email headers")

	folder, exists := c.store.folders.Get(c.getCurrentFolder())
	if !exists {
		panic("folder does not exist but is current")
	}

	uidSet, ok := numSet.(imap.UIDSet)
	if !ok {
		cmd := &FakeFetchCommand{
			FakeCommand: &FakeCommand{err: fmt.Errorf("fake client only supports UID sets")},
		}
		return cmd
	}

	folder.mu.Lock()
	defer folder.mu.Unlock()

	allMessages := folder.messages.CopyData()
	var uids []imap.UID
	for uid := range allMessages {
		if uidSet.Contains(uid) {
			uids = append(uids, uid)
		}
	}
	slices.Sort(uids)

	var messages []*imapclient.FetchMessageBuffer
	for _, uid := range uids {
		msg := allMessages[uid]
		parts := []imap.BodyStructure{
			&imap.BodyStructureSinglePart{
				Type:     "text",
				Subtype:  "plain",
				Encoding: "7BIT",
				Size:     uint32(msg.size),
			},
			&imap.BodyStructureSinglePart{
				Type:     "text",
				Subtype:  "html",
				Encoding: "7BIT",
				Size:     uint32(msg.size),
			},
		}
		if msg.uid%10 == 0 {
			// Add a fake attachment to 1/10 emails, sized deterministically so
			// the same email renders the same across fetches
			parts = append(parts, &imap.BodyStructureSinglePart{
				Type:        "image",
				Subtype:     "png",
				Description: "animage.png",
				Size:        16384 + uint32(msg.uid)*7919%16384000,
			})
		}

		fetchMsg := &imapclient.FetchMessageBuffer{
			UID:        msg.uid,
			Flags:      slices.Clone(msg.flags),
			RFC822Size: int64(msg.size),
			Envelope:   msg.envelope,
			BodyStructure: &imap.BodyStructureMultiPart{
				Children: parts,
			},
		}

		// Add sample body sections if requested
		if options.BodySection != nil {
			fetchMsg.BodySection = make([]imapclient.FetchBodySectionBuffer, len(options.BodySection))
			for i, section := range options.BodySection {
				bytes := []byte(msg.content)
				if section.Specifier == imap.PartSpecifierHeader {
					bytes = fakeMessageHeaderBytes(msg)
				}
				fetchMsg.BodySection[i] = imapclient.FetchBodySectionBuffer{
					Section: section,
					Bytes:   bytes,
				}
			}
		}

		messages = append(messages, fetchMsg)
	}

	cmd := &FakeFetchCommand{
		FakeCommand: &FakeCommand{err: nil},
		messages:    messages,
	}
	return cmd
}

func (c *FakeIMAPClient) Store(numSet imap.NumSet, flags *imap.StoreFlags, options *imap.StoreOptions) FetchCommand {
	if c.getCurrentFolder() == "" {
		cmd := &FakeFetchCommand{
			FakeCommand: &FakeCommand{err: fmt.Errorf("no folder selected")},
		}
		return cmd
	}

	folder, exists := c.store.folders.Get(c.getCurrentFolder())
	if !exists {
		panic("folder does not exist but is current")
	}

	uidSet, ok := numSet.(imap.UIDSet)
	if !ok {
		cmd := &FakeFetchCommand{
			FakeCommand: &FakeCommand{err: fmt.Errorf("fake client only supports UID sets")},
		}
		return cmd
	}

	// Only update the messages included in numSet
	folder.mu.Lock()
	for uid, msg := range folder.messages.CopyData() {
		if !uidSet.Contains(uid) {
			continue
		}

		// Update flags based on operation
		switch flags.Op {
		case imap.StoreFlagsSet:
			msg.flags = slices.Clone(flags.Flags)
		case imap.StoreFlagsAdd:
			for _, flag := range flags.Flags {
				if !containsFlag(msg.flags, flag) {
					msg.flags = append(msg.flags, flag)
				}
			}
		case imap.StoreFlagsDel:
			msg.flags = removeFlags(msg.flags, flags.Flags)
		}
	}
	folder.mu.Unlock()
	folder.notify()

	// Return empty fetch command as store doesn't return data by default
	cmd := &FakeFetchCommand{
		FakeCommand: &FakeCommand{err: nil},
		messages:    []*imapclient.FetchMessageBuffer{},
	}
	return cmd
}

func (c *FakeIMAPClient) Expunge() ExpungeCommand {
	return c.expunge(nil)
}

func (c *FakeIMAPClient) UIDExpunge(uids imap.UIDSet) ExpungeCommand {
	return c.expunge(uids)
}

// expunge removes messages marked as deleted, restricted to the given UID set if not nil
func (c *FakeIMAPClient) expunge(uids imap.UIDSet) ExpungeCommand {
	if c.getCurrentFolder() == "" {
		cmd := &FakeExpungeCommand{
			FakeCommand: &FakeCommand{err: fmt.Errorf("no folder selected")},
		}
		return cmd
	}

	folder, exists := c.store.folders.Get(c.getCurrentFolder())
	if !exists {
		panic("folder does not exist but is current")
	}
	var expungedUIDs []imap.UID

	folder.mu.Lock()
	for uid, msg := range folder.messages.CopyData() {
		if uids != nil && !uids.Contains(uid) {
			continue
		}
		if containsFlag(msg.flags, imap.FlagDeleted) {
			folder.messages.Delete(uid)
			expungedUIDs = append(expungedUIDs, uid)
			folder.exists--
		}
	}
	folder.mu.Unlock()
	slices.Sort(expungedUIDs)
	if len(expungedUIDs) > 0 {
		folder.notify()
	}

	cmd := &FakeExpungeCommand{
		FakeCommand: &FakeCommand{err: nil},
		uids:        expungedUIDs,
	}
	return cmd
}

// moveOrCopyFolders resolves and validates the source/dest folders and UID set
// shared by Move and Copy.
func (c *FakeIMAPClient) moveOrCopyFolders(numSet imap.NumSet, dest string) (*fakeFolderData, *fakeFolderData, imap.UIDSet, error) {
	if c.getCurrentFolder() == "" {
		return nil, nil, nil, fmt.Errorf("no folder selected")
	}
	uidSet, ok := numSet.(imap.UIDSet)
	if !ok {
		return nil, nil, nil, fmt.Errorf("fake client only supports UID sets")
	}
	srcFolder, exists := c.store.folders.Get(c.getCurrentFolder())
	if !exists {
		panic("folder does not exist but is current")
	}
	if err := c.outsideNamespaceErr(dest); err != nil {
		return nil, nil, nil, err
	}
	destFolder, exists := c.store.getFolder(dest)
	if !exists {
		return nil, nil, nil, missingMailboxErr(dest)
	}
	return srcFolder, destFolder, uidSet, nil
}

func (c *FakeIMAPClient) Move(numSet imap.NumSet, dest string) MoveCommand {
	srcFolder, destFolder, uidSet, err := c.moveOrCopyFolders(numSet, dest)
	if err != nil {
		return &FakeMoveCommand{FakeCommand: &FakeCommand{err: err}}
	}

	srcUIDs, destUIDs := c.store.moveOrCopyMessages(srcFolder, destFolder, uidSet, true)
	cmd := &FakeMoveCommand{
		FakeCommand: &FakeCommand{err: nil},
		data: &imapclient.MoveData{
			UIDValidity: destFolder.uidValidity,
			SourceUIDs:  srcUIDs,
			DestUIDs:    destUIDs,
		},
	}
	return cmd
}

func (c *FakeIMAPClient) Copy(numSet imap.NumSet, dest string) CopyCommand {
	srcFolder, destFolder, uidSet, err := c.moveOrCopyFolders(numSet, dest)
	if err != nil {
		return &FakeCopyCommand{FakeCommand: &FakeCommand{err: err}}
	}

	srcUIDs, destUIDs := c.store.moveOrCopyMessages(srcFolder, destFolder, uidSet, false)
	cmd := &FakeCopyCommand{
		FakeCommand: &FakeCommand{err: nil},
		data: &imap.CopyData{
			UIDValidity: destFolder.uidValidity,
			SourceUIDs:  srcUIDs,
			DestUIDs:    destUIDs,
		},
	}
	return cmd
}

func (c *FakeIMAPClient) Append(name string, size int64, options *imap.AppendOptions) AppendCommand {
	return &FakeAppendCommand{
		FakeCommand: &FakeCommand{err: c.outsideNamespaceErr(name)},
		store:       c.store,
		folder:      name,
	}
}

// AddCap advertises an extra capability, for tests exercising cap-dependent paths
func (c *FakeIMAPClient) AddCap(cap imap.Cap) {
	c.caps[cap] = struct{}{}
}

// Helper functions

func containsFlag(flags []imap.Flag, flag imap.Flag) bool {
	return slices.Contains(flags, flag)
}

func removeFlags(flags []imap.Flag, toRemove []imap.Flag) []imap.Flag {
	var result []imap.Flag
	for _, flag := range flags {
		if !slices.Contains(toRemove, flag) {
			result = append(result, flag)
		}
	}
	return result
}
