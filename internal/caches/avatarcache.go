package caches

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

type AvatarCache struct {
	db       *sql.DB
	disabled bool

	stmtStore,
	stmtDelete,
	stmtGet *sql.Stmt
}

func NewAvatarCache(db *sql.DB) *AvatarCache {
	stmtStore, err := db.Prepare(`
		INSERT OR REPLACE INTO email_avatars (email, data, data_size, data_type)
		VALUES (?, ?, ?, ?)`)
	if err != nil {
		panic(err)
	}

	stmtDelete, err := db.Prepare(`
		DELETE FROM email_avatars
		WHERE email = ?`)
	if err != nil {
		panic(err)
	}

	stmtGet, err := db.Prepare(`
		SELECT data, data_type FROM email_avatars
		WHERE email = ?`)
	if err != nil {
		panic(err)
	}

	return &AvatarCache{
		db:         db,
		stmtStore:  stmtStore,
		stmtDelete: stmtDelete,
		stmtGet:    stmtGet,
	}
}

func (c *AvatarCache) Store(ctx context.Context, email string, data []byte, dataType string) error {
	if c.disabled {
		return nil
	}

	_, err := c.stmtStore.ExecContext(ctx, email, data, len(data), dataType)
	if err != nil {
		return fmt.Errorf("failed to store avatar for %s: %w", email, err)
	}
	return nil
}

func (c *AvatarCache) Delete(ctx context.Context, email string) error {
	if c.disabled {
		return nil
	}
	_, err := c.stmtDelete.ExecContext(ctx, email)
	return err
}

func (c *AvatarCache) Get(ctx context.Context, email string) (bool, []byte, string, error) {
	if c.disabled {
		return true, nil, "", nil
	}

	var data []byte
	var dataType string
	err := c.stmtGet.QueryRowContext(ctx, email).Scan(&data, &dataType)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil, "", nil
	} else if err != nil {
		return false, nil, "", fmt.Errorf("failed to get avatar for %s: %w", email, err)
	}

	return true, data, dataType, nil
}
