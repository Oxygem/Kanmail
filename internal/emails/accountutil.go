package emails

import (
	"context"
	"fmt"
	"slices"
	"strings"

	"github.com/emersion/go-imap/v2"
	"github.com/rs/zerolog"

	"github.com/oxygem/kanmail/internal/emails/imapinterface"
	"github.com/oxygem/kanmail/internal/types"
)

func listMailboxesRecursive(
	ctx context.Context,
	conn imapinterface.IMAPClient,
	ns types.Namespaces,
) ([]*imap.ListData, error) {
	var allMailboxes []*imap.ListData
	listed := make(map[string]bool)

	var listChildren func(root, delim string) error
	listChildren = func(root, delim string) error {
		mailboxes, err := conn.List(root, "%", &imap.ListOptions{}).Collect()
		if err != nil {
			return fmt.Errorf("failed to fetch IMAP folders in dir: %s: %w", root, err)
		}
		zerolog.Ctx(ctx).Debug().
			Str("root", root).
			Any("mailboxes", mailboxes).
			Msg("Listed mailboxes")

		for _, mailbox := range mailboxes {
			if listed[mailbox.Mailbox] {
				continue
			}
			listed[mailbox.Mailbox] = true
			allMailboxes = append(allMailboxes, mailbox)

			if delim == "" || slices.Contains(mailbox.Attrs, imap.MailboxAttrHasNoChildren) {
				continue
			}
			if err := listChildren(mailbox.Mailbox+delim, delim); err != nil {
				return err
			}
		}
		return nil
	}

	inbox, err := conn.List("", "INBOX", &imap.ListOptions{}).Collect()
	if err != nil {
		return nil, fmt.Errorf("failed to fetch INBOX: %w", err)
	}
	for _, mailbox := range inbox {
		listed[mailbox.Mailbox] = true
		allMailboxes = append(allMailboxes, mailbox)

		// Servers with an empty personal prefix nest folders under the INBOX
		// (Office365 "INBOX/Receipts", Dovecot Maildir++), where no namespace
		// root reaches them
		if mailbox.Delim == 0 || slices.Contains(mailbox.Attrs, imap.MailboxAttrHasNoChildren) {
			continue
		}
		delim := string(mailbox.Delim)
		if ns.PersonalRoot() == mailbox.Mailbox+delim {
			continue // Courier style, the namespace root below lists these
		}
		if err := listChildren(mailbox.Mailbox+delim, delim); err != nil {
			return nil, err
		}
	}

	personal := ns.Personal
	if len(personal) == 0 {
		personal = []types.Namespace{{Delim: ns.Delim()}}
	}
	for _, space := range personal {
		if err := listChildren(space.Root(), space.Delim); err != nil {
			return nil, err
		}
	}

	for _, space := range slices.Concat(ns.Other, ns.Shared) {
		if space.Prefix == "" {
			continue
		}
		if err := listChildren(space.Root(), space.Delim); err != nil {
			return nil, err
		}
	}

	return allMailboxes, nil
}

func matchesAnyFolderName(name types.FolderName, candidates []types.FolderName) bool {
	return slices.ContainsFunc(candidates, func(candidate types.FolderName) bool {
		return strings.EqualFold(string(name), string(candidate))
	})
}

// apply any matching SPECIAL-USE folders on the FolderSettings object
func setFolderForMailbox(ctx context.Context, folders *types.FolderSettings, root string, mailbox *imap.ListData) {
	log := zerolog.Ctx(ctx)

	fullName := types.FolderName(mailbox.Mailbox)
	if fullName.IsInbox() {
		fullName = "INBOX"
	}
	mboxName := types.FolderName(strings.TrimPrefix(mailbox.Mailbox, root))

	var changed bool
	for _, special := range types.SpecialFolders {
		folder := special.Field(folders)
		switch {
		// The SPECIAL-USE attrs so warn log + override any current setting
		case hasAnyAttr(mailbox, special.Attrs):
			if *folder != "" && *folder != fullName {
				log.Warn().
					Str("alias", string(special.Alias)).
					Str("folder_current", string(*folder)).
					Str("folder_new", string(fullName)).
					Msg("Different special folder")
			}
		// string matching fallback for servers w/o SPECIAL-USE
		case *folder == "" && matchesAnyFolderName(mboxName, special.Popular):
		default:
			continue
		}
		*folder = fullName
		changed = true
	}

	if changed {
		log.Info().Any("settings", folders).Msg("Updated folder settings")
	}
}

func hasAnyAttr(mailbox *imap.ListData, attrs []imap.MailboxAttr) bool {
	return slices.ContainsFunc(attrs, func(attr imap.MailboxAttr) bool {
		return slices.Contains(mailbox.Attrs, attr)
	})
}
