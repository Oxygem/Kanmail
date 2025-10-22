package services

import (
	"context"
	"errors"
	"fmt"
	"mime"
	"net/http"
	"os"
	"path/filepath"

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
	accountName types.AccountName,
) error {
	ctx = e.log.With().Str("method", "CloseAccountConnections").Logger().WithContext(ctx)
	defer util.LogPanic(ctx)

	account := e.accounts.GetOrCreateAccount(ctx, accountName)
	if account == nil {
		return fmt.Errorf("%w: %s", ErrNoAccount, accountName)
	}

	account.CloseConnections(ctx)
	return nil
}

func (e *EmailsService) CreateSendAttachments(ctx context.Context) ([]emails.SendAttachment, error) {
	ctx = e.log.With().Str("method", "CreateSendAttachments").Logger().WithContext(ctx)
	defer util.LogPanic(ctx)

	paths := e.app.OpenOpenFilesDialog()
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
	accountName types.AccountName,
	options emails.SendOptions,
) error {
	ctx = e.log.With().Str("method", "SendEmail").Logger().WithContext(ctx)
	defer util.LogPanic(ctx)

	if !e.app.CheckCachedLicense(ctx) {
		e.app.OpenPurchaseLicenseDialog(ctx)
	}

	account := e.accounts.GetOrCreateAccount(ctx, accountName)
	if account == nil {
		return fmt.Errorf("%w: %s", ErrNoAccount, accountName)
	}

	return types.WrapAccountError(accountName, account.SendEmail(ctx, options))
}

func (e *EmailsService) GetAccountFolderNames(
	ctx context.Context,
	accountName types.AccountName,
) ([]types.FolderName, error) {
	ctx = e.log.With().Str("method", "GetFolderNames").Logger().WithContext(ctx)
	defer util.LogPanic(ctx)

	account := e.accounts.GetOrCreateAccount(ctx, accountName)
	if account == nil {
		return nil, fmt.Errorf("%w: %s", ErrNoAccount, accountName)
	}

	names, err := account.FetchFolderNames(ctx)
	return names, types.WrapAccountError(accountName, err)
}

// Account search
//

func (e *EmailsService) FindAccountMessageIDs(
	ctx context.Context,
	accountName types.AccountName,
	messageIDs []string,
) ([]*types.Email, error) {
	ctx = e.log.With().
		Str("account", string(accountName)).
		Str("method", "FindMessageIDs").
		Logger().
		WithContext(ctx)
	defer util.LogPanic(ctx)

	account := e.accounts.GetOrCreateAccount(ctx, accountName)
	if account == nil {
		return nil, fmt.Errorf("%w: %s", ErrNoAccount, accountName)
	}

	emails, err := account.FindMessageIDs(ctx, messageIDs)
	return emails, types.WrapAccountError(accountName, err)
}

func (e *EmailsService) SearchAccountReferences(
	ctx context.Context,
	accountName types.AccountName,
	references []emails.EmailRef,
) ([]*types.Email, error) {
	ctx = e.log.With().
		Str("account", string(accountName)).
		Str("method", "SearchReferences").
		Logger().
		WithContext(ctx)
	defer util.LogPanic(ctx)

	account := e.accounts.GetOrCreateAccount(ctx, accountName)
	if account == nil {
		return nil, fmt.Errorf("%w: %s", ErrNoAccount, accountName)
	}

	emails, err := account.SearchReferences(ctx, references)
	return emails, types.WrapAccountError(accountName, err)
}

// Folder search

func (e *EmailsService) SearchAccountFolderEmails(
	ctx context.Context,
	accountName types.AccountName,
	folderName types.FolderName,
	search string,
) ([]*types.Email, error) {
	ctx = e.log.With().
		Str("account", string(accountName)).
		Str("method", "SearchAccountFolderEmails").
		Logger().
		WithContext(ctx)
	defer util.LogPanic(ctx)

	account := e.accounts.GetOrCreateAccount(ctx, accountName)
	if account == nil {
		return nil, fmt.Errorf("%w: %s", ErrNoAccount, accountName)
	}

	folder := account.GetFolder(folderName)
	emails, err := folder.SearchEmails(ctx, search, 100)
	return emails, types.WrapAccountError(accountName, err)
}

// Folder sync, pagination & get
//

func (e *EmailsService) SyncAccountFolderEmails(
	ctx context.Context,
	accountName types.AccountName,
	folderName types.FolderName,
) (*emails.SyncResp, error) {
	ctx = e.log.With().
		Str("account", string(accountName)).
		Str("folder", string(folderName)).
		Str("method", "SyncAccountFolderEmails").
		Logger().
		WithContext(ctx)
	defer util.LogPanic(ctx)

	account := e.accounts.GetOrCreateAccount(ctx, accountName)
	if account == nil {
		return nil, fmt.Errorf("%w: %s", ErrNoAccount, accountName)
	}

	folder := account.GetFolder(folderName)
	data, err := folder.SyncEmails(ctx)
	return data, types.WrapFolderError(accountName, folderName, err)
}

// Get (paginate) more emails for this account folder
func (e *EmailsService) GetAccountFolderEmails(
	ctx context.Context,
	accountName types.AccountName,
	folderName types.FolderName,
	options emails.PaginateOptions,
) (*emails.PaginateResp, error) {
	ctx = e.log.With().
		Str("account", string(accountName)).
		Str("folder", string(folderName)).
		Str("method", "GetAccountFolderEmails").
		Int("batch_size", options.BatchSize).
		Bool("reset", options.Reset).
		Logger().
		WithContext(ctx)
	defer util.LogPanic(ctx)

	account := e.accounts.GetOrCreateAccount(ctx, accountName)
	if account == nil {
		return nil, fmt.Errorf("%w: %s", ErrNoAccount, accountName)
	}

	folder := account.GetFolder(folderName)
	data, err := folder.PaginateEmails(ctx, options)
	return data, types.WrapFolderError(accountName, folderName, err)
}

func (e *EmailsService) OneClickAccountFolderEmailUnsubscribe(
	ctx context.Context,
	accountName types.AccountName,
	folderName types.FolderName,
	uid imap.UID,
) error {
	ctx = e.log.With().
		Str("account", string(accountName)).
		Str("folder", string(folderName)).
		Str("method", "OneClickAccountFolderEmailUnsubscribe").
		Uint32("uid", uint32(uid)).
		Logger().
		WithContext(ctx)
	defer util.LogPanic(ctx)

	account := e.accounts.GetOrCreateAccount(ctx, accountName)
	if account == nil {
		return fmt.Errorf("%w: %s", ErrNoAccount, accountName)
	}

	folder := account.GetFolder(folderName)
	email, err := folder.FetchEmail(ctx, uid)
	if err != nil {
		return err
	}

	if !email.ListUnsubscribeOneclick || email.ListUnsubscribeURL == "" {
		return fmt.Errorf("email does not support one click unsubscribe")
	}

	resp, err := http.Post(email.ListUnsubscribeURL, "", nil)
	if err != nil {
		return fmt.Errorf("failed to make unsubscribe POST: %w", err)
	} else if resp.StatusCode >= 300 {
		return fmt.Errorf("invalid status from unsubscribe POST: %d", resp.StatusCode)
	}

	return nil
}

func (e *EmailsService) GetAccountFolderEmailAndContent(
	ctx context.Context,
	accountName types.AccountName,
	folderName types.FolderName,
	uid imap.UID,
) (*types.Email, *emails.BodyPartResp, error) {
	ctx = e.log.With().
		Str("account", string(accountName)).
		Str("folder", string(folderName)).
		Str("method", "GetAccountFolderEmailAndContent").
		Uint32("uid", uint32(uid)).
		Logger().
		WithContext(ctx)
	defer util.LogPanic(ctx)

	account := e.accounts.GetOrCreateAccount(ctx, accountName)
	if account == nil {
		return nil, nil, fmt.Errorf("%w: %s", ErrNoAccount, accountName)
	}

	folder := account.GetFolder(folderName)
	email, data, err := folder.FetchEmailAndContent(ctx, uid)
	return email, data, types.WrapFolderError(accountName, folderName, err)
}

func (e *EmailsService) GetAccountFolderEmailsContentParts(
	ctx context.Context,
	accountName types.AccountName,
	folderName types.FolderName,
	parts emails.FetchPartsMap,
) (emails.FetchPartsResp, error) {
	ctx = e.log.With().
		Str("account", string(accountName)).
		Str("folder", string(folderName)).
		Str("method", "GetAccountFolderEmailsContentParts").
		Int("parts", len(parts)).
		Logger().
		WithContext(ctx)
	defer util.LogPanic(ctx)

	account := e.accounts.GetOrCreateAccount(ctx, accountName)
	if account == nil {
		return nil, fmt.Errorf("%w: %s", ErrNoAccount, accountName)
	}

	folder := account.GetFolder(folderName)
	data, err := folder.FetchEmailContentParts(ctx, parts)
	return data, types.WrapFolderError(accountName, folderName, err)
}

func (e *EmailsService) DownloadAccountFolderEmailPartData(
	ctx context.Context,
	accountName types.AccountName,
	folderName types.FolderName,
	uid imap.UID,
	part types.BodyPart,
) (string, error) {
	ctx = e.log.With().
		Str("account", string(accountName)).
		Str("folder", string(folderName)).
		Str("method", "DownloadAccountFolderEmailPartData").
		Logger().
		WithContext(ctx)
	defer util.LogPanic(ctx)

	account := e.accounts.GetOrCreateAccount(ctx, accountName)
	if account == nil {
		return "", fmt.Errorf("%w: %s", ErrNoAccount, accountName)
	}

	path := e.app.OpenSaveFileDialog(part)
	if path == "" {
		return "", nil
	}

	folder := account.GetFolder(folderName)
	parts := emails.FetchPartsMap{uid: part}

	partData, err := folder.FetchEmailPartData(ctx, parts)
	if err != nil {
		return "", err
	} else if len(partData) == 0 {
		return "", errors.New("part not found")
	}

	data := partData[uid].Bytes
	err = os.WriteFile(path, data, os.ModePerm)
	return path, types.WrapFolderError(accountName, folderName, err)
}

// Folder batch / UID commands
//

func (e *EmailsService) DeleteAccountFolderEmails(
	ctx context.Context,
	accountName types.AccountName,
	folderName types.FolderName,
	uids []imap.UID,
) error {
	ctx = e.log.With().
		Str("account", string(accountName)).
		Str("folder", string(folderName)).
		Int("uids", len(uids)).
		Str("method", "DeleteAccountFolderEmails").
		Logger().
		WithContext(ctx)
	defer util.LogPanic(ctx)

	account := e.accounts.GetOrCreateAccount(ctx, accountName)
	if account == nil {
		return fmt.Errorf("%w: %s", ErrNoAccount, accountName)
	}

	err := account.GetFolder(folderName).DeleteEmails(ctx, uids)
	return types.WrapFolderError(accountName, folderName, err)
}

func (e *EmailsService) MoveAccountFolderEmails(
	ctx context.Context,
	accountName types.AccountName,
	oldFolder, newFolder types.FolderName,
	uids []imap.UID,
) error {
	ctx = e.log.With().
		Str("account", string(accountName)).
		Str("old_folder", string(oldFolder)).
		Str("new_folder", string(newFolder)).
		Int("uids", len(uids)).
		Str("method", "MoveAccountFolderEmails").
		Logger().
		WithContext(ctx)
	defer util.LogPanic(ctx)

	account := e.accounts.GetOrCreateAccount(ctx, accountName)
	if account == nil {
		return fmt.Errorf("%w: %s", ErrNoAccount, accountName)
	}

	err := account.GetFolder(oldFolder).MoveEmails(ctx, newFolder, uids)
	return types.WrapFolderError(accountName, oldFolder, err)
}

func (e *EmailsService) CopyAccountFolderEmails(
	ctx context.Context,
	accountName types.AccountName,
	oldFolder, newFolder types.FolderName,
	uids []imap.UID,
) error {
	ctx = e.log.With().
		Str("account", string(accountName)).
		Str("old_folder", string(oldFolder)).
		Str("new_folder", string(newFolder)).
		Int("uids", len(uids)).
		Str("method", "CopyAccountFolderEmails").
		Logger().
		WithContext(ctx)
	defer util.LogPanic(ctx)

	account := e.accounts.GetOrCreateAccount(ctx, accountName)
	if account == nil {
		return fmt.Errorf("%w: %s", ErrNoAccount, accountName)
	}

	err := account.GetFolder(oldFolder).CopyEmails(ctx, newFolder, uids)
	return types.WrapFolderError(accountName, oldFolder, err)
}

func (e *EmailsService) FlagAccountFolderEmails(
	ctx context.Context,
	accountName types.AccountName,
	folderName types.FolderName,
	uids []imap.UID,
) error {
	ctx = e.log.With().
		Str("account", string(accountName)).
		Str("folder", string(folderName)).
		Int("uids", len(uids)).
		Str("method", "FlagAccountFolderEmails").
		Logger().
		WithContext(ctx)
	defer util.LogPanic(ctx)

	account := e.accounts.GetOrCreateAccount(ctx, accountName)
	if account == nil {
		return fmt.Errorf("%w: %s", ErrNoAccount, accountName)
	}

	err := account.GetFolder(folderName).FlagEmails(ctx, uids)
	return types.WrapFolderError(accountName, folderName, err)
}

func (e *EmailsService) UnflagAccountFolderEmails(
	ctx context.Context,
	accountName types.AccountName,
	folderName types.FolderName,
	uids []imap.UID,
) error {
	ctx = e.log.With().
		Str("account", string(accountName)).
		Str("folder", string(folderName)).
		Int("uids", len(uids)).
		Str("method", "UnflagAccountFolderEmails").
		Logger().
		WithContext(ctx)
	defer util.LogPanic(ctx)

	account := e.accounts.GetOrCreateAccount(ctx, accountName)
	if account == nil {
		return fmt.Errorf("%w: %s", ErrNoAccount, accountName)
	}

	err := account.GetFolder(folderName).UnflagEmails(ctx, uids)
	return types.WrapFolderError(accountName, folderName, err)
}
