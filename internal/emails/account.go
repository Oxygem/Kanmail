package emails

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/emersion/go-imap/v2"
	"github.com/rs/zerolog"

	"github.com/oxygem/kanmail/internal/caches"
	"github.com/oxygem/kanmail/internal/constants"
	"github.com/oxygem/kanmail/internal/emails/imapinterface"
	"github.com/oxygem/kanmail/internal/emails/smtpinterface"
	"github.com/oxygem/kanmail/internal/types"
)

type Account struct {
	types.AccountSettings

	caches *caches.Caches

	imap *IMAPConnectionPool
	smtp *SMTPConnectionPool

	foldersLock sync.Mutex
	folders     map[types.FolderName]*Folder

	watchersLock   sync.Mutex
	watchers       map[types.FolderName]*folderWatcher
	watchersClosed bool
}

const (
	defaultIMAPConnections = 5 // → 2 regular / 2 priority / 1 background
	defaultSMTPConnections = 2
	minIMAPConnections     = 3
	networkErrRetries      = 5
)

// imapPoolOptions partitions a total IMAP socket budget across the regular,
// priority and background pools. A zero budget falls back to the default.
func imapPoolOptions(name types.AccountName, n int) ConnectionPoolOptions {
	if n <= 0 {
		n = defaultIMAPConnections
	}
	n = max(n, minIMAPConnections)
	priority := max((n-1)/2, 1)
	return ConnectionPoolOptions{
		AccountName:           string(name),
		Connections:           n - 1 - priority,
		PriorityConnections:   priority,
		BackgroundConnections: 1,
		NetworkErrRetries:     networkErrRetries,
	}
}

// smtpPoolOptions sizes the SMTP pool, which only uses the regular connection
// channel. A zero budget falls back to the default.
func smtpPoolOptions(name types.AccountName, n int) ConnectionPoolOptions {
	if n <= 0 {
		n = defaultSMTPConnections
	}
	n = max(n, 1)
	return ConnectionPoolOptions{
		AccountName:       string(name),
		Connections:       n,
		NetworkErrRetries: networkErrRetries,
	}
}

// NewAccount builds an account and its connection pools. onAuthenticated, if
// set, is called every time one of those pools hands out an authenticated
// connection - the only positive signal that the credentials still work.
func NewAccount(
	accountSettings types.AccountSettings,
	caches *caches.Caches,
	onAuthenticated func(),
) *Account {
	imapOptions := imapPoolOptions(accountSettings.Name, accountSettings.IMAPSettings.Connections)
	imapOptions.OnAuthenticated = onAuthenticated
	smtpOptions := smtpPoolOptions(accountSettings.Name, accountSettings.SMTPSettings.Connections)
	smtpOptions.OnAuthenticated = onAuthenticated

	return &Account{
		AccountSettings: accountSettings,
		caches:          caches,
		imap: NewIMAPConnectionPool(
			imapOptions,
			accountSettings.IMAPSettings,
		),
		smtp: NewSMTPConnectionPool(
			smtpOptions,
			accountSettings.SMTPSettings,
		),
		folders:  make(map[types.FolderName]*Folder),
		watchers: make(map[types.FolderName]*folderWatcher),
	}
}

func (a *Account) CloseConnections(ctx context.Context) {
	// Close watchers first so in-flight IDLEs exit cleanly (cancelled) rather
	// than erroring when their connections are torn down underneath them.
	a.watchersLock.Lock()
	a.watchersClosed = true
	for _, w := range a.watchers {
		w.Close()
	}
	clear(a.watchers)
	a.watchersLock.Unlock()

	a.imap.CloseConnections(ctx)
	a.smtp.CloseConnections(ctx)
}

// resolveFolderName turns the name the frontend uses into the mailbox name for
// use with the server.
func (a *Account) resolveFolderName(name types.FolderName) types.FolderName {
	if mapped := a.Folders.Lookup(name); mapped != "" {
		name = mapped
	}
	ns := a.Settings.Namespaces
	n := name.Canonical(ns.Delim())
	switch {
	case n.IsInbox():
		return "INBOX"
	case ns.Contains(n):
		return n
	default:
		return types.FolderName(ns.PersonalRoot()) + n
	}
}

// DisplayFolderName is the inverse of resolveFolderName
func (a *Account) DisplayFolderName(name types.FolderName) types.FolderName {
	if alias, isMapped := a.Folders.AliasFor(name, a.Settings.Namespaces.Delim()); isMapped {
		return alias
	}
	if name.IsInbox() {
		if a.Folders.Inbox != "" {
			return "INBOX"
		}
		return "inbox"
	}
	logical := types.FolderName(strings.TrimPrefix(string(name), a.Settings.Namespaces.PersonalRoot()))
	if a.resolveFolderName(logical) != name {
		return name
	}
	return logical
}

// GetFolder returns the one Folder for the mailbox a name resolves to, however
// that mailbox is asked for.
func (a *Account) GetFolder(name types.FolderName) *Folder {
	a.foldersLock.Lock()
	defer a.foldersLock.Unlock()

	name = a.resolveFolderName(name)
	if f, ok := a.folders[name]; ok {
		return f
	}
	a.folders[name] = NewFolder(a, name)
	return a.folders[name]
}

// WatchFolder blocks until the folder changes on the server, the context is
// cancelled or the account's connections are closed. Each folder has a single
// watcher, which borrows a pooled connection per watch and yields it whenever
// interactive work needs it, so watching costs no extra connections.
func (a *Account) WatchFolder(ctx context.Context, name types.FolderName) (*WatchResp, error) {
	if constants.ENV_DEBUG_OFFLINE != "" {
		return &WatchResp{Status: WatchStatusUnsupported}, nil
	}

	name = a.resolveFolderName(name)

	a.watchersLock.Lock()
	if a.watchersClosed {
		a.watchersLock.Unlock()
		return nil, errors.New("account connections closed")
	}
	w, ok := a.watchers[name]
	if !ok {
		w = newFolderWatcher(a.imap, name)
		a.watchers[name] = w
	}
	a.watchersLock.Unlock()

	return w.Watch(ctx)
}

func (a *Account) TestSMTPConnection(ctx context.Context) error {
	return a.smtp.WithConnection(ctx, func(conn smtpinterface.SMTPClient) error {
		return conn.Noop()
	})
}

func (a *Account) FetchCapabilities(ctx context.Context) (caps imap.CapSet, err error) {
	err = a.imap.WithPriorityConnection(ctx, func(conn imapinterface.IMAPClient) error {
		caps = conn.Caps()
		return nil
	})
	return
}

func (a *Account) FetchNamespace(ctx context.Context) (data *imap.NamespaceData, err error) {
	err = a.imap.WithPriorityConnection(ctx, func(conn imapinterface.IMAPClient) error {
		data, err = conn.Namespace().Wait()
		return err
	})
	return
}

func (a *Account) FetchMailboxList(ctx context.Context) (data []*imap.ListData, err error) {
	err = a.imap.WithPriorityConnection(ctx, func(conn imapinterface.IMAPClient) error {
		data, err = listMailboxesRecursive(ctx, conn, a.Settings.Namespaces)
		return err
	})
	return
}

func (a *Account) FetchFolderNames(ctx context.Context) ([]types.FolderName, error) {
	list, err := a.FetchMailboxList(ctx)
	if err != nil {
		return nil, err
	}

	folders := make([]types.FolderName, 0, len(list))
	for _, mailbox := range list {
		name := types.FolderName(mailbox.Mailbox)
		if name.IsInbox() {
			continue
		} else if slices.Contains(mailbox.Attrs, imap.MailboxAttrNoSelect) {
			continue
		} else if _, isMapped := a.Folders.AliasFor(name, a.Settings.Namespaces.Delim()); isMapped {
			continue
		}
		// Skip mailboxes with a display name (alias) that maps back to a different folder
		logical := a.DisplayFolderName(name)
		if a.resolveFolderName(logical) != name {
			continue
		}
		folders = append(folders, logical)
	}
	return folders, nil
}

func fetchNamespaces(ctx context.Context, conn imapinterface.IMAPClient) (types.Namespaces, error) {
	if conn.Caps().Has(imap.CapNamespace) {
		data, err := conn.Namespace().Wait()
		if err != nil {
			return types.Namespaces{}, fmt.Errorf("failed to fetch IMAP namespace: %w", err)
		}
		if namespaces := types.NamespacesFromIMAP(data); len(namespaces.Personal) > 0 {
			return namespaces, nil
		}
	}
	return types.Namespaces{Personal: []types.Namespace{{Delim: fetchRootDelimiter(ctx, conn)}}}, nil
}

func fetchRootDelimiter(ctx context.Context, conn imapinterface.IMAPClient) string {
	for _, pattern := range []string{"", "%"} {
		mailboxes, err := conn.List("", pattern, &imap.ListOptions{}).Collect()
		if err != nil {
			zerolog.Ctx(ctx).Warn().Err(err).Str("pattern", pattern).Msg("Failed to list for hierarchy delimiter")
			continue
		}
		for _, mailbox := range mailboxes {
			if mailbox.Delim != 0 {
				return string(mailbox.Delim)
			}
		}
	}
	return ""
}

func (a *Account) FetchAndUpdateSettings(ctx context.Context) error {
	return a.imap.WithPriorityConnection(ctx, func(conn imapinterface.IMAPClient) error {
		namespaces, err := fetchNamespaces(ctx, conn)
		if err != nil {
			return err
		}
		a.Settings.Namespaces = namespaces

		mailboxes, err := listMailboxesRecursive(ctx, conn, namespaces)
		if err != nil {
			return err
		}

		for _, mailbox := range mailboxes {
			setFolderForMailbox(ctx, &a.Folders, namespaces.PersonalRoot(), mailbox)
		}

		// Gmail is the only provider (known at this time) that automatically saves emails sent via SMTP
		// to the sent folder, so otherwise we append them via IMAP on send.
		if a.IMAPSettings.Host != "imap.gmail.com" {
			a.Settings.SaveSentCopies = true
		}

		return nil
	})
}

func (a *Account) FindMessageIDs(ctx context.Context, messageIDs []string) ([]*types.Email, error) {
	emails := make([]*types.Email, 0, len(messageIDs))
	missing := make([]string, 0, len(messageIDs))

	// First lookup cached emails by messageID (id -> []Email)
	cached, err := a.caches.FolderEmailCache.GetByMessageIDs(ctx, a.ID, messageIDs)
	if err != nil {
		return nil, err
	}

	// TODO: check cached ones still exist (grab flags?)
	// FIXME NO not much point?

	for _, msgid := range messageIDs {
		if ems, ok := cached[msgid]; ok {
			// Add all matched emails (same messageID might exist in multiple folders)
			emails = append(emails, ems...)
		} else {
			// Is there EVER a benefit to looking up messageIDs again? (as we sync we'll populate the cached)
			// FIXME TODO
			lastLookupAt, err := a.caches.FolderEmailCache.GetLastMessageIDLookupAt(ctx, a.ID, msgid)
			if err != nil {
				return nil, err
			}
			// TODO: configurable timeout? Or never timeout, once not found it won't be unless it
			// comes down on sync where it'll be processed. Might get lost later, can prob set to
			// 24h -> 30d. OR MORE see above.
			if time.Now().UTC().Sub(lastLookupAt) > time.Hour*24*90 {
				missing = append(missing, msgid)
			} else {
				zerolog.Ctx(ctx).Debug().
					Str("message_id", msgid).
					Time("last_lookup_at", lastLookupAt).
					Msg("Skip messageID search due to recent lookup")
			}
		}
	}

	// Failing that, lookup on the server in common folders
	var fetched int
	for _, folder := range []types.FolderName{"archive", "sent", "trash"} {
		if len(missing) == 0 {
			break
		}
		if a.Folders.Lookup(folder) == "" {
			zerolog.Ctx(ctx).Debug().
				Str("folder", string(folder)).
				Msg("Skip messageID search in unmapped folder")
			continue
		}
		newMsg, missingNext, err := a.GetFolder(folder).SearchMessageIDs(ctx, missing)
		if err != nil {
			return nil, err
		}
		for _, v := range newMsg {
			emails = append(emails, v)
		}
		fetched += len(newMsg)
		missing = missingNext
	}

	for _, msgid := range missing {
		if err := a.caches.FolderEmailCache.SetLastMessageIDLookupNow(ctx, a.ID, msgid); err != nil {
			zerolog.Ctx(ctx).Err(err).Msg("Failed to set last message ID lookup")
		}
	}

	zerolog.Ctx(ctx).Info().
		Int("fetched", fetched).
		Int("cached", len(cached)).
		Int("missing", len(missing)).
		Msg("Got emails from message IDs")

	return emails, nil
}

func (a *Account) SearchReferences(ctx context.Context, references []EmailRef) ([]*types.Email, error) {
	emails := make([]*types.Email, 0, len(references))

	// First lookup cached emails by messageID (id -> []Email)
	refStrs := make([]string, len(references))
	for i, r := range references {
		refStrs[i] = r.Reference
	}
	cached, err := a.caches.FolderEmailCache.SearchReferences(ctx, a.ID, refStrs)
	if err != nil {
		return nil, err
	}

	for _, ems := range cached {
		emails = append(emails, ems...)
	}

	zerolog.Ctx(ctx).Info().
		Int("references", len(references)).
		Int("cached", len(cached)).
		Msg("Got emails by reference to message IDs")

	return emails, nil

	// zerolog.Ctx(ctx).Debug().Any("CACHED", cached).Msg("WHAT IN THE")

	// // TODO: check cached ones still exist (grab flags?)
	// // FIXME NO not much point?

	// for _, ref := range references {
	// 	if ems, ok := cached[ref.Reference]; ok {
	// 		emails = append(emails, ems...)
	// 		zerolog.Ctx(ctx).Trace().
	// 			Any("reference", ref).
	// 			Int("emails", len(ems)).
	// 			Msg("Got cached references")
	// 	} else {
	// 		// Is there EVER a benefit to looking up messageIDs again? (as we sync we'll populate the cached)
	// 		// FIXME TODO
	// 		lastLookupAt, err := a.caches.FolderEmailCache.GetLastReferenceLookupAt(ctx, a.ID, ref.Reference)
	// 		if err != nil {
	// 			return nil, err
	// 		}
	// 		// TODO: configurable timeout? Or never timeout, once not found it won't be unless it
	// 		// comes down on sync where it'll be processed. Might get lost later, can prob set to
	// 		// 24h -> 30d. OR MORE see above.
	// 		if time.Now().UTC().Sub(lastLookupAt) > time.Hour*24*90 {
	// 			missing = append(missing, ref)
	// 		} else {
	// 			zerolog.Ctx(ctx).Debug().
	// 				Any("reference", ref).
	// 				Time("last_lookup_at", lastLookupAt).
	// 				Msg("Skip reference search due to recent lookup")
	// 		}
	// 	}
	// }

	// // Failing that, lookup on the server in common folders
	// var fetched int
	// for _, folder := range []types.FolderName{"inbox", "sent"} {
	// 	if len(missing) == 0 {
	// 		break
	// 	}
	// 	newMsg, missingNext, err := a.GetFolder(folder).SearchReferences(ctx, missing)
	// 	if err != nil {
	// 		return nil, err
	// 	}
	// 	for _, v := range newMsg {
	// 		emails = append(emails, v)
	// 	}
	// 	fetched += len(newMsg)
	// 	missing = missingNext
	// }

	// for _, ref := range missing {
	// 	if err := a.caches.FolderEmailCache.SetLastReferenceLookupNow(ctx, a.ID, ref.Reference); err != nil {
	// 		zerolog.Ctx(ctx).Err(err).Msg("Failed to set last reference lookup")
	// 	}
	// }

	// zerolog.Ctx(ctx).Info().
	// 	Int("references", len(references)).
	// 	Int("cached", len(cached)).
	// 	Int("fetched", fetched).
	// 	Int("missing", len(missing)).
	// 	Msg("Got emails by reference to message IDs")

	// return emails, nil
}
