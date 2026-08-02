package emails

import (
	"context"
	"errors"

	"github.com/emersion/go-imap/v2"
	"github.com/rs/zerolog"

	"github.com/oxygem/kanmail/internal/emails/imapinterface"
	"github.com/oxygem/kanmail/internal/types"
	"github.com/oxygem/kanmail/internal/util"
)

var errMailboxMissing = errors.New("mailbox does not exist")

// isMissingMailboxCode reports a definitive "that mailbox isn't there" response:
// NONEXISTENT (SELECT, RFC 5530) or TRYCREATE (APPEND/COPY/MOVE, RFC 9051).
func isMissingMailboxCode(err error) bool {
	var imapErr *imap.Error
	if !errors.As(err, &imapErr) {
		return false
	}
	return imapErr.Code == imap.ResponseCodeNonExistent || imapErr.Code == imap.ResponseCodeTryCreate
}

func isMissingMailboxErr(err error) bool {
	return errors.Is(err, errMailboxMissing) || isMissingMailboxCode(err)
}

// isNoStatusErr reports any NO status response. On its own this is ambiguous:
// servers that don't send response codes use it for missing mailboxes and for
// transient failures alike.
func isNoStatusErr(err error) bool {
	var imapErr *imap.Error
	if !errors.As(err, &imapErr) {
		return false
	}
	return imapErr.Type == imap.StatusResponseTypeNo
}

// folderExists checks a mailbox is present on the server. Matches by exact name
// because the pattern isn't escaped (and any wildcards in it would over-match).
func folderExists(conn imapinterface.IMAPClient, name types.FolderName) (bool, error) {
	mailboxes, err := conn.List("", string(name), &imap.ListOptions{}).Collect()
	if err != nil {
		return false, err
	}
	for _, mailbox := range mailboxes {
		if mailbox.Mailbox == string(name) {
			return true, nil
		}
	}
	return false, nil
}

// mailboxMissing decides whether a failed command means the mailbox isn't there:
// either the server said so with a response code, or it returned a bare NO
// (plenty of servers send no code at all) and LIST confirms it's absent.
func mailboxMissing(
	ctx context.Context,
	conn imapinterface.IMAPClient,
	name types.FolderName,
	err error,
) bool {
	if isMissingMailboxCode(err) {
		return true
	}
	if !isNoStatusErr(err) || util.IsRetryableIMAPError(err) {
		// A transient NO says nothing about whether the mailbox is there, so
		// leave it to the caller's retry rather than burning a LIST on it.
		return false
	}

	exists, listErr := folderExists(conn, name)
	if listErr != nil {
		zerolog.Ctx(ctx).Err(listErr).
			Str("folder", string(name)).
			Msg("Failed to list folder")
		return false
	}
	return !exists
}

// selectFolder selects a mailbox, reporting missing when it isn't on the server.
// Any other failure is returned as an error.
func selectFolder(
	ctx context.Context,
	conn imapinterface.IMAPClient,
	name types.FolderName,
) (*imap.SelectData, bool, error) {
	data, err := conn.Select(string(name), nil).Wait()
	if err == nil {
		return data, false, nil
	}
	if mailboxMissing(ctx, conn, name, err) {
		return nil, true, nil
	}
	return nil, false, err
}
