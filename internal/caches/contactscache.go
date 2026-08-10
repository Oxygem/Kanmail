package caches

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"github.com/oxygem/kanmail/internal/types"
)

const searchResultLimit = 50

type ContactsCache struct {
	db       *sql.DB
	disabled bool

	stmtStore,
	stmtSearch,
	stmtSetAlwaysShowImages,
	stmtGetAlwaysShowImages *sql.Stmt
}

func NewContactsCache(db *sql.DB) (*ContactsCache, error) {
	stmtStore, err := db.Prepare(`
		INSERT INTO contacts (email, name) VALUES (?, ?)
		ON CONFLICT (email, name) DO NOTHING`)
	if err != nil {
		return nil, err
	}

	stmtSearch, err := db.Prepare(`
		SELECT email, name
		FROM contacts
		WHERE email LIKE ? ESCAPE '\' OR name LIKE ? ESCAPE '\'
		ORDER BY email
		LIMIT ?`)
	if err != nil {
		return nil, err
	}

	stmtSetAlwaysShowImages, err := db.Prepare(`
		INSERT INTO contacts (email, name, always_show_images) VALUES (?, ?, ?)
		ON CONFLICT (email, name) DO UPDATE
		SET always_show_images = excluded.always_show_images`)
	if err != nil {
		return nil, err
	}

	stmtGetAlwaysShowImages, err := db.Prepare(`
		SELECT always_show_images FROM contacts WHERE email = ? AND name = ?`)
	if err != nil {
		return nil, err
	}

	return &ContactsCache{
		db:                      db,
		stmtStore:               stmtStore,
		stmtSearch:              stmtSearch,
		stmtSetAlwaysShowImages: stmtSetAlwaysShowImages,
		stmtGetAlwaysShowImages: stmtGetAlwaysShowImages,
	}, nil
}

func (c *ContactsCache) Store(ctx context.Context, addr types.Address) error {
	if c.disabled {
		return nil
	}
	_, err := c.stmtStore.ExecContext(ctx, addr.Email, addr.Name)
	if err != nil {
		return fmt.Errorf("failed to store contact %s: %w", addr.Email, err)
	}
	return nil
}

func (c *ContactsCache) Search(ctx context.Context, term string) ([]types.Address, error) {
	if c.disabled {
		return nil, nil
	}
	// Escape LIKE wildcards so a literal % or _ in the term matches itself
	searchTerm := "%" + strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(term) + "%"
	rows, err := c.stmtSearch.QueryContext(ctx, searchTerm, searchTerm, searchResultLimit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	results := make([]types.Address, 0, 10)

	for rows.Next() {
		var email, name string
		if err := rows.Scan(&email, &name); err != nil {
			return nil, err
		}
		results = append(results, types.Address{Email: email, Name: name})
	}

	return results, rows.Err()
}

func (c *ContactsCache) SetAlwaysShowImages(ctx context.Context, addr types.Address, alwaysShow bool) error {
	if c.disabled {
		return nil
	}
	_, err := c.stmtSetAlwaysShowImages.ExecContext(ctx, addr.Email, addr.Name, alwaysShow)
	if err != nil {
		return fmt.Errorf("failed to set always show images for contact %s: %w", addr.Email, err)
	}
	return nil
}

func (c *ContactsCache) GetAlwaysShowImages(ctx context.Context, addr types.Address) (bool, error) {
	if c.disabled {
		return false, nil
	}

	var alwaysShow bool
	err := c.stmtGetAlwaysShowImages.QueryRowContext(ctx, addr.Email, addr.Name).Scan(&alwaysShow)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	} else if err != nil {
		return false, fmt.Errorf("failed to get always show images for contact %s: %w", addr.Email, err)
	}
	return alwaysShow, nil
}
