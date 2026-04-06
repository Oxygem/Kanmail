package caches

import (
	"context"
	"database/sql"
	"embed"
	"fmt"
	"os"
	"path"
	"strings"

	_ "github.com/mattn/go-sqlite3"
	"github.com/rs/zerolog"

	"github.com/oxygem/kanmail/internal/constants"
	"github.com/oxygem/kanmail/internal/types"
)

//go:embed migrations
var MigrationsFS embed.FS

type Caches struct {
	log      zerolog.Logger
	db       *sql.DB
	disabled bool
	path     string

	FolderUIDCache       *FolderUIDCache
	FolderEmailCache     *FolderEmailCache
	FolderEmailPartCache *FolderEmailPartCache

	ContactsCache    *ContactsCache
	AvatarCache      *AvatarCache
	LicenseCache     *LicenseCache
	WindowStateCache *WindowStateCache
}

func NewCaches(log zerolog.Logger, path string) *Caches {
	db, err := sql.Open("sqlite3", path+"?_foreign_keys=true&_journal_mode=WAL")
	if err != nil {
		panic(err)
	}

	caches := &Caches{
		log:  log,
		db:   db,
		path: path,
	}

	if err := caches.runMigrations(); err != nil {
		panic(err)
	}

	caches.ContactsCache = NewContactsCache(db)
	caches.AvatarCache = NewAvatarCache(db)
	caches.LicenseCache = NewLicenseCache(db)
	caches.WindowStateCache = NewWindowStateCache(db)

	caches.FolderUIDCache, err = NewFolderUIDCache(db)
	if err != nil {
		panic(err)
	}

	caches.FolderEmailCache, err = NewFolderEmailCache(db)
	if err != nil {
		panic(err)
	}

	caches.FolderEmailPartCache, err = NewFolderEmailPartCache(db)
	if err != nil {
		panic(err)
	}

	if constants.ENV_DEBUG_CACHES_DISABLE != "" {
		log.Warn().Msg("Folder cache disabled")
		caches.disabled = true
		caches.FolderUIDCache.disabled = true
		caches.FolderEmailCache.disabled = true
		caches.FolderEmailPartCache.disabled = true
	}

	return caches
}

func (c *Caches) Close() error {
	return c.db.Close()
}

func (c *Caches) CloseAndDelete() error {
	if err := c.Close(); err != nil {
		return fmt.Errorf("failed to close database: %w", err)
	} else if err := os.Remove(c.path); err != nil {
		return fmt.Errorf("failed to delete database file: %s: %w", c.path, err)
	}
	return nil
}

func (c *Caches) IsDisabled() bool {
	return c.disabled
}

func (c *Caches) DeleteByFolder(ctx context.Context, accountName types.AccountName, folderName types.FolderName) error {
	if c.disabled {
		return nil
	}

	tx, err := c.db.Begin()
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	// Create transaction-specific statements
	stmtDeleteByFolder := tx.Stmt(c.FolderEmailCache.stmtDeleteByFolder)
	defer stmtDeleteByFolder.Close()
	stmtDeleteUIDs := tx.Stmt(c.FolderUIDCache.stmtDeleteUIDs)
	defer stmtDeleteUIDs.Close()
	stmtDeleteParts := tx.Stmt(c.FolderEmailPartCache.stmtDeleteByFolder)
	defer stmtDeleteParts.Close()

	// Delete from folder_emails
	if _, err := stmtDeleteByFolder.ExecContext(ctx, accountName, folderName); err != nil {
		return fmt.Errorf("failed to delete folder emails: %w", err)
	}

	// Delete from folder_uids
	if _, err := stmtDeleteUIDs.ExecContext(ctx, accountName, folderName); err != nil {
		return fmt.Errorf("failed to delete folder UIDs: %w", err)
	}

	// Delete from folder_email_parts
	if _, err := stmtDeleteParts.ExecContext(ctx, accountName, folderName); err != nil {
		return fmt.Errorf("failed to delete folder parts: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}
	return nil
}

func (c *Caches) DeleteByAccount(ctx context.Context, accountName types.AccountName) error {
	if c.disabled {
		return nil
	}

	tx, err := c.db.Begin()
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	// Create transaction-specific statements
	stmts := []*sql.Stmt{
		tx.Stmt(c.FolderUIDCache.stmtDeleteAccountUIDs),
		tx.Stmt(c.FolderEmailCache.stmtDeleteAccount),
		tx.Stmt(c.FolderEmailCache.stmtDeleteAccountLookups),
		tx.Stmt(c.FolderEmailCache.stmtDeleteAccountReferences),
	}

	for _, stmt := range stmts {
		defer stmt.Close()
	}

	for i, stmt := range stmts {
		if _, err := stmt.ExecContext(ctx, accountName); err != nil {
			return fmt.Errorf("failed to delete account stmt: %d: %w", i, err)
		}
	}

	return tx.Commit()
}

func (c *Caches) runMigrations() error {
	migrations, err := MigrationsFS.ReadDir("migrations")
	if err != nil {
		return err
	}

	ctx := context.Background()

	sql := "CREATE TABLE IF NOT EXISTS migrations (filename TEXT NOT NULL)"
	if _, err := c.db.ExecContext(ctx, sql); err != nil {
		return err
	}

	sql = "SELECT filename FROM migrations"
	rows, err := c.db.QueryContext(ctx, sql)
	if err != nil {
		return err
	}
	defer rows.Close()

	runMigrationsSlice := make([]string, 0)

	for rows.Next() {
		var filename string
		if err := rows.Scan(&filename); err != nil {
			return err
		}
		runMigrationsSlice = append(runMigrationsSlice, filename)
	}

	runMigrations := make(map[string]struct{})
	for _, file := range runMigrationsSlice {
		runMigrations[file] = struct{}{}
	}

	for _, file := range migrations {
		if _, found := runMigrations[file.Name()]; found {
			c.log.Debug().Msgf("Migration already run: %s", file.Name())
		} else {
			data, err := MigrationsFS.ReadFile(path.Join("migrations", file.Name()))
			if err != nil {
				return err
			}

			tx, err := c.db.Begin()
			if err != nil {
				return err
			}
			defer tx.Rollback()

			c.log.Debug().Msgf("Running migration: %s", file.Name())

			statements := strings.Split(string(data), ";")
			for _, statement := range statements {
				if _, err := tx.ExecContext(ctx, statement); err != nil {
					return err
				}
			}

			sql = "INSERT INTO migrations (filename) VALUES ($1)"

			if _, err := tx.ExecContext(ctx, sql, file.Name()); err != nil {
				return err
			}

			if err := tx.Commit(); err != nil {
				return err
			}

			c.log.Info().Msgf("Migration complete: %s", file.Name())
		}
	}

	return nil
}
