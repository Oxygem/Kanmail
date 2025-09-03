package caches

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/gob"
	"errors"
	"fmt"
	"os"

	"github.com/emersion/go-imap/v2"
	"github.com/rs/zerolog/log"

	"github.com/oxygem/kanmail/internal/types"
)

type FolderUIDCache struct {
	db       *sql.DB
	disabled bool

	stmtStoreUIDs      *sql.Stmt
	stmtGetUIDs        *sql.Stmt
	stmtDeleteUIDs     *sql.Stmt
	stmtDeleteAcctUIDs *sql.Stmt
}

func NewFolderUIDCache(db *sql.DB) (*FolderUIDCache, error) {
	stmtStoreUIDs, err := db.Prepare(`
		INSERT OR REPLACE INTO folder_uids (account_name, folder_name, uid_validity, uids_start_at, uids)
		VALUES (?, ?, ?, ?, ?)`)
	if err != nil {
		return nil, fmt.Errorf("failed to prepare storeUIDs statement: %w", err)
	}

	stmtGetUIDs, err := db.Prepare(`
		SELECT uid_validity, uids_start_at, uids FROM folder_uids
		WHERE account_name = ? AND folder_name = ?`)
	if err != nil {
		return nil, fmt.Errorf("failed to prepare getUIDs statement: %w", err)
	}

	stmtDeleteUIDs, err := db.Prepare(`
		DELETE FROM folder_uids
		WHERE account_name = ? AND folder_name = ?`)
	if err != nil {
		return nil, fmt.Errorf("failed to prepare deleteUIDs statement: %w", err)
	}

	stmtDeleteAcctUIDs, err := db.Prepare(`
		DELETE FROM folder_uids
		WHERE account_name = ?`)
	if err != nil {
		return nil, fmt.Errorf("failed to prepare deleteAccountUIDs statement: %w", err)
	}

	cache := FolderUIDCache{
		db:                 db,
		stmtStoreUIDs:      stmtStoreUIDs,
		stmtGetUIDs:        stmtGetUIDs,
		stmtDeleteUIDs:     stmtDeleteUIDs,
		stmtDeleteAcctUIDs: stmtDeleteAcctUIDs,
	}

	if os.Getenv("KANMAIL_FOLDER_CACHE_DISABLE") != "" {
		log.Warn().Msg("Folder cache disabled")
		cache.disabled = true
	}

	return &cache, nil
}

func (c *FolderUIDCache) Delete(
	ctx context.Context,
	accountName types.AccountName,
	folderName types.FolderName,
) error {
	if c.disabled {
		return nil
	}
	_, err := c.stmtDeleteUIDs.ExecContext(ctx, accountName, folderName)
	return err
}

func (c *FolderUIDCache) Store(
	ctx context.Context,
	accountName types.AccountName,
	folderName types.FolderName,
	uidValidity uint32,
	uidsStartAt imap.UID,
	uids []imap.UID,
) error {
	if c.disabled {
		return nil
	}

	var data bytes.Buffer
	if err := gob.NewEncoder(&data).Encode(uids); err != nil {
		return fmt.Errorf("failed to marshal UIDs: %w", err)
	}

	_, err := c.stmtStoreUIDs.ExecContext(ctx, accountName, folderName, uidValidity, uidsStartAt, data.Bytes())
	if err != nil {
		return fmt.Errorf("failed to store folder UIDs: %w", err)
	}
	return nil
}

func (c *FolderUIDCache) Get(
	ctx context.Context,
	accountName types.AccountName,
	folderName types.FolderName,
) (
	uidValidity uint32,
	uidsStartAt imap.UID,
	uids []imap.UID,
	err error,
) {
	if c.disabled {
		return
	}

	var data []byte
	err = c.stmtGetUIDs.QueryRowContext(ctx, accountName, folderName).Scan(&uidValidity, &uidsStartAt, &data)
	if errors.Is(err, sql.ErrNoRows) {
		err = nil // no rows = nil response
		return
	} else if err != nil {
		err = fmt.Errorf("failed to fetch folder UIDs: %w", err)
		return
	}

	if err = gob.NewDecoder(bytes.NewBuffer(data)).Decode(&uids); err != nil {
		err = fmt.Errorf("failed to unmarshal UIDs: %w", err)
		return
	}

	return
}
