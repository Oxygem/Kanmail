package emails

import (
	"context"

	"github.com/emersion/go-imap/v2"
	"github.com/rs/zerolog"

	"github.com/oxygem/kanmail/internal/emails/imapinterface"
	"github.com/oxygem/kanmail/internal/types"
)

func (f *Folder) MoveEmails(ctx context.Context, otherFolderName types.FolderName, uids []imap.UID) error {
	// Translate any alias folder name -> real name, then initialize
	otherFolder := f.account.GetFolder(otherFolderName)
	otherFolderName = otherFolder.Name
	otherFolder.EnsureInitialized(ctx)

	return f.imap.WithFolderConnection(ctx, f.Name, func(conn imapinterface.IMAPClient) error {
		d, err := conn.Move(imap.UIDSetNum(uids...), string(otherFolderName)).Wait()
		if err != nil {
			return err
		}
		zerolog.Ctx(ctx).Warn().Any("MOVER", d).Msg("Got move data")
		return nil
	})
}

func (f *Folder) CopyEmails(ctx context.Context, otherFolderName types.FolderName, uids []imap.UID) error {
	// Translate any alias folder name -> real name, then initialize
	otherFolder := f.account.GetFolder(otherFolderName)
	otherFolderName = otherFolder.Name
	otherFolder.EnsureInitialized(ctx)

	return f.imap.WithFolderConnection(ctx, f.Name, func(conn imapinterface.IMAPClient) error {
		d, err := conn.Copy(imap.UIDSetNum(uids...), string(otherFolderName)).Wait()
		if err != nil {
			return err
		}
		zerolog.Ctx(ctx).Warn().Any("COPYR", d).Msg("Got copy data")
		return nil
	})
}

func (f *Folder) DeleteEmails(ctx context.Context, uids []imap.UID) error {
	return f.imap.WithFolderConnection(ctx, f.Name, func(conn imapinterface.IMAPClient) error {
		storeFlags := imap.StoreFlags{
			Op:     imap.StoreFlagsAdd,
			Flags:  []imap.Flag{imap.FlagDeleted},
			Silent: true,
		}
		d, err := conn.Store(imap.UIDSetNum(uids...), &storeFlags, nil).Collect()
		if err != nil {
			return err
		}
		deletedUids, err := conn.Expunge().Collect()
		if err != nil {
			return err
		}
		zerolog.Ctx(ctx).Warn().Any("STORER", d).Any("deleteduids", deletedUids).Msg("Got delete data")
		return nil
	})
}

func (f *Folder) FlagEmails(ctx context.Context, uids []imap.UID) error {
	return f.imap.WithFolderConnection(ctx, f.Name, func(conn imapinterface.IMAPClient) error {
		storeFlags := imap.StoreFlags{
			Op:     imap.StoreFlagsAdd,
			Flags:  []imap.Flag{imap.FlagFlagged},
			Silent: true,
		}
		d, err := conn.Store(imap.UIDSetNum(uids...), &storeFlags, nil).Collect()
		if err != nil {
			return err
		}
		zerolog.Ctx(ctx).Warn().Any("STORER", d).Msg("Got store flag data")
		return nil
	})
}

func (f *Folder) UnflagEmails(ctx context.Context, uids []imap.UID) error {
	return f.imap.WithFolderConnection(ctx, f.Name, func(conn imapinterface.IMAPClient) error {
		storeFlags := imap.StoreFlags{
			Op:     imap.StoreFlagsDel,
			Flags:  []imap.Flag{imap.FlagFlagged},
			Silent: true,
		}
		d, err := conn.Store(imap.UIDSetNum(uids...), &storeFlags, nil).Collect()
		if err != nil {
			return err
		}
		zerolog.Ctx(ctx).Warn().Any("STORER", d).Msg("Got store unflag data")
		return nil
	})
}
