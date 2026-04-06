package caches

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/gob"
	"errors"
	"fmt"
	"time"

	"github.com/emersion/go-imap/v2"

	"github.com/oxygem/kanmail/internal/types"
)

type FolderEmailCache struct {
	db       *sql.DB
	disabled bool

	stmtStore,
	stmtReplace,
	stmtGet,
	stmtDelete,
	stmtDeleteByFolder,
	stmtDeleteAccount,
	stmtGetAccountLookup,
	stmtSetAccountLookup,
	stmtSetAccountReference,
	stmtDeleteAccountLookups,
	stmtDeleteAccountReferences *sql.Stmt
}

func NewFolderEmailCache(db *sql.DB) (*FolderEmailCache, error) {
	// Prepare statements
	stmtStore, err := db.Prepare(`
		INSERT INTO folder_emails (account_name, folder_name, uid, message_id, data)
		VALUES (?, ?, ?, ?, ?)`)
	if err != nil {
		return nil, fmt.Errorf("failed to prepare store statement: %w", err)
	}

	stmtReplace, err := db.Prepare(`
		REPLACE INTO folder_emails (account_name, folder_name, uid, message_id, data)
		VALUES (?, ?, ?, ?, ?)`)
	if err != nil {
		return nil, fmt.Errorf("failed to prepare store statement: %w", err)
	}

	stmtGet, err := db.Prepare(`
		SELECT data FROM folder_emails
		WHERE account_name = ? AND folder_name = ? AND uid = ?`)
	if err != nil {
		return nil, fmt.Errorf("failed to prepare get statement: %w", err)
	}

	stmtDelete, err := db.Prepare(`
		DELETE FROM folder_emails
		WHERE account_name = ? AND folder_name = ? AND uid = ?`)
	if err != nil {
		return nil, fmt.Errorf("failed to prepare deleteByUID statement: %w", err)
	}

	stmtDeleteByFolder, err := db.Prepare(`
		DELETE FROM folder_emails
		WHERE account_name = ? AND folder_name = ?`)
	if err != nil {
		return nil, fmt.Errorf("failed to prepare deleteByFolder statement: %w", err)
	}

	stmtDeleteAccount, err := db.Prepare(`
		DELETE FROM folder_emails
		WHERE account_name = ?`)
	if err != nil {
		return nil, fmt.Errorf("failed to prepare deleteAccount statement: %w", err)
	}

	stmtGetAccountLookup, err := db.Prepare(`
		SELECT lookup_at
		FROM account_lookups
		WHERE account_name = ? AND lookup_key = ?`)
	if err != nil {
		return nil, fmt.Errorf("failed to prepare getMessage statement: %w", err)
	}

	stmtSetAccountLookup, err := db.Prepare(`
		INSERT OR REPLACE INTO account_lookups (account_name, lookup_key, lookup_at)
		VALUES (?, ?, ?)`)
	if err != nil {
		return nil, fmt.Errorf("failed to prepare getMessage statement: %w", err)
	}

	stmtDeleteAccountLookups, err := db.Prepare(`
		DELETE FROM account_lookups
		WHERE account_name = ?`)
	if err != nil {
		return nil, fmt.Errorf("failed to prepare deleteAccountLookups statement: %w", err)
	}

	stmtSetAccountReference, err := db.Prepare(`
		INSERT OR REPLACE INTO account_references (account_name, to_message_id, from_message_id)
		VALUES (?, ?, ?)`)
	if err != nil {
		return nil, fmt.Errorf("failed to prepare setAccountReference statement: %w", err)
	}

	stmtDeleteAccountReferences, err := db.Prepare(`
		DELETE FROM account_references
		WHERE account_name = ?`)
	if err != nil {
		return nil, fmt.Errorf("failed to prepare deleteAccountReferences statement: %w", err)
	}

	return &FolderEmailCache{
		db:                          db,
		stmtStore:                   stmtStore,
		stmtReplace:                 stmtReplace,
		stmtGet:                     stmtGet,
		stmtDelete:                  stmtDelete,
		stmtDeleteByFolder:          stmtDeleteByFolder,
		stmtDeleteAccount:           stmtDeleteAccount,
		stmtGetAccountLookup:        stmtGetAccountLookup,
		stmtSetAccountLookup:        stmtSetAccountLookup,
		stmtSetAccountReference:     stmtSetAccountReference,
		stmtDeleteAccountLookups:    stmtDeleteAccountLookups,
		stmtDeleteAccountReferences: stmtDeleteAccountReferences,
	}, nil
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

	if _, err := stmtStore.ExecContext(
		ctx,
		email.AccountName,
		email.FolderName,
		email.UID,
		email.MessageID,
		data.Bytes(),
	); err != nil {
		return fmt.Errorf(
			"failed to store email %s/%s/%d: %w",
			email.AccountName,
			email.FolderName,
			email.UID,
			err,
		)
	}

	for _, ref := range email.References {
		if _, err := stmtSetAccountRef.Exec(email.AccountName, ref, email.MessageID); err != nil {
			return fmt.Errorf("failed to set account reference: %w", err)
		}
	}

	return tx.Commit()
}

func (c *FolderEmailCache) Replace(ctx context.Context, email *types.Email) error {
	if c.disabled {
		return nil
	}
	var data bytes.Buffer
	if err := gob.NewEncoder(&data).Encode(email); err != nil {
		return fmt.Errorf("failed to marshal email: %w", err)
	} else if _, err := c.stmtReplace.ExecContext(
		ctx,
		email.AccountName,
		email.FolderName,
		email.UID,
		email.MessageID,
		data.Bytes(),
	); err != nil {
		return fmt.Errorf(
			"failed to replace email %s/%s/%d: %w",
			email.AccountName,
			email.FolderName,
			email.UID,
			err,
		)
	}
	return nil
}

func (c *FolderEmailCache) Delete(
	ctx context.Context,
	accountName types.AccountName,
	folderName types.FolderName,
	uid imap.UID,
) error {
	if c.disabled {
		return nil
	}
	_, err := c.stmtDelete.ExecContext(ctx, accountName, folderName, uid)
	if err != nil {
		return fmt.Errorf("failed to delete email: %w", err)
	}
	return nil
}

func (c *FolderEmailCache) Get(
	ctx context.Context,
	accountName types.AccountName,
	folderName types.FolderName,
	uid imap.UID,
) (*types.Email, error) {
	if c.disabled {
		return nil, nil
	}

	var data []byte
	err := c.stmtGet.QueryRowContext(ctx, accountName, folderName, uid).Scan(&data)
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
	accountName types.AccountName,
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
			AND account_name = ?`
	args = append(args, accountName)

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
	accountName types.AccountName,
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
			AND r.account_name = ?`
	args = append(args, accountName)

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
	accountName types.AccountName,
	messageID string,
) (time.Time, error) {
	var t time.Time
	lookupKey := "messageid:" + messageID
	err := c.stmtGetAccountLookup.QueryRowContext(ctx, accountName, lookupKey).Scan(&t)
	if errors.Is(err, sql.ErrNoRows) {
		return t, nil
	}
	return t, err
}

func (c *FolderEmailCache) SetLastMessageIDLookupNow(
	ctx context.Context,
	accountName types.AccountName,
	messageID string,
) error {
	lookupKey := "messageid:" + messageID
	_, err := c.stmtSetAccountLookup.ExecContext(ctx, accountName, lookupKey, time.Now().UTC())
	return err
}

func (c *FolderEmailCache) GetLastReferenceLookupAt(
	ctx context.Context,
	accountName types.AccountName,
	reference string,
) (time.Time, error) {
	var t time.Time
	lookupKey := "reference:" + reference
	err := c.stmtGetAccountLookup.QueryRowContext(ctx, accountName, lookupKey).Scan(&t)
	if errors.Is(err, sql.ErrNoRows) {
		return t, nil
	}
	return t, err
}

func (c *FolderEmailCache) SetLastReferenceLookupNow(
	ctx context.Context,
	accountName types.AccountName,
	reference string,
) error {
	lookupKey := "reference:" + reference
	_, err := c.stmtSetAccountLookup.ExecContext(ctx, accountName, lookupKey, time.Now().UTC())
	return err
}
