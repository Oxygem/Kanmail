package caches

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"time"

	"github.com/oxygem/kanmail/internal/types"
)

var (
	autoVacuumModes   = map[int64]string{0: "none", 1: "full", 2: "incremental"}
	synchronousLevels = map[int64]string{0: "off", 1: "normal", 2: "full", 3: "extra"}
	tempStoreModes    = map[int64]string{0: "default", 1: "file", 2: "memory"}
)

// pragmaScanner reads a run of pragmas, holding onto the first error so the callers don't need to
// check after every single one.
type pragmaScanner struct {
	ctx context.Context
	db  *sql.DB
	err error
}

func scanPragma[T any](p *pragmaScanner, pragma string, dest *T) {
	if p.err != nil {
		return
	}
	if err := p.db.QueryRowContext(p.ctx, "PRAGMA "+pragma).Scan(dest); err != nil {
		p.err = fmt.Errorf("failed to read pragma %s: %w", pragma, err)
	}
}

func lookupMode(modes map[int64]string, value int64) string {
	if name, found := modes[value]; found {
		return name
	}
	return fmt.Sprintf("unknown (%d)", value)
}

// fileSize returns the size of a file, treating a missing file as zero - the WAL and shared memory
// files only exist while the database is open.
func fileSize(path string) (int64, error) {
	info, err := os.Stat(path)
	if os.IsNotExist(err) {
		return 0, nil
	} else if err != nil {
		return 0, err
	}
	return info.Size(), nil
}

func (c *Caches) GetStats(ctx context.Context) (types.CacheStats, error) {
	stats := types.CacheStats{CachesDisabled: c.disabled}

	var autoVacuum, synchronous, tempStore int64

	p := &pragmaScanner{ctx: ctx, db: c.db}
	scanPragma(p, "page_size", &stats.PageSize)
	scanPragma(p, "page_count", &stats.PageCount)
	scanPragma(p, "freelist_count", &stats.FreelistPages)
	scanPragma(p, "max_page_count", &stats.MaxPageCount)
	scanPragma(p, "journal_mode", &stats.JournalMode)
	scanPragma(p, "encoding", &stats.Encoding)
	scanPragma(p, "locking_mode", &stats.LockingMode)
	scanPragma(p, "foreign_keys", &stats.ForeignKeys)
	scanPragma(p, "busy_timeout", &stats.BusyTimeout)
	scanPragma(p, "cache_size", &stats.CacheSize)
	scanPragma(p, "wal_autocheckpoint", &stats.WALAutocheckpoint)
	scanPragma(p, "schema_version", &stats.SchemaVersion)
	scanPragma(p, "user_version", &stats.UserVersion)
	scanPragma(p, "application_id", &stats.ApplicationID)
	scanPragma(p, "auto_vacuum", &autoVacuum)
	scanPragma(p, "synchronous", &synchronous)
	scanPragma(p, "temp_store", &tempStore)
	if p.err != nil {
		return stats, p.err
	}

	stats.AutoVacuum = lookupMode(autoVacuumModes, autoVacuum)
	stats.Synchronous = lookupMode(synchronousLevels, synchronous)
	stats.TempStore = lookupMode(tempStoreModes, tempStore)

	stats.LogicalSize = stats.PageSize * stats.PageCount
	stats.FreelistSize = stats.PageSize * stats.FreelistPages
	stats.MaxSize = stats.PageSize * stats.MaxPageCount
	if stats.PageCount > 0 {
		stats.FreelistPercent = float64(stats.FreelistPages) / float64(stats.PageCount) * 100
	}

	if err := c.db.QueryRowContext(ctx, "SELECT sqlite_version()").Scan(&stats.SQLiteVersion); err != nil {
		return stats, fmt.Errorf("failed to read sqlite version: %w", err)
	}

	// Get database filename
	row := c.db.QueryRowContext(ctx, "PRAGMA database_list")
	var seq int64
	var name string
	if err := row.Scan(&seq, &name, &stats.DatabaseFilename); err != nil {
		return stats, fmt.Errorf("failed to read database list: %w", err)
	}

	// The main database file only accounts for part of the on-disk footprint, the WAL can be
	// substantially larger between checkpoints.
	for _, file := range []struct {
		path string
		dest *int64
	}{
		{c.path, &stats.FileSize},
		{c.path + "-wal", &stats.WALSize},
		{c.path + "-shm", &stats.SHMSize},
	} {
		size, err := fileSize(file.path)
		if err != nil {
			return stats, fmt.Errorf("failed to stat %s: %w", file.path, err)
		}
		*file.dest = size
	}
	stats.TotalOnDiskSize = stats.FileSize + stats.WALSize + stats.SHMSize

	if err := c.scanSchemaCounts(ctx, &stats); err != nil {
		return stats, err
	}

	for _, table := range []struct {
		table  string
		column string
		count  *int64
		latest *string
	}{
		{"migrations", "filename", &stats.MigrationCount, &stats.LatestMigration},
		{"upgrades", "name", &stats.UpgradeCount, &stats.LatestUpgrade},
	} {
		query := fmt.Sprintf("SELECT COUNT(*), COALESCE(MAX(%s), '') FROM %s", table.column, table.table)
		if err := c.db.QueryRowContext(ctx, query).Scan(table.count, table.latest); err != nil {
			return stats, fmt.Errorf("failed to count %s: %w", table.table, err)
		}
	}

	return stats, nil
}

func (c *Caches) scanSchemaCounts(ctx context.Context, stats *types.CacheStats) error {
	rows, err := c.db.QueryContext(ctx, "SELECT type, COUNT(*) FROM sqlite_schema GROUP BY type")
	if err != nil {
		return fmt.Errorf("failed to read schema counts: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var objectType string
		var count int64
		if err := rows.Scan(&objectType, &count); err != nil {
			return fmt.Errorf("failed to scan schema count: %w", err)
		}

		switch objectType {
		case "table":
			stats.TableCount = count
		case "index":
			stats.IndexCount = count
		case "trigger":
			stats.TriggerCount = count
		case "view":
			stats.ViewCount = count
		}
	}

	return rows.Err()
}

// Vacuum rebuilds the database file, reclaiming freelist pages, then updates the query planner
// statistics. Fails with SQLITE_BUSY if anything else holds a transaction open.
func (c *Caches) Vacuum(ctx context.Context) error {
	if _, err := c.db.ExecContext(ctx, "VACUUM"); err != nil {
		return fmt.Errorf("failed to vacuum database: %w", err)
	}
	if _, err := c.db.ExecContext(ctx, "PRAGMA optimize"); err != nil {
		return fmt.Errorf("failed to optimize database: %w", err)
	}

	// In WAL mode the rewritten pages live in the WAL until a checkpoint, so without this the
	// on-disk size wouldn't move despite having just reclaimed most of the file. A busy result
	// (readers still active) leaves the WAL in place, which is fine - it'll checkpoint later.
	var busy, walPages, checkpointed int64
	if err := c.db.QueryRowContext(ctx, "PRAGMA wal_checkpoint(TRUNCATE)").
		Scan(&busy, &walPages, &checkpointed); err != nil {
		return fmt.Errorf("failed to checkpoint WAL: %w", err)
	}

	return nil
}

// QuickCheck runs the cheaper sibling of integrity_check, skipping the index/table cross checks so
// the whole database doesn't need re-indexing to answer.
func (c *Caches) QuickCheck(ctx context.Context) (types.CacheIntegrityResult, error) {
	result := types.CacheIntegrityResult{Messages: []string{}}
	start := time.Now()

	rows, err := c.db.QueryContext(ctx, "PRAGMA quick_check")
	if err != nil {
		return result, fmt.Errorf("failed to run quick check: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var message string
		if err := rows.Scan(&message); err != nil {
			return result, fmt.Errorf("failed to scan quick check result: %w", err)
		}
		result.Messages = append(result.Messages, message)
	}
	if err := rows.Err(); err != nil {
		return result, err
	}

	result.OK = len(result.Messages) == 1 && result.Messages[0] == "ok"
	result.DurationMS = time.Since(start).Milliseconds()
	return result, nil
}
