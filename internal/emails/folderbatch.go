package emails

import (
	"context"
	"errors"

	"github.com/emersion/go-imap/v2"

	"github.com/oxygem/kanmail/internal/emails/imapinterface"
	"github.com/oxygem/kanmail/internal/types"
)

var errSameFolder = errors.New("source and destination are the same mailbox")

func (f *Folder) MoveEmails(ctx context.Context, otherFolderName types.FolderName, uids []imap.UID) error {
	// Translate any alias folder name -> real name
	otherFolder := f.account.GetFolder(otherFolderName)
	if otherFolder == f {
		return errSameFolder
	}

	return f.imap.WithFolderConnectionNoReplay(ctx, f.Name, func(conn imapinterface.IMAPClient) error {
		return f.createDestinationAndRetry(ctx, conn, otherFolder, func() error {
			return moveEmails(conn, imap.UIDSetNum(uids...), otherFolder.Name)
		})
	})
}

func moveEmails(conn imapinterface.IMAPClient, uids imap.UIDSet, dest types.FolderName) error {
	if conn.Caps().Has(imap.CapMove) {
		_, err := conn.Move(uids, string(dest)).Wait()
		return err
	}

	if _, err := conn.Copy(uids, string(dest)).Wait(); err != nil {
		return err
	}
	return deleteEmails(conn, uids)
}

func (f *Folder) CopyEmails(ctx context.Context, otherFolderName types.FolderName, uids []imap.UID) error {
	// Translate any alias folder name -> real name
	otherFolder := f.account.GetFolder(otherFolderName)
	if otherFolder == f {
		return errSameFolder
	}

	return f.imap.WithFolderConnectionNoReplay(ctx, f.Name, func(conn imapinterface.IMAPClient) error {
		return f.createDestinationAndRetry(ctx, conn, otherFolder, func() error {
			_, err := conn.Copy(imap.UIDSetNum(uids...), string(otherFolder.Name)).Wait()
			return err
		})
	})
}

func (f *Folder) DeleteEmails(ctx context.Context, uids []imap.UID) error {
	return f.imap.WithFolderConnection(ctx, f.Name, func(conn imapinterface.IMAPClient) error {
		return deleteEmails(conn, imap.UIDSetNum(uids...))
	})
}

func deleteEmails(conn imapinterface.IMAPClient, uids imap.UIDSet) error {
	storeFlags := imap.StoreFlags{
		Op:     imap.StoreFlagsAdd,
		Flags:  []imap.Flag{imap.FlagDeleted},
		Silent: true,
	}
	if _, err := conn.Store(uids, &storeFlags, nil).Collect(); err != nil {
		return err
	}

	// If supported, use UID EXPUNGE to delete only the target messages
	var expunge imapinterface.ExpungeCommand
	if conn.Caps().Has(imap.CapUIDPlus) {
		expunge = conn.UIDExpunge(uids)
	} else {
		expunge = conn.Expunge()
	}
	_, err := expunge.Collect()
	return err
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
