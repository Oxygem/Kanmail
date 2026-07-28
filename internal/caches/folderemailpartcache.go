package caches

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/emersion/go-imap/v2"

	"github.com/oxygem/kanmail/internal/types"
	"github.com/oxygem/kanmail/internal/util"
)

type FolderEmailPartCache struct {
	db *sql.DB

	disabled bool

	stmtStore          *sql.Stmt
	stmtGet            *sql.Stmt
	stmtDelete         *sql.Stmt
	stmtDeleteByFolder *sql.Stmt
	stmtDeleteAcct     *sql.Stmt
}

func NewFolderEmailPartCache(db *sql.DB) (*FolderEmailPartCache, error) {
	// Prepare statements
	// Parts are immutable for a given UID, but concurrent fetches of the same
	// part can race between the cache check and this write, so upsert
	stmtStore, err := db.Prepare(`
		INSERT INTO folder_email_parts (account_id, folder_name, uid, part_id, data)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT (account_id, folder_name, uid, part_id)
		DO UPDATE SET data = excluded.data`)
	if err != nil {
		return nil, fmt.Errorf("failed to prepare store statement: %w", err)
	}

	stmtGet, err := db.Prepare(`
		SELECT data FROM folder_email_parts
		WHERE account_id = ? AND folder_name = ? AND uid = ? AND part_id = ?`)
	if err != nil {
		return nil, fmt.Errorf("failed to prepare get statement: %w", err)
	}

	stmtDelete, err := db.Prepare(`
		DELETE FROM folder_email_parts
		WHERE account_id = ? AND folder_name = ? AND uid = ?`)
	if err != nil {
		return nil, fmt.Errorf("failed to prepare delete statement: %w", err)
	}

	stmtDeleteByFolder, err := db.Prepare(`
		DELETE FROM folder_email_parts
		WHERE account_id = ? AND folder_name = ?`)
	if err != nil {
		return nil, fmt.Errorf("failed to prepare deleteByFolder statement: %w", err)
	}

	stmtDeleteAcct, err := db.Prepare(`
		DELETE FROM folder_email_parts
		WHERE account_id = ?`)
	if err != nil {
		return nil, fmt.Errorf("failed to prepare deleteAccount statement: %w", err)
	}

	cache := FolderEmailPartCache{
		db:                 db,
		stmtStore:          stmtStore,
		stmtGet:            stmtGet,
		stmtDelete:         stmtDelete,
		stmtDeleteByFolder: stmtDeleteByFolder,
		stmtDeleteAcct:     stmtDeleteAcct,
	}

	return &cache, nil
}

func (c *FolderEmailPartCache) Store(
	ctx context.Context,
	accountID types.AccountID,
	folderName types.FolderName,
	uid imap.UID,
	partID []int,
	data []byte,
) error {
	if c.disabled {
		return nil
	}

	_, err := c.stmtStore.ExecContext(
		ctx,
		accountID,
		folderName,
		uid,
		util.PartIDToString(partID),
		data,
	)
	if err != nil {
		return fmt.Errorf("failed to store email part: %w", err)
	}
	return nil
}

func (c *FolderEmailPartCache) Get(
	ctx context.Context,
	accountID types.AccountID,
	folderName types.FolderName,
	uid imap.UID,
	partID []int,
) ([]byte, error) {
	if c.disabled {
		return nil, nil
	}

	var data []byte
	err := c.stmtGet.QueryRowContext(
		ctx,
		accountID,
		folderName,
		uid,
		util.PartIDToString(partID),
	).Scan(&data)

	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	} else if err != nil {
		return nil, fmt.Errorf("failed to fetch email part: %w", err)
	}

	if data == nil {
		// The part exists but is empty (servers return NIL for empty/missing
		// sections) - return non-nil so callers see a hit, not a miss
		data = []byte{}
	}

	return data, nil
}

func (c *FolderEmailPartCache) Delete(
	ctx context.Context,
	accountID types.AccountID,
	folderName types.FolderName,
	uid imap.UID,
) error {
	if c.disabled {
		return nil
	}
	_, err := c.stmtDelete.ExecContext(ctx, accountID, folderName, uid)
	return err
}

func (c *FolderEmailPartCache) DeleteByFolder(
	ctx context.Context,
	accountID types.AccountID,
	folderName types.FolderName,
) error {
	if c.disabled {
		return nil
	}
	_, err := c.stmtDeleteByFolder.ExecContext(ctx, accountID, folderName)
	return err
}

func (c *FolderEmailPartCache) DeleteAccount(
	ctx context.Context,
	accountID types.AccountID,
) error {
	if c.disabled {
		return nil
	}
	_, err := c.stmtDeleteAcct.ExecContext(ctx, accountID)
	return err
}
