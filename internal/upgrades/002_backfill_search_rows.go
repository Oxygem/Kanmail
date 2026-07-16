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

// backfillSearchRows populates folder_email_search from existing folder_emails
// rows by decoding their gob blobs. INSERT OR IGNORE plus the NOT EXISTS
// filter make the upgrade safe to re-run after a partial failure.
func backfillSearchRows(ctx context.Context, c *caches.Caches) error {
	log := zerolog.Ctx(ctx)
	db := c.DB()

	rows, err := db.QueryContext(ctx, `
		SELECT account_name, folder_name, uid, data
		FROM folder_emails AS e
		WHERE NOT EXISTS (
			SELECT 1 FROM folder_email_search AS s
			WHERE s.account_name = e.account_name
				AND s.folder_name = e.folder_name
				AND s.uid = e.uid)`)
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
		INSERT OR IGNORE INTO folder_email_search
			(account_name, folder_name, uid,
			 subject, from_addrs, to_addrs, cc_addrs, excerpt, date_unix, seen, flagged)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		return fmt.Errorf("failed to prepare insert: %w", err)
	}
	defer stmt.Close()

	var emails int
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
				Msg("Skipping un-decodable email during search backfill")
			continue
		}

		search := caches.MakeEmailSearchColumns(&email)
		if _, err := stmt.ExecContext(
			ctx,
			accountName,
			folderName,
			uid,
			search.Subject,
			search.FromAddrs,
			search.ToAddrs,
			search.CCAddrs,
			search.Excerpt,
			search.DateUnix,
			search.Seen,
			search.Flagged,
		); err != nil {
			return fmt.Errorf("failed to insert search row: %w", err)
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
		Msg("Search row backfill complete")
	return nil
}
