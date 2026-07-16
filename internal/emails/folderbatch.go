package emails

import (
	"context"

	"github.com/emersion/go-imap/v2"

	"github.com/oxygem/kanmail/internal/emails/imapinterface"
	"github.com/oxygem/kanmail/internal/types"
)

func (f *Folder) MoveEmails(ctx context.Context, otherFolderName types.FolderName, uids []imap.UID) error {
	// Translate any alias folder name -> real name, then initialize
	otherFolder := f.account.GetFolder(otherFolderName)
	otherFolderName = otherFolder.Name
	if err := otherFolder.EnsureInitialized(ctx); err != nil {
		return err
	}

	return f.imap.WithFolderConnection(ctx, f.Name, func(conn imapinterface.IMAPClient) error {
		_, err := conn.Move(imap.UIDSetNum(uids...), string(otherFolderName)).Wait()
		return err
	})
}

func (f *Folder) CopyEmails(ctx context.Context, otherFolderName types.FolderName, uids []imap.UID) error {
	// Translate any alias folder name -> real name, then initialize
	otherFolder := f.account.GetFolder(otherFolderName)
	otherFolderName = otherFolder.Name
	if err := otherFolder.EnsureInitialized(ctx); err != nil {
		return err
	}

	return f.imap.WithFolderConnection(ctx, f.Name, func(conn imapinterface.IMAPClient) error {
		_, err := conn.Copy(imap.UIDSetNum(uids...), string(otherFolderName)).Wait()
		return err
	})
}

func (f *Folder) DeleteEmails(ctx context.Context, uids []imap.UID) error {
	return f.imap.WithFolderConnection(ctx, f.Name, func(conn imapinterface.IMAPClient) error {
		uidSet := imap.UIDSetNum(uids...)
		storeFlags := imap.StoreFlags{
			Op:     imap.StoreFlagsAdd,
			Flags:  []imap.Flag{imap.FlagDeleted},
			Silent: true,
		}
		if _, err := conn.Store(uidSet, &storeFlags, nil).Collect(); err != nil {
			return err
		}

		// If supported, use UID EXPUNGE to delete only the target messages
		var expunge imapinterface.ExpungeCommand
		if conn.Caps().Has(imap.CapUIDPlus) {
			expunge = conn.UIDExpunge(uidSet)
		} else {
			expunge = conn.Expunge()
		}
		_, err := expunge.Collect()
		return err
	})
}

func (f *Folder) FlagEmails(ctx context.Context, uids []imap.UID) error {
	return f.imap.WithFolderConnection(ctx, f.Name, func(conn imapinterface.IMAPClient) error {
		storeFlags := imap.StoreFlags{
			Op:     imap.StoreFlagsAdd,
			Flags:  []imap.Flag{imap.FlagFlagged},
			Silent: true,
		}
		_, err := conn.Store(imap.UIDSetNum(uids...), &storeFlags, nil).Collect()
		return err
	})
}

func (f *Folder) UnflagEmails(ctx context.Context, uids []imap.UID) error {
	return f.imap.WithFolderConnection(ctx, f.Name, func(conn imapinterface.IMAPClient) error {
		storeFlags := imap.StoreFlags{
			Op:     imap.StoreFlagsDel,
			Flags:  []imap.Flag{imap.FlagFlagged},
			Silent: true,
		}
		_, err := conn.Store(imap.UIDSetNum(uids...), &storeFlags, nil).Collect()
		return err
	})
}
