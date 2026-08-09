package caches

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

type LicenseCache struct {
	db       *sql.DB
	disabled bool

	stmtUpsert,
	stmtGet,
	stmtDelete *sql.Stmt
}

func NewLicenseCache(db *sql.DB) (*LicenseCache, error) {
	stmtUpsert, err := db.Prepare(`
		INSERT OR REPLACE INTO license_check (license_key_hash, checked_at)
		VALUES (?, CURRENT_TIMESTAMP)`)
	if err != nil {
		return nil, err
	}

	stmtGet, err := db.Prepare(`
		SELECT checked_at FROM license_check
		WHERE license_key_hash = ?`)
	if err != nil {
		return nil, err
	}

	stmtDelete, err := db.Prepare(`
		DELETE FROM license_check
		WHERE license_key_hash = ?`)
	if err != nil {
		return nil, err
	}

	return &LicenseCache{
		db:         db,
		stmtUpsert: stmtUpsert,
		stmtGet:    stmtGet,
		stmtDelete: stmtDelete,
	}, nil
}

func (c *LicenseCache) Upsert(ctx context.Context, licenseKeyHash string) error {
	if c.disabled {
		return nil
	}

	_, err := c.stmtUpsert.ExecContext(ctx, licenseKeyHash)
	if err != nil {
		return fmt.Errorf("failed to upsert license check for hash %s: %w", licenseKeyHash, err)
	}
	return nil
}

func (c *LicenseCache) Get(ctx context.Context, licenseKeyHash string) (time.Time, error) {
	if c.disabled {
		return time.Time{}, nil
	}

	var checkedAt time.Time
	err := c.stmtGet.QueryRowContext(ctx, licenseKeyHash).Scan(&checkedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return time.Time{}, nil
	} else if err != nil {
		return time.Time{}, fmt.Errorf("failed to get license check for hash %s: %w", licenseKeyHash, err)
	}

	return checkedAt, nil
}

func (c *LicenseCache) Delete(ctx context.Context, licenseKeyHash string) error {
	if c.disabled {
		return nil
	}

	_, err := c.stmtDelete.ExecContext(ctx, licenseKeyHash)
	if err != nil {
		return fmt.Errorf("failed to delete license check for hash %s: %w", licenseKeyHash, err)
	}
	return nil
}
