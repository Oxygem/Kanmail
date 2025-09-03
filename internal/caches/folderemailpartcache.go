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
	stmtStore, err := db.Prepare(`
		INSERT INTO folder_email_parts (account_name, folder_name, uid, part_id, data)
		VALUES (?, ?, ?, ?, ?)`)
	if err != nil {
		return nil, fmt.Errorf("failed to prepare store statement: %w", err)
	}

	stmtGet, err := db.Prepare(`
		SELECT data FROM folder_email_parts
		WHERE account_name = ? AND folder_name = ? AND uid = ? AND part_id = ?`)
	if err != nil {
		return nil, fmt.Errorf("failed to prepare get statement: %w", err)
	}

	stmtDelete, err := db.Prepare(`
		DELETE FROM folder_email_parts
		WHERE account_name = ? AND folder_name = ? AND uid = ?`)
	if err != nil {
		return nil, fmt.Errorf("failed to prepare delete statement: %w", err)
	}

	stmtDeleteByFolder, err := db.Prepare(`
		DELETE FROM folder_email_parts
		WHERE account_name = ? AND folder_name = ?`)
	if err != nil {
		return nil, fmt.Errorf("failed to prepare deleteByFolder statement: %w", err)
	}

	stmtDeleteAcct, err := db.Prepare(`
		DELETE FROM folder_email_parts
		WHERE account_name = ?`)
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
	accountName types.AccountName,
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
		accountName,
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
	accountName types.AccountName,
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
		accountName,
		folderName,
		uid,
		util.PartIDToString(partID),
	).Scan(&data)

	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	} else if err != nil {
		return nil, fmt.Errorf("failed to fetch email part: %w", err)
	}

	return data, nil
}

func (c *FolderEmailPartCache) Delete(
	ctx context.Context,
	accountName types.AccountName,
	folderName types.FolderName,
	uid imap.UID,
) error {
	if c.disabled {
		return nil
	}
	_, err := c.stmtDelete.ExecContext(ctx, accountName, folderName, uid)
	return err
}

func (c *FolderEmailPartCache) DeleteByFolder(
	ctx context.Context,
	accountName types.AccountName,
	folderName types.FolderName,
) error {
	if c.disabled {
		return nil
	}
	_, err := c.stmtDeleteByFolder.ExecContext(ctx, accountName, folderName)
	return err
}

func (c *FolderEmailPartCache) DeleteAccount(
	ctx context.Context,
	accountName types.AccountName,
) error {
	if c.disabled {
		return nil
	}
	_, err := c.stmtDeleteAcct.ExecContext(ctx, accountName)
	return err
}
