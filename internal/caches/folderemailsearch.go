package caches

import (
	"bytes"
	"context"
	"encoding/gob"
	"strings"

	"github.com/emersion/go-imap/v2"
	"github.com/rs/zerolog"

	"github.com/oxygem/kanmail/internal/types"
)

// likePattern builds a substring LIKE pattern, lowercased to match the stored
// search columns and escaped for use with ESCAPE '\'
func likePattern(term string) string {
	escaped := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(strings.ToLower(term))
	return "%" + escaped + "%"
}

const searchTextSQL = `(s.subject LIKE ? ESCAPE '\'` +
	` OR s.from_addrs LIKE ? ESCAPE '\'` +
	` OR s.to_addrs LIKE ? ESCAPE '\'` +
	` OR s.cc_addrs LIKE ? ESCAPE '\'` +
	` OR s.excerpt LIKE ? ESCAPE '\')`

// No bcc column exists (bcc is folded into cc_addrs at store time), so bcc searches are
// untranslatable and fall through to the server rather than returning cc false-positives
var searchHeaderColumns = map[string]string{
	"subject": "s.subject",
	"from":    "s.from_addrs",
	"to":      "s.to_addrs",
	"cc":      "s.cc_addrs",
}

const searchAttachmentSQL = `EXISTS (
	SELECT 1 FROM folder_email_attachments AS a
	WHERE a.account_name = s.account_name
		AND a.folder_name = s.folder_name
		AND a.uid = s.uid)`

// translateSearchCriteria converts IMAP search criteria into a parameterized
// SQL fragment over the folder_email_search table (aliased s). ok=false means
// part of the criteria has no local translation and the search should return
// nothing rather than a wrong preview - the server search still runs.
func translateSearchCriteria(criteria *imap.SearchCriteria) (string, []any, bool) {
	if len(criteria.SeqNum) > 0 || len(criteria.UID) > 0 ||
		len(criteria.Body) > 0 || len(criteria.Or) > 0 ||
		criteria.Larger != 0 || criteria.Smaller != 0 ||
		criteria.ModSeq != nil || criteria.GmailRaw != "" {
		return "", nil, false
	}

	var conds []string
	var args []any

	for _, text := range criteria.Text {
		pattern := likePattern(text)
		conds = append(conds, searchTextSQL)
		args = append(args, pattern, pattern, pattern, pattern, pattern)
	}

	for _, header := range criteria.Header {
		key := strings.ToLower(header.Key)
		if key == "content-type" && strings.EqualFold(header.Value, "multipart/mixed") {
			// has:attachment - the local attachments index is exact, unlike
			// the content type approximation sent to non-Gmail servers
			conds = append(conds, searchAttachmentSQL)
			continue
		}
		column, known := searchHeaderColumns[key]
		if !known {
			return "", nil, false
		}
		conds = append(conds, column+` LIKE ? ESCAPE '\'`)
		args = append(args, likePattern(header.Value))
	}

	if !criteria.Since.IsZero() {
		conds = append(conds, "s.date_unix >= ?")
		args = append(args, criteria.Since.Unix())
	}
	if !criteria.SentSince.IsZero() {
		conds = append(conds, "s.date_unix >= ?")
		args = append(args, criteria.SentSince.Unix())
	}
	if !criteria.Before.IsZero() {
		conds = append(conds, "s.date_unix < ?")
		args = append(args, criteria.Before.Unix())
	}
	if !criteria.SentBefore.IsZero() {
		conds = append(conds, "s.date_unix < ?")
		args = append(args, criteria.SentBefore.Unix())
	}

	flagConds := func(flags []imap.Flag, value string) bool {
		for _, flag := range flags {
			switch flag {
			case imap.FlagSeen:
				conds = append(conds, "s.seen = "+value)
			case imap.FlagFlagged:
				conds = append(conds, "s.flagged = "+value)
			default:
				return false
			}
		}
		return true
	}
	if !flagConds(criteria.Flag, "1") || !flagConds(criteria.NotFlag, "0") {
		return "", nil, false
	}

	for _, not := range criteria.Not {
		notWhere, notArgs, ok := translateSearchCriteria(&not)
		if !ok {
			return "", nil, false
		}
		conds = append(conds, "NOT ("+notWhere+")")
		args = append(args, notArgs...)
	}

	if len(conds) == 0 {
		return "1=1", nil, true
	}
	return strings.Join(conds, " AND "), args, true
}

// Search returns cached emails in a folder matching the criteria, newest
// first. Returns nil (no error) when the cache is disabled or the criteria
// can't be translated to SQL.
func (c *FolderEmailCache) Search(
	ctx context.Context,
	accountName types.AccountName,
	folderName types.FolderName,
	criteria *imap.SearchCriteria,
	limit int,
) ([]*types.Email, error) {
	if c.disabled {
		return nil, nil
	}

	where, whereArgs, ok := translateSearchCriteria(criteria)
	if !ok {
		return nil, nil
	}

	query := `
		SELECT e.data FROM folder_email_search AS s
		JOIN folder_emails AS e ON
			e.account_name = s.account_name
			AND e.folder_name = s.folder_name
			AND e.uid = s.uid
		WHERE s.account_name = ? AND s.folder_name = ? AND (` + where + `)
		ORDER BY s.date_unix DESC
		LIMIT ?`

	args := make([]any, 0, len(whereArgs)+3)
	args = append(args, accountName, folderName)
	args = append(args, whereArgs...)
	args = append(args, limit)

	rows, err := c.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var emails []*types.Email
	for rows.Next() {
		var data []byte
		if err := rows.Scan(&data); err != nil {
			return nil, err
		}
		var email types.Email
		if err := gob.NewDecoder(bytes.NewReader(data)).Decode(&email); err != nil {
			zerolog.Ctx(ctx).Warn().Err(err).Msg("Skipping un-decodable email in search")
			continue
		}
		emails = append(emails, &email)
	}
	return emails, rows.Err()
}
