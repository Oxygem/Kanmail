package caches

import (
	"context"

	"github.com/dustin/go-humanize"

	"github.com/oxygem/kanmail/internal/types"
)

func (c *Caches) GetStats(ctx context.Context) (types.CacheStats, error) {
	stats := types.CacheStats{}

	// Get page size
	row := c.db.QueryRowContext(ctx, "PRAGMA page_size")
	if err := row.Scan(&stats.PageSize); err != nil {
		return stats, err
	}

	// Get page count
	row = c.db.QueryRowContext(ctx, "PRAGMA page_count")
	if err := row.Scan(&stats.PageCount); err != nil {
		return stats, err
	}

	// Calculate database size
	stats.DatabaseSize = stats.PageSize * stats.PageCount
	stats.DatabaseSizeFormatted = humanize.Bytes(uint64(stats.DatabaseSize))
	stats.PageSizeFormatted = humanize.Bytes(uint64(stats.PageSize))

	// Get freelist page count
	row = c.db.QueryRowContext(ctx, "PRAGMA freelist_count")
	if err := row.Scan(&stats.FreelistPages); err != nil {
		return stats, err
	}

	// Get schema version
	row = c.db.QueryRowContext(ctx, "PRAGMA schema_version")
	if err := row.Scan(&stats.SchemaVersion); err != nil {
		return stats, err
	}

	// Get database filename
	row = c.db.QueryRowContext(ctx, "PRAGMA database_list")
	var seq int64
	var name string
	if err := row.Scan(&seq, &name, &stats.DatabaseFilename); err != nil {
		return stats, err
	}

	return stats, nil
}
