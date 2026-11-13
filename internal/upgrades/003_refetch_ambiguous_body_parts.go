package upgrades

import (
	"bytes"
	"context"
	"encoding/gob"
	"fmt"

	"github.com/rs/zerolog"

	"github.com/oxygem/kanmail/internal/caches"
	"github.com/oxygem/kanmail/internal/types"
)

// refetchAmbiguousBodyParts drops cached emails whose text/HTML part selection
// may differ now that the first non-attachment part wins (previously the last
// part of each type won, attachments included). Cached parts don't record their
// disposition so any text part with a filename counts as a possible attachment.
// Dropped emails, along with their cached parts and excerpts, are refetched on
// next view.
func refetchAmbiguousBodyParts(ctx context.Context, c *caches.Caches) error {
	log := zerolog.Ctx(ctx)
	db := c.DB()

	type emailKey struct {
		accountID  types.AccountID
		folderName types.FolderName
		uid        uint32
	}

	rows, err := db.QueryContext(ctx, "SELECT account_id, folder_name, uid, data FROM folder_emails")
	if err != nil {
		return fmt.Errorf("failed to query folder_emails: %w", err)
	}
	defer rows.Close()

	var checked int
	var stale []emailKey
	for rows.Next() {
		var key emailKey
		var data []byte
		if err := rows.Scan(&key.accountID, &key.folderName, &key.uid, &data); err != nil {
			return fmt.Errorf("failed to scan folder_emails row: %w", err)
		}

		var email types.Email
		if err := gob.NewDecoder(bytes.NewReader(data)).Decode(&email); err != nil {
			log.Warn().
				Str("account_id", string(key.accountID)).
				Str("folder", string(key.folderName)).
				Uint32("uid", key.uid).
				Err(err).
				Msg("Skipping un-decodable email during body part refetch")
			continue
		}

		checked++
		if hasAmbiguousBodyParts(email.Parts) {
			stale = append(stale, key)
		}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iteration error: %w", err)
	}
	rows.Close()

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin tx: %w", err)
	}
	defer tx.Rollback()

	stmt, err := tx.PrepareContext(ctx, "DELETE FROM folder_emails WHERE account_id = ? AND folder_name = ? AND uid = ?")
	if err != nil {
		return fmt.Errorf("failed to prepare delete: %w", err)
	}
	defer stmt.Close()

	for _, key := range stale {
		if _, err := stmt.ExecContext(ctx, key.accountID, key.folderName, key.uid); err != nil {
			return fmt.Errorf("failed to delete email: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit: %w", err)
	}

	log.Info().
		Int("checked", checked).
		Int("deleted", len(stale)).
		Msg("Dropped cached emails with ambiguous body parts")
	return nil
}

func hasAmbiguousBodyParts(parts []types.BodyPart) bool {
	seen := make(map[string]bool, 2)
	for _, part := range parts {
		if part.Type != "text/plain" && part.Type != "text/html" {
			continue
		}
		if seen[part.Type] || part.Description != "" {
			return true
		}
		seen[part.Type] = true
	}
	return false
}
