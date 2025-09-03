package imapinterface

import (
	"github.com/emersion/go-imap/v2"
	"github.com/emersion/go-imap/v2/imapclient"
	"github.com/emersion/go-sasl"
)

// The imapinterface package exists entirely to enable swapping out the actual imap implementation
// with a fake one for testing and generating screenshot data/etc.

// Command interfaces for operations that return commands
type Command interface {
	Wait() error
}

type SearchCommand interface {
	Wait() (*imap.SearchData, error)
}

type FetchCommand interface {
	Collect() ([]*imapclient.FetchMessageBuffer, error)
}

type ExpungeCommand interface {
	Collect() ([]uint32, error)
}

type SelectCommand interface {
	Wait() (*imap.SelectData, error)
}

type ListCommand interface {
	Collect() ([]*imap.ListData, error)
}

type NamespaceCommand interface {
	Wait() (*imap.NamespaceData, error)
}

type MoveCommand interface {
	Wait() (*imapclient.MoveData, error)
}

type CopyCommand interface {
	Wait() (*imap.CopyData, error)
}

// IMAPClient interface defines all the IMAP methods used in the codebase
// This allows for mocking/faking the imapclient.Client for testing purposes
type IMAPClient interface {
	// Connection management
	Close() error
	State() imap.ConnState
	Noop() Command

	// Authentication
	Login(username, password string) Command
	Authenticate(sasl sasl.Client) error

	// Capabilities and namespace
	Caps() imap.CapSet
	Namespace() NamespaceCommand

	// Folder operations
	Select(name string, options *imap.SelectOptions) SelectCommand
	Unselect() Command
	List(reference, pattern string, options *imap.ListOptions) ListCommand
	Create(name string, options *imap.CreateOptions) Command

	// Message operations
	UIDSearch(criteria *imap.SearchCriteria, options *imap.SearchOptions) SearchCommand
	Fetch(numSet imap.NumSet, options *imap.FetchOptions) FetchCommand
	Store(numSet imap.NumSet, flags *imap.StoreFlags, options *imap.StoreOptions) FetchCommand
	Expunge() ExpungeCommand
	Move(numSet imap.NumSet, dest string) MoveCommand
	Copy(numSet imap.NumSet, dest string) CopyCommand
}
