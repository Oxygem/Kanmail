package caches

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/gob"
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"

	"github.com/emersion/go-imap/v2"

	"github.com/oxygem/kanmail/internal/types"
)

type FolderEmailCache struct {
	db       *sql.DB
	disabled bool

	stmtStore,
	stmtUpsert,
	stmtGet,
	stmtDelete,
	stmtDeleteByFolder,
	stmtDeleteAccount,
	stmtGetAccountLookup,
	stmtSetAccountLookup,
	stmtSetAccountReference,
	stmtDeleteAccountLookups,
	stmtDeleteAccountReferences,
	stmtStoreAttachment,
	stmtStoreSearch *sql.Stmt
}

// EmailSearchColumns are the denormalized folder_email_search values used by
// local-first search. Text fields are lowercased.
type EmailSearchColumns struct {
	Subject, FromAddrs, ToAddrs, CCAddrs, Excerpt string
	DateUnix                                      int64
	Seen, Flagged                                 bool
}

func makeAddressesString(addressLists ...[]types.Address) string {
	var parts []string
	for _, addrs := range addressLists {
		for _, addr := range addrs {
			if addr.Name != "" {
				parts = append(parts, addr.Name)
			}
			if addr.Email != "" {
				parts = append(parts, addr.Email)
			}
		}
	}
	return strings.ToLower(strings.Join(parts, " "))
}

func MakeEmailSearchColumns(email *types.Email) EmailSearchColumns {
	return EmailSearchColumns{
		Subject:   strings.ToLower(email.Subject),
		FromAddrs: makeAddressesString(email.From, email.Sender),
		ToAddrs:   makeAddressesString(email.To),
		CCAddrs:   makeAddressesString(email.CC, email.BCC),
		Excerpt:   strings.ToLower(email.Excerpt),
		DateUnix:  email.Date.Unix(),
		Seen:      slices.Contains(email.Flags, imap.FlagSeen),
		Flagged:   slices.Contains(email.Flags, imap.FlagFlagged),
	}
}

func NewFolderEmailCache(db *sql.DB) (*FolderEmailCache, error) {
	// Prepare statements
	stmtStore, err := db.Prepare(`
		INSERT INTO folder_emails (account_id, folder_name, uid, message_id, data)
		VALUES (?, ?, ?, ?, ?)`)
	if err != nil {
		return nil, fmt.Errorf("failed to prepare store statement: %w", err)
	}

	stmtUpsert, err := db.Prepare(`
		INSERT INTO folder_emails (account_id, folder_name, uid, message_id, data)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT (account_id, folder_name, uid)
		DO UPDATE SET message_id = excluded.message_id, data = excluded.data`)
	if err != nil {
		return nil, fmt.Errorf("failed to prepare store statement: %w", err)
	}

	stmtGet, err := db.Prepare(`
		SELECT data FROM folder_emails
		WHERE account_id = ? AND folder_name = ? AND uid = ?`)
	if err != nil {
		return nil, fmt.Errorf("failed to prepare get statement: %w", err)
	}

	stmtDelete, err := db.Prepare(`
		DELETE FROM folder_emails
		WHERE account_id = ? AND folder_name = ? AND uid = ?`)
	if err != nil {
		return nil, fmt.Errorf("failed to prepare deleteByUID statement: %w", err)
	}

	stmtDeleteByFolder, err := db.Prepare(`
		DELETE FROM folder_emails
		WHERE account_id = ? AND folder_name = ?`)
	if err != nil {
		return nil, fmt.Errorf("failed to prepare deleteByFolder statement: %w", err)
	}

	stmtDeleteAccount, err := db.Prepare(`
		DELETE FROM folder_emails
		WHERE account_id = ?`)
	if err != nil {
		return nil, fmt.Errorf("failed to prepare deleteAccount statement: %w", err)
	}

	stmtGetAccountLookup, err := db.Prepare(`
		SELECT lookup_at
		FROM account_lookups
		WHERE account_id = ? AND lookup_key = ?`)
	if err != nil {
		return nil, fmt.Errorf("failed to prepare getMessage statement: %w", err)
	}

	stmtSetAccountLookup, err := db.Prepare(`
		INSERT OR REPLACE INTO account_lookups (account_id, lookup_key, lookup_at)
		VALUES (?, ?, ?)`)
	if err != nil {
		return nil, fmt.Errorf("failed to prepare getMessage statement: %w", err)
	}

	stmtDeleteAccountLookups, err := db.Prepare(`
		DELETE FROM account_lookups
		WHERE account_id = ?`)
	if err != nil {
		return nil, fmt.Errorf("failed to prepare deleteAccountLookups statement: %w", err)
	}

	stmtSetAccountReference, err := db.Prepare(`
		INSERT OR REPLACE INTO account_references (account_id, to_message_id, from_message_id)
		VALUES (?, ?, ?)`)
	if err != nil {
		return nil, fmt.Errorf("failed to prepare setAccountReference statement: %w", err)
	}

	stmtDeleteAccountReferences, err := db.Prepare(`
		DELETE FROM account_references
		WHERE account_id = ?`)
	if err != nil {
		return nil, fmt.Errorf("failed to prepare deleteAccountReferences statement: %w", err)
	}

	stmtStoreAttachment, err := db.Prepare(`
		INSERT OR IGNORE INTO folder_email_attachments
			(account_id, folder_name, uid, part_id,
			 content_type, filename, size, content_id)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		return nil, fmt.Errorf("failed to prepare storeAttachment statement: %w", err)
	}

	stmtStoreSearch, err := db.Prepare(`
		REPLACE INTO folder_email_search
			(account_id, folder_name, uid,
			 subject, from_addrs, to_addrs, cc_addrs, excerpt, date_unix, seen, flagged)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		return nil, fmt.Errorf("failed to prepare storeSearch statement: %w", err)
	}

	return &FolderEmailCache{
		db:                          db,
		stmtStore:                   stmtStore,
		stmtUpsert:                  stmtUpsert,
		stmtGet:                     stmtGet,
		stmtDelete:                  stmtDelete,
		stmtDeleteByFolder:          stmtDeleteByFolder,
		stmtDeleteAccount:           stmtDeleteAccount,
		stmtGetAccountLookup:        stmtGetAccountLookup,
		stmtSetAccountLookup:        stmtSetAccountLookup,
		stmtSetAccountReference:     stmtSetAccountReference,
		stmtDeleteAccountLookups:    stmtDeleteAccountLookups,
		stmtDeleteAccountReferences: stmtDeleteAccountReferences,
		stmtStoreAttachment:         stmtStoreAttachment,
		stmtStoreSearch:             stmtStoreSearch,
	}, nil
}

func execStoreSearch(ctx context.Context, stmt *sql.Stmt, email *types.Email) error {
	search := MakeEmailSearchColumns(email)
	if _, err := stmt.ExecContext(
		ctx,
		email.AccountID,
		email.FolderName,
		email.UID,
		search.Subject,
		search.FromAddrs,
		search.ToAddrs,
		search.CCAddrs,
		search.Excerpt,
		search.DateUnix,
		search.Seen,
		search.Flagged,
	); err != nil {
		return fmt.Errorf("failed to store email search row: %w", err)
	}
	return nil
}

func (c *FolderEmailCache) Store(ctx context.Context, email *types.Email) error {
	if c.disabled {
		return nil
	}
	var data bytes.Buffer
	if err := gob.NewEncoder(&data).Encode(email); err != nil {
		return fmt.Errorf("failed to marshal email: %w", err)
	}

	tx, err := c.db.Begin()
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	stmtStore := tx.Stmt(c.stmtStore)
	defer stmtStore.Close()
	stmtSetAccountRef := tx.Stmt(c.stmtSetAccountReference)
	defer stmtSetAccountRef.Close()
	stmtStoreAttachment := tx.Stmt(c.stmtStoreAttachment)
	defer stmtStoreAttachment.Close()
	stmtStoreSearch := tx.Stmt(c.stmtStoreSearch)
	defer stmtStoreSearch.Close()

	if _, err := stmtStore.ExecContext(
		ctx,
		email.AccountID,
		email.FolderName,
		email.UID,
		email.MessageID,
		data.Bytes(),
	); err != nil {
		return fmt.Errorf(
			"failed to store email %s/%s/%d: %w",
			email.AccountID,
			email.FolderName,
			email.UID,
			err,
		)
	}

	for _, ref := range email.References {
		if _, err := stmtSetAccountRef.Exec(email.AccountID, ref, email.MessageID); err != nil {
			return fmt.Errorf("failed to set account reference: %w", err)
		}
	}

	for _, part := range email.Parts {
		if part.Description == "" {
			continue
		}
		if _, err := stmtStoreAttachment.ExecContext(
			ctx,
			email.AccountID,
			email.FolderName,
			email.UID,
			part.PartStr,
			part.Type,
			part.Description,
			part.Size,
			part.ContentID,
		); err != nil {
			return fmt.Errorf("failed to store attachment: %w", err)
		}
	}

	if err := execStoreSearch(ctx, stmtStoreSearch, email); err != nil {
		return err
	}

	return tx.Commit()
}

func (c *FolderEmailCache) Upsert(ctx context.Context, email *types.Email) error {
	if c.disabled {
		return nil
	}
	var data bytes.Buffer
	if err := gob.NewEncoder(&data).Encode(email); err != nil {
		return fmt.Errorf("failed to marshal email: %w", err)
	}

	tx, err := c.db.Begin()
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	stmtUpsert := tx.Stmt(c.stmtUpsert)
	defer stmtUpsert.Close()
	stmtStoreSearch := tx.Stmt(c.stmtStoreSearch)
	defer stmtStoreSearch.Close()

	if _, err := stmtUpsert.ExecContext(
		ctx,
		email.AccountID,
		email.FolderName,
		email.UID,
		email.MessageID,
		data.Bytes(),
	); err != nil {
		return fmt.Errorf(
			"failed to replace email %s/%s/%d: %w",
			email.AccountID,
			email.FolderName,
			email.UID,
			err,
		)
	}

	if err := execStoreSearch(ctx, stmtStoreSearch, email); err != nil {
		return err
	}

	return tx.Commit()
}

func (c *FolderEmailCache) Delete(
	ctx context.Context,
	accountID types.AccountID,
	folderName types.FolderName,
	uid imap.UID,
) error {
	if c.disabled {
		return nil
	}
	_, err := c.stmtDelete.ExecContext(ctx, accountID, folderName, uid)
	if err != nil {
		return fmt.Errorf("failed to delete email: %w", err)
	}
	return nil
}

func (c *FolderEmailCache) Get(
	ctx context.Context,
	accountID types.AccountID,
	folderName types.FolderName,
	uid imap.UID,
) (*types.Email, error) {
	if c.disabled {
		return nil, nil
	}

	var data []byte
	err := c.stmtGet.QueryRowContext(ctx, accountID, folderName, uid).Scan(&data)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	} else if err != nil {
		return nil, fmt.Errorf("failed to fetch email: %w", err)
	}

	var email types.Email
	if err := gob.NewDecoder(bytes.NewBuffer(data)).Decode(&email); err != nil {
		return nil, fmt.Errorf("failed to unmarshal email: %w", err)
	}

	return &email, nil
}

func (c *FolderEmailCache) GetByMessageIDs(
	ctx context.Context,
	accountID types.AccountID,
	messageIDs []string,
) (map[string][]*types.Email, error) {
	if c.disabled {
		return nil, nil
	}

	inSQL, args := makeInSQL(messageIDs)
	query := `
		SELECT message_id, data
		FROM folder_emails
		WHERE
			message_id IN(` + inSQL + `)
			AND account_id = ?`
	args = append(args, accountID)

	rows, err := c.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	results := make(map[string][]*types.Email, len(messageIDs))

	for rows.Next() {
		var messageID string
		var data []byte
		if err := rows.Scan(&messageID, &data); err != nil {
			return nil, err
		}
		var email types.Email
		if err := gob.NewDecoder(bytes.NewBuffer(data)).Decode(&email); err != nil {
			return nil, fmt.Errorf("failed to unmarshal email: %w", err)
		}
		results[messageID] = append(results[messageID], &email)
	}

	return results, rows.Err()
}

func (c *FolderEmailCache) SearchReferences(
	ctx context.Context,
	accountID types.AccountID,
	references []string,
) (map[string][]*types.Email, error) {
	if c.disabled {
		return nil, nil
	}

	inSQL, args := makeInSQL(references)
	query := `
		SELECT r.to_message_id, e.data FROM account_references AS r
		JOIN folder_emails AS e ON r.from_message_id = e.message_id
		WHERE
			r.to_message_id IN(` + inSQL + `)
			AND r.account_id = ?`
	args = append(args, accountID)

	rows, err := c.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	results := make(map[string][]*types.Email, len(references))

	for rows.Next() {
		var ref string
		var data []byte
		if err := rows.Scan(&ref, &data); err != nil {
			return nil, err
		}
		var email types.Email
		if err := gob.NewDecoder(bytes.NewBuffer(data)).Decode(&email); err != nil {
			return nil, fmt.Errorf("failed to unmarshal email: %w", err)
		}
		results[ref] = append(results[ref], &email)
	}

	return results, rows.Err()
}

func (c *FolderEmailCache) GetLastMessageIDLookupAt(
	ctx context.Context,
	accountID types.AccountID,
	messageID string,
) (time.Time, error) {
	var t time.Time
	lookupKey := "messageid:" + messageID
	err := c.stmtGetAccountLookup.QueryRowContext(ctx, accountID, lookupKey).Scan(&t)
	if errors.Is(err, sql.ErrNoRows) {
		return t, nil
	}
	return t, err
}

func (c *FolderEmailCache) SetLastMessageIDLookupNow(
	ctx context.Context,
	accountID types.AccountID,
	messageID string,
) error {
	lookupKey := "messageid:" + messageID
	_, err := c.stmtSetAccountLookup.ExecContext(ctx, accountID, lookupKey, time.Now().UTC())
	return err
}

func (c *FolderEmailCache) GetLastReferenceLookupAt(
	ctx context.Context,
	accountID types.AccountID,
	reference string,
) (time.Time, error) {
	var t time.Time
	lookupKey := "reference:" + reference
	err := c.stmtGetAccountLookup.QueryRowContext(ctx, accountID, lookupKey).Scan(&t)
	if errors.Is(err, sql.ErrNoRows) {
		return t, nil
	}
	return t, err
}

func (c *FolderEmailCache) SetLastReferenceLookupNow(
	ctx context.Context,
	accountID types.AccountID,
	reference string,
) error {
	lookupKey := "reference:" + reference
	_, err := c.stmtSetAccountLookup.ExecContext(ctx, accountID, lookupKey, time.Now().UTC())
	return err
}
