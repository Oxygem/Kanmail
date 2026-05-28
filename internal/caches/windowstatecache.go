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

	// ScreenID is empty when the state was saved before screen tracking
	// existed; callers should treat the screen fields as missing in that case.
	ScreenID     string
	ScreenX      int
	ScreenY      int
	ScreenWidth  int
	ScreenHeight int
}

type WindowStateCache struct {
	db       *sql.DB
	disabled bool

	stmtStore,
	stmtGet *sql.Stmt
}

func NewWindowStateCache(db *sql.DB) *WindowStateCache {
	stmtStore, err := db.Prepare(`
		INSERT OR REPLACE INTO window_state (
			window_name, x, y, width, height,
			screen_id, screen_x, screen_y, screen_width, screen_height
		)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		panic(err)
	}

	stmtGet, err := db.Prepare(`
		SELECT x, y, width, height,
		       screen_id, screen_x, screen_y, screen_width, screen_height
		FROM window_state
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

	_, err := c.stmtStore.ExecContext(ctx, windowName,
		state.X, state.Y, state.Width, state.Height,
		state.ScreenID, state.ScreenX, state.ScreenY, state.ScreenWidth, state.ScreenHeight,
	)
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
	err := c.stmtGet.QueryRowContext(ctx, windowName).Scan(
		&state.X, &state.Y, &state.Width, &state.Height,
		&state.ScreenID, &state.ScreenX, &state.ScreenY, &state.ScreenWidth, &state.ScreenHeight,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	} else if err != nil {
		return nil, fmt.Errorf("failed to get window state for %s: %w", windowName, err)
	}

	return &state, nil
}
