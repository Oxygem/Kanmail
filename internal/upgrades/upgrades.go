// Package upgrades runs ordered, named data migrations against caches.db.
//
// Distinct from schema migrations (which are pure DDL run by the caches
// package on db open), upgrades are arbitrary Go code that can decode existing
// data, transform it, and write new rows. Each upgrade is recorded in the
// upgrades table on success and skipped on subsequent runs.
//
// Upgrades must be idempotent: a partial run that fails midway should leave
// the database in a state where re-running the upgrade completes correctly.
// The simplest pattern is INSERT OR IGNORE.
package upgrades

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/rs/zerolog"

	"github.com/oxygem/kanmail/internal/caches"
)

// Upgrade is a single data migration. Name must be stable forever — it's the
// key used to skip already-applied upgrades.
type Upgrade struct {
	Name string
	Run  func(ctx context.Context, c *caches.Caches) error
}

// All is the ordered list of registered upgrades. New upgrades append to the
// end. Never reorder, rename, or remove an existing entry.
var All = []Upgrade{
	{Name: "001-backfill-attachments", Run: backfillAttachments},
}

// Run applies every pending upgrade in order, marking each completed on
// success. If an upgrade returns an error, Run returns immediately without
// marking it — the next call retries it from scratch.
func Run(ctx context.Context, log zerolog.Logger, c *caches.Caches) error {
	db := c.DB()

	done, err := loadCompleted(ctx, db)
	if err != nil {
		return fmt.Errorf("failed to load completed upgrades: %w", err)
	}

	for _, u := range All {
		if _, ok := done[u.Name]; ok {
			log.Debug().Str("upgrade", u.Name).Msg("Upgrade already applied")
			continue
		}

		log.Info().Str("upgrade", u.Name).Msg("Running upgrade")
		if err := u.Run(ctx, c); err != nil {
			return fmt.Errorf("upgrade %s failed: %w", u.Name, err)
		}

		if _, err := db.ExecContext(ctx,
			"INSERT INTO upgrades (name) VALUES (?)", u.Name,
		); err != nil {
			return fmt.Errorf("failed to mark upgrade %s complete: %w", u.Name, err)
		}
		log.Info().Str("upgrade", u.Name).Msg("Upgrade complete")
	}

	return nil
}

func loadCompleted(ctx context.Context, db *sql.DB) (map[string]struct{}, error) {
	rows, err := db.QueryContext(ctx, "SELECT name FROM upgrades")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make(map[string]struct{})
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		out[name] = struct{}{}
	}
	if err := rows.Err(); err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}
	return out, nil
}
