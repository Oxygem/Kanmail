package caches

import (
	"context"
	"fmt"

	"github.com/emersion/go-imap/v2"

	"github.com/oxygem/kanmail/internal/types"
)

type Attachment struct {
	AccountName types.AccountName `json:"accountName"`
	FolderName  types.FolderName  `json:"folderName"`
	UID         imap.UID          `json:"uid"`
	PartID      string            `json:"partID"`

	MessageID   string `json:"messageId"`
	ContentType string `json:"contentType"`
	Filename    string `json:"filename"`
	Size        int64  `json:"size"`
	ContentID   string `json:"contentID"`

	IsCached bool `json:"isCached"`
}

// ListByAccount returns one row per unique (message_id, part_id) — same email
// in multiple folders gets deduped. The caller can pick any of the underlying
// (folder, uid) pairs to fetch bytes; we pick one via MIN().
func (c *FolderEmailCache) ListByAccount(
	ctx context.Context,
	accountName types.AccountName,
) ([]Attachment, error) {
	if c.disabled {
		return nil, nil
	}

	rows, err := c.db.QueryContext(ctx, `
		SELECT e.message_id,
		       a.content_type, a.filename, a.size, a.content_id, a.part_id,
		       MIN(a.folder_name) AS folder_name,
		       MIN(a.uid) AS uid,
		       MAX(p.data IS NOT NULL) AS is_cached
		FROM folder_email_attachments a
		JOIN folder_emails e
		  USING (account_name, folder_name, uid)
		LEFT JOIN folder_email_parts p
		  USING (account_name, folder_name, uid, part_id)
		WHERE a.account_name = ?
		GROUP BY e.message_id, a.part_id`,
		accountName,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to list attachments: %w", err)
	}
	defer rows.Close()

	var out []Attachment
	for rows.Next() {
		var a Attachment
		a.AccountName = accountName
		if err := rows.Scan(
			&a.MessageID,
			&a.ContentType,
			&a.Filename,
			&a.Size,
			&a.ContentID,
			&a.PartID,
			&a.FolderName,
			&a.UID,
			&a.IsCached,
		); err != nil {
			return nil, fmt.Errorf("failed to scan attachment: %w", err)
		}
		out = append(out, a)
	}

	return out, rows.Err()
}
