package services

import (
	"context"
	"errors"
	"fmt"
	"mime"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/emersion/go-imap/v2"
	"github.com/rs/zerolog"

	"github.com/oxygem/kanmail/internal/emails"
	"github.com/oxygem/kanmail/internal/emails/oauth"
	"github.com/oxygem/kanmail/internal/types"
	"github.com/oxygem/kanmail/internal/util"
)

var ErrNoAccount = errors.New("no account found")

type EmailsService struct {
	log      zerolog.Logger
	app      *AppService
	accounts *AccountsService
}

func NewEmailsService(log zerolog.Logger, accounts *AccountsService, app *AppService) *EmailsService {
	return &EmailsService{
		log:      log.With().Str("component", "emails").Logger(),
		accounts: accounts,
		app:      app,
	}
}

func (e *EmailsService) ClearOAuthAccessTokens(ctx context.Context) {
	oauth.ClearOAuthAccessTokens()
}

func (e *EmailsService) CloseAccountConnections(
	ctx context.Context,
	accountID types.AccountID,
) error {
	ctx = e.log.With().Str("method", "CloseAccountConnections").Logger().WithContext(ctx)
	defer util.LogAndPanic(ctx)

	account := e.accounts.GetOrCreateAccount(ctx, accountID)
	if account == nil {
		return fmt.Errorf("%w: %s", ErrNoAccount, accountID)
	}

	account.CloseConnections(ctx)
	return nil
}

func (e *EmailsService) CreateSendAttachments(ctx context.Context) ([]emails.SendAttachment, error) {
	ctx = e.log.With().Str("method", "CreateSendAttachments").Logger().WithContext(ctx)
	defer util.LogAndPanic(ctx)

	paths, err := e.app.OpenOpenFilesDialog()
	if err != nil {
		return nil, err
	}
	attachments := make([]emails.SendAttachment, len(paths))

	for i, path := range paths {
		f, err := os.Stat(path)
		if err != nil {
			return nil, fmt.Errorf("failed to stat file: %s: %w", path, err)
		} else if f.IsDir() {
			return nil, fmt.Errorf("file is directory: %s", path)
		}
		attachments[i] = emails.SendAttachment{
			Path:        path,
			Filename:    filepath.Base(path),
			ContentType: mime.TypeByExtension(filepath.Ext(path)),
		}
	}

	return attachments, nil
}

func (e *EmailsService) SendEmail(
	ctx context.Context,
	accountID types.AccountID,
	options emails.SendOptions,
) (*types.Email, error) {
	ctx = e.log.With().Str("method", "SendEmail").Logger().WithContext(ctx)
	defer util.LogAndPanic(ctx)

	account := e.accounts.GetOrCreateAccount(ctx, accountID)
	if account == nil {
		return nil, fmt.Errorf("%w: %s", ErrNoAccount, accountID)
	}

	email, err := account.SendEmail(ctx, options)
	return email, types.WrapAccountError(accountID, err)
}

func (e *EmailsService) GetAccountFolderNames(
	ctx context.Context,
	accountID types.AccountID,
) ([]types.FolderName, error) {
	ctx = e.log.With().Str("method", "GetFolderNames").Logger().WithContext(ctx)
	defer util.LogAndPanic(ctx)

	account := e.accounts.GetOrCreateAccount(ctx, accountID)
	if account == nil {
		return nil, fmt.Errorf("%w: %s", ErrNoAccount, accountID)
	}

	names, err := account.FetchFolderNames(ctx)
	return names, types.WrapAccountError(accountID, err)
}

// Account search
//

func (e *EmailsService) FindAccountMessageIDs(
	ctx context.Context,
	accountID types.AccountID,
	messageIDs []string,
) ([]*types.Email, error) {
	ctx = e.log.With().
		Str("accountID", string(accountID)).
		Str("method", "FindMessageIDs").
		Logger().
		WithContext(ctx)
	defer util.LogAndPanic(ctx)

	account := e.accounts.GetOrCreateAccount(ctx, accountID)
	if account == nil {
		return nil, fmt.Errorf("%w: %s", ErrNoAccount, accountID)
	}

	emails, err := account.FindMessageIDs(ctx, messageIDs)
	return emails, types.WrapAccountError(accountID, err)
}

func (e *EmailsService) SearchAccountReferences(
	ctx context.Context,
	accountID types.AccountID,
	references []emails.EmailRef,
) ([]*types.Email, error) {
	ctx = e.log.With().
		Str("accountID", string(accountID)).
		Str("method", "SearchReferences").
		Logger().
		WithContext(ctx)
	defer util.LogAndPanic(ctx)

	account := e.accounts.GetOrCreateAccount(ctx, accountID)
	if account == nil {
		return nil, fmt.Errorf("%w: %s", ErrNoAccount, accountID)
	}

	emails, err := account.SearchReferences(ctx, references)
	return emails, types.WrapAccountError(accountID, err)
}

// Folder search

func (e *EmailsService) SearchAccountFolderEmails(
	ctx context.Context,
	accountID types.AccountID,
	folderName types.FolderName,
	search string,
) ([]*types.Email, error) {
	ctx = e.log.With().
		Str("accountID", string(accountID)).
		Str("method", "SearchAccountFolderEmails").
		Logger().
		WithContext(ctx)
	defer util.LogAndPanic(ctx)

	account := e.accounts.GetOrCreateAccount(ctx, accountID)
	if account == nil {
		return nil, fmt.Errorf("%w: %s", ErrNoAccount, accountID)
	}

	folder := account.GetFolder(folderName)
	emails, err := folder.SearchEmails(ctx, search, 100)
	return emails, types.WrapAccountError(accountID, err)
}

func (e *EmailsService) SearchCachedAccountFolderEmails(
	ctx context.Context,
	accountID types.AccountID,
	folderName types.FolderName,
	search string,
) ([]*types.Email, error) {
	ctx = e.log.With().
		Str("accountID", string(accountID)).
		Str("method", "SearchCachedAccountFolderEmails").
		Logger().
		WithContext(ctx)
	defer util.LogAndPanic(ctx)

	account := e.accounts.GetOrCreateAccount(ctx, accountID)
	if account == nil {
		return nil, fmt.Errorf("%w: %s", ErrNoAccount, accountID)
	}

	folder := account.GetFolder(folderName)
	emails, err := folder.SearchCachedEmails(ctx, search, 100)
	return emails, types.WrapAccountError(accountID, err)
}

// Folder sync, pagination & get
//

func (e *EmailsService) SyncAccountFolderEmails(
	ctx context.Context,
	accountID types.AccountID,
	folderName types.FolderName,
) (*emails.SyncResp, error) {
	ctx = e.log.With().
		Str("accountID", string(accountID)).
		Str("folder", string(folderName)).
		Str("method", "SyncAccountFolderEmails").
		Logger().
		WithContext(ctx)
	defer util.LogAndPanic(ctx)

	account := e.accounts.GetOrCreateAccount(ctx, accountID)
	if account == nil {
		return nil, fmt.Errorf("%w: %s", ErrNoAccount, accountID)
	}

	folder := account.GetFolder(folderName)
	data, err := folder.SyncEmails(ctx)
	return data, types.WrapFolderError(accountID, folderName, err)
}

// Get (paginate) more emails for this account folder
func (e *EmailsService) GetAccountFolderEmails(
	ctx context.Context,
	accountID types.AccountID,
	folderName types.FolderName,
	options emails.PaginateOptions,
) (*emails.PaginateResp, error) {
	ctx = e.log.With().
		Str("accountID", string(accountID)).
		Str("folder", string(folderName)).
		Str("method", "GetAccountFolderEmails").
		Int("batch_size", options.BatchSize).
		Bool("reset", options.Reset).
		Logger().
		WithContext(ctx)
	defer util.LogAndPanic(ctx)

	account := e.accounts.GetOrCreateAccount(ctx, accountID)
	if account == nil {
		return nil, fmt.Errorf("%w: %s", ErrNoAccount, accountID)
	}

	folder := account.GetFolder(folderName)
	data, err := folder.PaginateEmails(ctx, options)
	return data, types.WrapFolderError(accountID, folderName, err)
}

func (e *EmailsService) OneClickAccountFolderEmailUnsubscribe(
	ctx context.Context,
	accountID types.AccountID,
	folderName types.FolderName,
	uid imap.UID,
) error {
	ctx = e.log.With().
		Str("accountID", string(accountID)).
		Str("folder", string(folderName)).
		Str("method", "OneClickAccountFolderEmailUnsubscribe").
		Uint32("uid", uint32(uid)).
		Logger().
		WithContext(ctx)
	defer util.LogAndPanic(ctx)

	account := e.accounts.GetOrCreateAccount(ctx, accountID)
	if account == nil {
		return fmt.Errorf("%w: %s", ErrNoAccount, accountID)
	}

	folder := account.GetFolder(folderName)
	email, err := folder.FetchEmail(ctx, uid)
	if err != nil {
		return types.WrapFolderError(accountID, folderName, err)
	}

	if !email.ListUnsubscribeOneclick || email.ListUnsubscribeURL == "" {
		return types.WrapFolderError(accountID, folderName, fmt.Errorf("email does not support one click unsubscribe"))
	}

	zerolog.Ctx(ctx).Info().
		Str("list_unsubscribe_url", email.ListUnsubscribeURL).
		Msg("Senting unsubscribe POST")

	// See RFC 8058
	resp, err := externalHTTPClient.Post(
		email.ListUnsubscribeURL,
		"application/x-www-form-urlencoded",
		strings.NewReader("List-Unsubscribe=One-Click"),
	)
	if err != nil {
		return types.WrapFolderError(accountID, folderName, fmt.Errorf("failed to make unsubscribe POST: %w", err))
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		return types.WrapFolderError(accountID, folderName, fmt.Errorf("invalid status from unsubscribe POST: %d", resp.StatusCode))
	}

	return nil
}

func (e *EmailsService) GetAccountFolderEmailAndContent(
	ctx context.Context,
	accountID types.AccountID,
	folderName types.FolderName,
	uid imap.UID,
) (*types.Email, *emails.BodyPartResp, error) {
	ctx = e.log.With().
		Str("accountID", string(accountID)).
		Str("folder", string(folderName)).
		Str("method", "GetAccountFolderEmailAndContent").
		Uint32("uid", uint32(uid)).
		Logger().
		WithContext(ctx)
	defer util.LogAndPanic(ctx)

	account := e.accounts.GetOrCreateAccount(ctx, accountID)
	if account == nil {
		return nil, nil, fmt.Errorf("%w: %s", ErrNoAccount, accountID)
	}

	folder := account.GetFolder(folderName)
	email, data, err := folder.FetchEmailAndContent(ctx, uid)
	return email, data, types.WrapFolderError(accountID, folderName, err)
}

func (e *EmailsService) GetAccountFolderEmailsContentParts(
	ctx context.Context,
	accountID types.AccountID,
	folderName types.FolderName,
	parts emails.FetchPartsMap,
) (emails.FetchPartsResp, error) {
	ctx = e.log.With().
		Str("accountID", string(accountID)).
		Str("folder", string(folderName)).
		Str("method", "GetAccountFolderEmailsContentParts").
		Int("parts", len(parts)).
		Logger().
		WithContext(ctx)
	defer util.LogAndPanic(ctx)

	account := e.accounts.GetOrCreateAccount(ctx, accountID)
	if account == nil {
		return nil, fmt.Errorf("%w: %s", ErrNoAccount, accountID)
	}

	folder := account.GetFolder(folderName)
	data, err := folder.FetchEmailContentParts(ctx, parts)
	return data, types.WrapFolderError(accountID, folderName, err)
}

func (e *EmailsService) DownloadAccountFolderEmailPartData(
	ctx context.Context,
	accountID types.AccountID,
	folderName types.FolderName,
	uid imap.UID,
	part types.BodyPart,
) (string, error) {
	ctx = e.log.With().
		Str("accountID", string(accountID)).
		Str("folder", string(folderName)).
		Str("method", "DownloadAccountFolderEmailPartData").
		Logger().
		WithContext(ctx)
	defer util.LogAndPanic(ctx)

	account := e.accounts.GetOrCreateAccount(ctx, accountID)
	if account == nil {
		return "", fmt.Errorf("%w: %s", ErrNoAccount, accountID)
	}

	path, err := e.app.OpenSaveFileDialog(part)
	if err != nil || path == "" {
		return path, types.WrapFolderError(accountID, folderName, err)
	}

	folder := account.GetFolder(folderName)
	parts := emails.FetchPartsMap{uid: part}

	partData, err := folder.FetchEmailPartData(ctx, parts)
	if err != nil {
		return "", types.WrapFolderError(accountID, folderName, err)
	} else if len(partData) == 0 {
		return "", types.WrapFolderError(accountID, folderName, errors.New("part not found"))
	}

	data := partData[uid].Bytes
	err = os.WriteFile(path, data, os.ModePerm)
	return path, types.WrapFolderError(accountID, folderName, err)
}

// Download attachment parts of an email to temp files so they can be included
// as send attachments when forwarding. Each part gets its own directory as the
// on-disk filename becomes the attachment filename when sending.
func (e *EmailsService) CreateForwardAttachments(
	ctx context.Context,
	accountID types.AccountID,
	folderName types.FolderName,
	uid imap.UID,
	parts []types.BodyPart,
) ([]emails.SendAttachment, error) {
	ctx = e.log.With().
		Str("accountID", string(accountID)).
		Str("folder", string(folderName)).
		Str("method", "CreateForwardAttachments").
		Int("parts", len(parts)).
		Logger().
		WithContext(ctx)
	defer util.LogAndPanic(ctx)

	account := e.accounts.GetOrCreateAccount(ctx, accountID)
	if account == nil {
		return nil, fmt.Errorf("%w: %s", ErrNoAccount, accountID)
	}

	folder := account.GetFolder(folderName)

	dir, err := os.MkdirTemp("", "kanmail-forward-")
	if err != nil {
		return nil, err
	}

	attachments := make([]emails.SendAttachment, 0, len(parts))
	for i, part := range parts {
		partData, err := folder.FetchEmailPartData(ctx, emails.FetchPartsMap{uid: part})
		if err != nil {
			return nil, types.WrapFolderError(accountID, folderName, err)
		} else if len(partData) == 0 {
			return nil, types.WrapFolderError(accountID, folderName, errors.New("part not found"))
		}

		filename := filepath.Base(part.Description)
		if filename == "" || filename == "." {
			filename = fmt.Sprintf("attachment-%s", part.PartStr)
		}

		partDir := filepath.Join(dir, strconv.Itoa(i))
		if err := os.MkdirAll(partDir, os.ModePerm); err != nil {
			return nil, err
		}

		path := filepath.Join(partDir, filename)
		if err := os.WriteFile(path, partData[uid].Bytes, os.ModePerm); err != nil {
			return nil, err
		}

		attachments = append(attachments, emails.SendAttachment{
			Path:        path,
			Filename:    filename,
			ContentType: part.Type,
		})
	}

	return attachments, nil
}

// Folder batch / UID commands
//

func (e *EmailsService) DeleteAccountFolderEmails(
	ctx context.Context,
	accountID types.AccountID,
	folderName types.FolderName,
	uids []imap.UID,
) error {
	ctx = e.log.With().
		Str("accountID", string(accountID)).
		Str("folder", string(folderName)).
		Int("uids", len(uids)).
		Str("method", "DeleteAccountFolderEmails").
		Logger().
		WithContext(ctx)
	defer util.LogAndPanic(ctx)

	account := e.accounts.GetOrCreateAccount(ctx, accountID)
	if account == nil {
		return fmt.Errorf("%w: %s", ErrNoAccount, accountID)
	}

	err := account.GetFolder(folderName).DeleteEmails(ctx, uids)
	return types.WrapFolderError(accountID, folderName, err)
}

func (e *EmailsService) MoveAccountFolderEmails(
	ctx context.Context,
	accountID types.AccountID,
	oldFolder, newFolder types.FolderName,
	uids []imap.UID,
) error {
	ctx = e.log.With().
		Str("accountID", string(accountID)).
		Str("old_folder", string(oldFolder)).
		Str("new_folder", string(newFolder)).
		Int("uids", len(uids)).
		Str("method", "MoveAccountFolderEmails").
		Logger().
		WithContext(ctx)
	defer util.LogAndPanic(ctx)

	account := e.accounts.GetOrCreateAccount(ctx, accountID)
	if account == nil {
		return fmt.Errorf("%w: %s", ErrNoAccount, accountID)
	}

	err := account.GetFolder(oldFolder).MoveEmails(ctx, newFolder, uids)
	return types.WrapFolderError(accountID, oldFolder, err)
}

func (e *EmailsService) CopyAccountFolderEmails(
	ctx context.Context,
	accountID types.AccountID,
	oldFolder, newFolder types.FolderName,
	uids []imap.UID,
) error {
	ctx = e.log.With().
		Str("accountID", string(accountID)).
		Str("old_folder", string(oldFolder)).
		Str("new_folder", string(newFolder)).
		Int("uids", len(uids)).
		Str("method", "CopyAccountFolderEmails").
		Logger().
		WithContext(ctx)
	defer util.LogAndPanic(ctx)

	account := e.accounts.GetOrCreateAccount(ctx, accountID)
	if account == nil {
		return fmt.Errorf("%w: %s", ErrNoAccount, accountID)
	}

	err := account.GetFolder(oldFolder).CopyEmails(ctx, newFolder, uids)
	return types.WrapFolderError(accountID, oldFolder, err)
}

func (e *EmailsService) FlagAccountFolderEmails(
	ctx context.Context,
	accountID types.AccountID,
	folderName types.FolderName,
	uids []imap.UID,
) error {
	ctx = e.log.With().
		Str("accountID", string(accountID)).
		Str("folder", string(folderName)).
		Int("uids", len(uids)).
		Str("method", "FlagAccountFolderEmails").
		Logger().
		WithContext(ctx)
	defer util.LogAndPanic(ctx)

	account := e.accounts.GetOrCreateAccount(ctx, accountID)
	if account == nil {
		return fmt.Errorf("%w: %s", ErrNoAccount, accountID)
	}

	err := account.GetFolder(folderName).FlagEmails(ctx, uids)
	return types.WrapFolderError(accountID, folderName, err)
}

func (e *EmailsService) UnflagAccountFolderEmails(
	ctx context.Context,
	accountID types.AccountID,
	folderName types.FolderName,
	uids []imap.UID,
) error {
	ctx = e.log.With().
		Str("accountID", string(accountID)).
		Str("folder", string(folderName)).
		Int("uids", len(uids)).
		Str("method", "UnflagAccountFolderEmails").
		Logger().
		WithContext(ctx)
	defer util.LogAndPanic(ctx)

	account := e.accounts.GetOrCreateAccount(ctx, accountID)
	if account == nil {
		return fmt.Errorf("%w: %s", ErrNoAccount, accountID)
	}

	err := account.GetFolder(folderName).UnflagEmails(ctx, uids)
	return types.WrapFolderError(accountID, folderName, err)
}
