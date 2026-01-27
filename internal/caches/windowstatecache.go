package caches

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

type WindowState struct {
	X      int
	Y      int
	Width  int
	Height int
}

type WindowStateCache struct {
	db       *sql.DB
	disabled bool

	stmtStore,
	stmtGet *sql.Stmt
}

func NewWindowStateCache(db *sql.DB) *WindowStateCache {
	stmtStore, err := db.Prepare(`
		INSERT OR REPLACE INTO window_state (window_name, x, y, width, height)
		VALUES (?, ?, ?, ?, ?)`)
	if err != nil {
		panic(err)
	}

	stmtGet, err := db.Prepare(`
		SELECT x, y, width, height FROM window_state
		WHERE window_name = ?`)
	if err != nil {
		panic(err)
	}

	return &WindowStateCache{
		db:        db,
		stmtStore: stmtStore,
		stmtGet:   stmtGet,
	}
}

func (c *WindowStateCache) Store(ctx context.Context, windowName string, state WindowState) error {
	if c.disabled {
		return nil
	}

	_, err := c.stmtStore.ExecContext(ctx, windowName, state.X, state.Y, state.Width, state.Height)
	if err != nil {
		return fmt.Errorf("failed to store window state for %s: %w", windowName, err)
	}
	return nil
}

func (c *WindowStateCache) Get(ctx context.Context, windowName string) (*WindowState, error) {
	if c.disabled {
		return nil, nil
	}

	var state WindowState
	err := c.stmtGet.QueryRowContext(ctx, windowName).Scan(&state.X, &state.Y, &state.Width, &state.Height)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	} else if err != nil {
		return nil, fmt.Errorf("failed to get window state for %s: %w", windowName, err)
	}

	return &state, nil
}
