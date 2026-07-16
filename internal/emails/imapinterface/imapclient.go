package imapinterface

import (
	"github.com/emersion/go-imap/v2"
	"github.com/emersion/go-imap/v2/imapclient"
)

var _ IMAPClient = (*IMAPClientWrapper)(nil)

// IMAPClientWrapper wraps imapclient.Client to implement our interface
type IMAPClientWrapper struct {
	*imapclient.Client
}

func (w *IMAPClientWrapper) Noop() Command {
	return w.Client.Noop()
}

func (w *IMAPClientWrapper) Login(username, password string) Command {
	return w.Client.Login(username, password)
}

func (w *IMAPClientWrapper) Namespace() NamespaceCommand {
	return w.Client.Namespace()
}

func (w *IMAPClientWrapper) Select(name string, options *imap.SelectOptions) SelectCommand {
	return w.Client.Select(name, options)
}

func (w *IMAPClientWrapper) Unselect() Command {
	return w.Client.Unselect()
}

func (w *IMAPClientWrapper) Idle() (IdleCommand, error) {
	cmd, err := w.Client.Idle()
	if err != nil {
		return nil, err
	}
	return cmd, nil
}

func (w *IMAPClientWrapper) List(reference, pattern string, options *imap.ListOptions) ListCommand {
	return w.Client.List(reference, pattern, options)
}

func (w *IMAPClientWrapper) Create(name string, options *imap.CreateOptions) Command {
	return w.Client.Create(name, options)
}

func (w *IMAPClientWrapper) UIDSearch(criteria *imap.SearchCriteria, options *imap.SearchOptions) SearchCommand {
	return w.Client.UIDSearch(criteria, options)
}

func (w *IMAPClientWrapper) Fetch(numSet imap.NumSet, options *imap.FetchOptions) FetchCommand {
	return w.Client.Fetch(numSet, options)
}

func (w *IMAPClientWrapper) Store(numSet imap.NumSet, flags *imap.StoreFlags, options *imap.StoreOptions) FetchCommand {
	return w.Client.Store(numSet, flags, options)
}

func (w *IMAPClientWrapper) Expunge() ExpungeCommand {
	return w.Client.Expunge()
}

func (w *IMAPClientWrapper) UIDExpunge(uids imap.UIDSet) ExpungeCommand {
	return w.Client.UIDExpunge(uids)
}

func (w *IMAPClientWrapper) Move(numSet imap.NumSet, dest string) MoveCommand {
	return w.Client.Move(numSet, dest)
}

func (w *IMAPClientWrapper) Copy(numSet imap.NumSet, dest string) CopyCommand {
	return w.Client.Copy(numSet, dest)
}

func (w *IMAPClientWrapper) Append(name string, size int64, options *imap.AppendOptions) AppendCommand {
	return w.Client.Append(name, size, options)
}
