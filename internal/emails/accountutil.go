package emails

import (
	"context"
	"fmt"
	"strings"

	"github.com/emersion/go-imap/v2"
	"github.com/rs/zerolog"

	"github.com/oxygem/kanmail/internal/emails/imapinterface"
	"github.com/oxygem/kanmail/internal/types"
)

// listMailboxesRecursive recursively lists all mailboxes starting from the given prefix.
// It descends into subfolders unless the mailbox has the HasNoChildren attribute.
func listMailboxesRecursive(
	ctx context.Context,
	conn imapinterface.IMAPClient,
	prefix string,
	separator string,
) ([]*imap.ListData, error) {
	var allMailboxes []*imap.ListData
	seenMailboxes := make(map[string]bool)

	var getMailboxes func(folder string) error
	getMailboxes = func(folder string) error {
		seenMailboxes[folder] = true

		pattern := folder
		if pattern != "" {
			pattern = pattern + separator
		}
		mailboxes, err := conn.List(pattern, "%", &imap.ListOptions{}).Collect()
		if err != nil {
			return fmt.Errorf("failed to fetch IMAP folders in dir: %s: %w", folder, err)
		}
		zerolog.Ctx(ctx).Debug().
			Str("folder", folder).
			Any("mailboxes", mailboxes).
			Msg("Listed mailboxes")

		for _, mailbox := range mailboxes {
			allMailboxes = append(allMailboxes, mailbox)

			// Unless explicitly flagged w/no children attribute we search for nested folders
			var noChildren bool
			for _, attr := range mailbox.Attrs {
				if attr == imap.MailboxAttrHasNoChildren {
					noChildren = true
					break
				}
			}
			if !noChildren && mailbox.Mailbox != folder && !seenMailboxes[mailbox.Mailbox] {
				if err := getMailboxes(mailbox.Mailbox); err != nil {
					return err
				}
			}
		}

		return nil
	}

	if err := getMailboxes(prefix); err != nil {
		return nil, err
	}

	return allMailboxes, nil
}

var popularSpecialFolders = struct {
	Inbox, Flagged, Important, Sent, Drafts, Archive, Trash, Junk []types.FolderName
}{
	Inbox:     []types.FolderName{"INBOX", "Inbox", "inbox", "posteingang"},
	Flagged:   []types.FolderName{"Starred", "Flagged"},
	Important: []types.FolderName{"Important"},
	Sent:      []types.FolderName{"Sent Mail", "Sent", "Sent Items", "Sent items"},
	Drafts:    []types.FolderName{"Drafts"},
	Archive:   []types.FolderName{"All Mail", "Archive"},
	Trash:     []types.FolderName{"Trash", "Deleted Items", "Deleted Messages", "Deleted"},
	Junk:      []types.FolderName{"Junk", "Spam"},
}

func setFolderForMailbox(ctx context.Context, folders *types.FolderSettings, folder string, mailbox *imap.ListData) {
	log := zerolog.Ctx(ctx)

	fullName := types.FolderName(mailbox.Mailbox)
	mboxName := types.FolderName(strings.TrimPrefix(mailbox.Mailbox, folder))

	var changed bool

	// First try searching attrs (imap SPECIAL-USE extension)
	for _, attr := range mailbox.Attrs {
		switch attr {
		case imap.MailboxAttrArchive, imap.MailboxAttrAll:
			if folders.Archive != "" && folders.Archive != mboxName {
				log.Warn().
					Str("folder_current", string(folders.Archive)).
					Str("folder_new", string(mboxName)).
					Msg("Different all/archive folder")
			}
			folders.Archive = fullName
			changed = true
		case imap.MailboxAttrFlagged:
			folders.Flagged = fullName
			changed = true
		case imap.MailboxAttrImportant:
			folders.Important = fullName
			changed = true
		case imap.MailboxAttrSent:
			folders.Sent = fullName
			changed = true
		case imap.MailboxAttrDrafts:
			folders.Drafts = fullName
			changed = true
		case imap.MailboxAttrTrash:
			folders.Trash = fullName
			changed = true
		case imap.MailboxAttrJunk:
			folders.Junk = fullName
			changed = true
		}
	}

	// Now search for the inbox (no inbox attr)
	for _, name := range popularSpecialFolders.Inbox {
		if mboxName == name {
			folders.Inbox = fullName
			changed = true
		}
	}

	// And now search for any missing
	if folders.Flagged == "" {
		for _, name := range popularSpecialFolders.Flagged {
			if mboxName == name {
				folders.Flagged = fullName
				changed = true
			}
		}
	}
	if folders.Important == "" {
		for _, name := range popularSpecialFolders.Important {
			if mboxName == name {
				folders.Important = fullName
				changed = true
			}
		}
	}
	if folders.Sent == "" {
		for _, name := range popularSpecialFolders.Sent {
			if mboxName == name {
				folders.Sent = fullName
				changed = true
			}
		}
	}
	if folders.Drafts == "" {
		for _, name := range popularSpecialFolders.Drafts {
			if mboxName == name {
				folders.Drafts = fullName
				changed = true
			}
		}
	}
	if folders.Archive == "" {
		for _, name := range popularSpecialFolders.Archive {
			if mboxName == name {
				folders.Archive = fullName
				changed = true
			}
		}
	}
	if folders.Trash == "" {
		for _, name := range popularSpecialFolders.Trash {
			if mboxName == name {
				folders.Trash = fullName
				changed = true
			}
		}
	}
	if folders.Junk == "" {
		for _, name := range popularSpecialFolders.Junk {
			if mboxName == name {
				folders.Junk = fullName
				changed = true
			}
		}
	}

	if changed {
		log.Info().Any("settings", folders).Msg("Updated folder settings")
	}
}
