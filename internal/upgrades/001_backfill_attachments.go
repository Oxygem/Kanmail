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

// backfillAttachments populates folder_email_attachments from existing
// folder_emails rows by decoding their gob blobs and indexing attachment-like
// parts. INSERT OR IGNORE makes the upgrade safe to re-run after a partial
// failure.
func backfillAttachments(ctx context.Context, c *caches.Caches) error {
	log := zerolog.Ctx(ctx)
	db := c.DB()

	rows, err := db.QueryContext(ctx, `
		SELECT account_name, folder_name, uid, data
		FROM folder_emails`)
	if err != nil {
		return fmt.Errorf("failed to query folder_emails: %w", err)
	}
	defer rows.Close()

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin tx: %w", err)
	}
	defer tx.Rollback()

	stmt, err := tx.PrepareContext(ctx, `
		INSERT OR IGNORE INTO folder_email_attachments
			(account_name, folder_name, uid, part_id,
			 content_type, filename, size, content_id)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		return fmt.Errorf("failed to prepare insert: %w", err)
	}
	defer stmt.Close()

	var emails, attachments int
	for rows.Next() {
		var accountName types.AccountName
		var folderName types.FolderName
		var uid uint32
		var data []byte
		if err := rows.Scan(&accountName, &folderName, &uid, &data); err != nil {
			return fmt.Errorf("failed to scan folder_emails row: %w", err)
		}

		var email types.Email
		if err := gob.NewDecoder(bytes.NewReader(data)).Decode(&email); err != nil {
			// One bad row shouldn't kill the whole upgrade.
			log.Warn().
				Str("account", string(accountName)).
				Str("folder", string(folderName)).
				Uint32("uid", uid).
				Err(err).
				Msg("Skipping un-decodable email during attachment backfill")
			continue
		}

		for _, part := range email.Parts {
			if part.Description == "" {
				continue
			}
			if _, err := stmt.ExecContext(
				ctx,
				accountName,
				folderName,
				uid,
				part.PartStr,
				part.Type,
				part.Description,
				part.Size,
				part.ContentID,
			); err != nil {
				return fmt.Errorf("failed to insert attachment row: %w", err)
			}
			attachments++
		}
		emails++
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iteration error: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit: %w", err)
	}

	log.Info().
		Int("emails", emails).
		Int("attachments", attachments).
		Msg("Attachment backfill complete")
	return nil
}
