package emails

import (
	"context"
	"strings"

	"github.com/emersion/go-imap/v2"
	"github.com/rs/zerolog"

	"github.com/oxygem/kanmail/internal/types"
)

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

	log.Info().
		Any("folders", folders).
		Any("mailbox", mailbox).
		Str("mailbox", string(mboxName)).
		Msg("Check mailbox settings")

	defer func() {
		log.Info().
			Any("folders", folders).
			Str("mailbox", string(mboxName)).
			Msg("Updated folder settings")
	}()

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
		case imap.MailboxAttrFlagged:
			folders.Flagged = fullName
		case imap.MailboxAttrImportant:
			folders.Important = fullName
		case imap.MailboxAttrSent:
			folders.Sent = fullName
		case imap.MailboxAttrDrafts:
			folders.Drafts = fullName
		case imap.MailboxAttrTrash:
			folders.Trash = fullName
		case imap.MailboxAttrJunk:
			folders.Junk = fullName
		}
	}

	// Now search for the inbox (no inbox attr)
	for _, name := range popularSpecialFolders.Inbox {
		if mboxName == name {
			folders.Inbox = fullName
		}
	}

	// And now search for any missing
	if folders.Flagged == "" {
		for _, name := range popularSpecialFolders.Flagged {
			if mboxName == name {
				folders.Flagged = fullName
			}
		}
	}
	if folders.Important == "" {
		for _, name := range popularSpecialFolders.Important {
			if mboxName == name {
				folders.Important = fullName
			}
		}
	}
	if folders.Sent == "" {
		for _, name := range popularSpecialFolders.Sent {
			if mboxName == name {
				folders.Sent = fullName
			}
		}
	}
	if folders.Drafts == "" {
		for _, name := range popularSpecialFolders.Drafts {
			if mboxName == name {
				folders.Drafts = fullName
			}
		}
	}
	if folders.Archive == "" {
		for _, name := range popularSpecialFolders.Archive {
			if mboxName == name {
				folders.Archive = fullName
			}
		}
	}
	if folders.Trash == "" {
		for _, name := range popularSpecialFolders.Trash {
			if mboxName == name {
				folders.Trash = fullName
			}
		}
	}
	if folders.Junk == "" {
		for _, name := range popularSpecialFolders.Junk {
			if mboxName == name {
				folders.Junk = fullName
			}
		}
	}
}
