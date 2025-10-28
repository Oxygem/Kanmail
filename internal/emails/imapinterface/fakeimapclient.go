package imapinterface

import (
	"context"
	"fmt"
	"math/rand"
	"slices"
	"time"

	"github.com/brianvoe/gofakeit/v7"
	"github.com/emersion/go-imap/v2"
	"github.com/emersion/go-imap/v2/imapclient"
	"github.com/emersion/go-sasl"
	"github.com/rs/zerolog"
)

// Our fake imap client implements IMAPClient
var _ IMAPClient = (*FakeIMAPClient)(nil)

// FakeIMAPClient implements the IMAPClient interface with fake data
// for testing and development purposes
type FakeIMAPClient struct {
	log zerolog.Logger

	state         imap.ConnState
	caps          imap.CapSet
	currentFolder string
}

// Simple fake command that just returns success
type FakeCommand struct {
	err error
}

func (c *FakeCommand) Wait() error {
	// Sleep anywhere between 0-10s
	time.Sleep(time.Millisecond * time.Duration(rand.Intn(10000)))
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

// FakeCopyCommand implements AppendCommand interface
var _ AppendCommand = (*FakeAppendCommand)(nil)

type FakeAppendCommand struct {
	*FakeCommand
	data *imap.AppendData
}

func (c *FakeAppendCommand) Wait() (*imap.AppendData, error) {
	if err := c.FakeCommand.Wait(); err != nil {
		return nil, err
	}
	return c.data, nil
}

func (c *FakeAppendCommand) Close() error {
	return nil
}

func (c *FakeAppendCommand) Write(b []byte) (int, error) {
	return 0, nil
}

// NewFakeIMAPClient creates a new fake IMAP client with sample data
func NewFakeIMAPClient() *FakeIMAPClient {
	log := zerolog.Ctx(context.TODO()).With().
		Str("component", "FakeIMAPClient").
		Logger()

	client := &FakeIMAPClient{
		state: imap.ConnStateAuthenticated,
		caps:  imap.CapSet{},
		log:   log,
	}

	return client
}

// IMAPClient interface implementation

func (c *FakeIMAPClient) Close() error {
	c.state = imap.ConnStateLogout
	return nil
}

func (c *FakeIMAPClient) State() imap.ConnState {
	return c.state
}

func (c *FakeIMAPClient) Noop() Command {
	return &FakeCommand{err: nil}
}

func (c *FakeIMAPClient) Login(username, password string) Command {
	c.state = imap.ConnStateAuthenticated
	return &FakeCommand{err: nil}
}

func (c *FakeIMAPClient) Authenticate(sasl sasl.Client) error {
	c.state = imap.ConnStateAuthenticated
	return nil
}

func (c *FakeIMAPClient) Caps() imap.CapSet {
	return c.caps
}

func (c *FakeIMAPClient) Namespace() NamespaceCommand {
	data := &imap.NamespaceData{
		Personal: []imap.NamespaceDescriptor{{
			Prefix: "",
		}},
	}
	return &FakeNamespaceCommand{
		FakeCommand: &FakeCommand{err: nil},
		data:        data,
	}
}

func (c *FakeIMAPClient) Select(name string, options *imap.SelectOptions) SelectCommand {
	folder, exists := fakeStore.folders.Get(name)
	if !exists {
		cmd := &FakeSelectCommand{
			FakeCommand: &FakeCommand{err: fmt.Errorf("folder %s does not exist", name)},
		}
		return cmd
	}

	c.currentFolder = name
	data := &imap.SelectData{
		UIDValidity: folder.uidValidity,
		UIDNext:     folder.uidNext,
		NumMessages: folder.exists,
		Flags:       []imap.Flag{imap.FlagSeen, imap.FlagAnswered, imap.FlagDeleted, imap.FlagDraft},
	}

	cmd := &FakeSelectCommand{
		FakeCommand: &FakeCommand{err: nil},
		data:        data,
	}

	return cmd
}

func (c *FakeIMAPClient) Unselect() Command {
	c.currentFolder = ""
	cmd := &FakeCommand{err: nil}
	return cmd
}

func (c *FakeIMAPClient) List(reference, pattern string, options *imap.ListOptions) ListCommand {
	var data []*imap.ListData

	for name := range fakeStore.folders.CopyData() {
		data = append(data, &imap.ListData{
			Attrs:   []imap.MailboxAttr{},
			Mailbox: name,
		})
	}

	cmd := &FakeListCommand{
		FakeCommand: &FakeCommand{err: nil},
		data:        data,
	}
	return cmd
}

func (c *FakeIMAPClient) Create(name string, options *imap.CreateOptions) Command {
	if _, exists := fakeStore.folders.Get(name); exists {
		cmd := &FakeCommand{err: fmt.Errorf("folder %s already exists", name)}
		return cmd
	}

	fakeStore.createFolderData(name)

	cmd := &FakeCommand{err: nil}
	return cmd
}

func (c *FakeIMAPClient) UIDSearch(criteria *imap.SearchCriteria, options *imap.SearchOptions) SearchCommand {
	if c.currentFolder == "" {
		cmd := &FakeSearchCommand{
			FakeCommand: &FakeCommand{err: fmt.Errorf("no folder selected")},
		}
		return cmd
	}

	folder, exists := fakeStore.folders.Get(c.currentFolder)
	if !exists {
		panic("folder does not exist but is current")
	}
	var matchingUIDs []imap.UID

	// Simple search implementation - return all UIDs for now
	for uid := range folder.messages.CopyData() {
		matchingUIDs = append(matchingUIDs, uid)
	}

	data := &imap.SearchData{
		All: imap.UIDSetNum(matchingUIDs...),
	}

	cmd := &FakeSearchCommand{
		FakeCommand: &FakeCommand{err: nil},
		data:        data,
	}
	return cmd
}

func (c *FakeIMAPClient) Fetch(numSet imap.NumSet, options *imap.FetchOptions) FetchCommand {
	if c.currentFolder == "" {
		cmd := &FakeFetchCommand{
			FakeCommand: &FakeCommand{err: fmt.Errorf("no folder selected")},
		}
		return cmd
	}

	c.log.Debug().Str("current_folder", c.currentFolder).Msg("Fetch email headers")

	folder, exists := fakeStore.folders.Get(c.currentFolder)
	if !exists {
		panic("folder does not exist but is current")
	}
	var messages []*imapclient.FetchMessageBuffer

	// Convert NumSet to UIDs and fetch matching messages
	// For fake implementation, just use all messages in folder for now
	uids, _ := numSet.(imap.UIDSet).Nums()
	for _, uid := range uids {
		msg, exists := folder.messages.Get(uid)
		if !exists {
			continue
			// panic("email does not exist")
		}
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
		if gofakeit.IntN(100)%10 == 0 {
			// Add a fake attachment to 1/10 emails
			parts = append(parts, &imap.BodyStructureSinglePart{
				Type:        "image",
				Subtype:     "png",
				Description: "animage.png",
				Size:        uint32(gofakeit.IntRange(16384, 16384000)),
			})
		}

		fetchMsg := &imapclient.FetchMessageBuffer{
			UID:        msg.uid,
			Flags:      msg.flags,
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
				fetchMsg.BodySection[i] = imapclient.FetchBodySectionBuffer{
					Section: section,
					Bytes:   []byte(msg.content),
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
	if c.currentFolder == "" {
		cmd := &FakeFetchCommand{
			FakeCommand: &FakeCommand{err: fmt.Errorf("no folder selected")},
		}
		return cmd
	}

	folder, exists := fakeStore.folders.Get(c.currentFolder)
	if !exists {
		panic("folder does not exist but is current")
	}

	// For fake implementation, just update all messages
	for _, msg := range folder.messages.CopyData() {
		// Update flags based on operation
		switch flags.Op {
		case imap.StoreFlagsSet:
			msg.flags = flags.Flags
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

	// Return empty fetch command as store doesn't return data by default
	cmd := &FakeFetchCommand{
		FakeCommand: &FakeCommand{err: nil},
		messages:    []*imapclient.FetchMessageBuffer{},
	}
	return cmd
}

func (c *FakeIMAPClient) Expunge() ExpungeCommand {
	if c.currentFolder == "" {
		cmd := &FakeExpungeCommand{
			FakeCommand: &FakeCommand{err: fmt.Errorf("no folder selected")},
		}
		return cmd
	}

	folder, exists := fakeStore.folders.Get(c.currentFolder)
	if !exists {
		panic("folder does not exist but is current")
	}
	var expungedUIDs []imap.UID

	// Remove messages marked as deleted
	for uid, msg := range folder.messages.CopyData() {
		if containsFlag(msg.flags, imap.FlagDeleted) {
			folder.messages.Delete(uid)
			expungedUIDs = append(expungedUIDs, uid)
			folder.exists--
		}
	}

	cmd := &FakeExpungeCommand{
		FakeCommand: &FakeCommand{err: nil},
		uids:        expungedUIDs,
	}
	return cmd
}

func (c *FakeIMAPClient) Move(numSet imap.NumSet, dest string) MoveCommand {
	// Simple implementation - just return success
	cmd := &FakeMoveCommand{
		FakeCommand: &FakeCommand{err: nil},
		data:        &imapclient.MoveData{},
	}
	return cmd
}

func (c *FakeIMAPClient) Copy(numSet imap.NumSet, dest string) CopyCommand {
	// Simple implementation - just return success
	cmd := &FakeCopyCommand{
		FakeCommand: &FakeCommand{err: nil},
		data:        &imap.CopyData{},
	}
	return cmd
}

func (c *FakeIMAPClient) Append(name string, size int64, options *imap.AppendOptions) AppendCommand {
	cmd := &FakeAppendCommand{
		FakeCommand: &FakeCommand{err: nil},
		data:        &imap.AppendData{},
	}
	return cmd
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
