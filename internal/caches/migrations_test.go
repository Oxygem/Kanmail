package caches

import (
	"database/sql"
	"path"
	"strings"
	"testing"

	"github.com/rs/zerolog"
)

// Replays the schema as it stood before 006 (account_name keyed), inserts rows
// under the old scheme, then opens Caches to run 006 - asserting the wipe, the
// column renames and that the FK cascade still works afterwards.
func TestMigration006WipesAndRenamesAccountColumns(t *testing.T) {
	dbPath := path.Join(t.TempDir(), "caches.db")
	db, err := sql.Open("sqlite3", dbPath+"?_foreign_keys=true")
	if err != nil {
		t.Fatal(err)
	}

	migrations, err := MigrationsFS.ReadDir("migrations")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE migrations (filename TEXT PRIMARY KEY) WITHOUT ROWID`); err != nil {
		t.Fatal(err)
	}
	for _, file := range migrations {
		if strings.HasPrefix(file.Name(), "006-") {
			continue
		}
		data, err := MigrationsFS.ReadFile(path.Join("migrations", file.Name()))
		if err != nil {
			t.Fatal(err)
		}
		for _, stmt := range strings.Split(string(data), ";") {
			if strings.TrimSpace(stmt) == "" {
				continue
			}
			if _, err := db.Exec(stmt); err != nil {
				t.Fatalf("replaying %s: %v", file.Name(), err)
			}
		}
		if _, err := db.Exec(`INSERT INTO migrations (filename) VALUES (?)`, file.Name()); err != nil {
			t.Fatal(err)
		}
	}

	if _, err := db.Exec(
		`INSERT INTO folder_emails (account_name, folder_name, uid, message_id, data) VALUES ('acct', 'INBOX', 1, '<1@test>', x'')`,
	); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(
		`INSERT INTO folder_uids (account_name, folder_name, uid_validity, uids_start_at, uids) VALUES ('acct', 'INBOX', 1, 1, x'')`,
	); err != nil {
		t.Fatal(err)
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}

	// Running 006 must not panic and leaves the renamed, emptied schema
	caches := NewCaches(zerolog.Nop(), dbPath)
	t.Cleanup(func() { caches.Close() })

	for _, table := range []string{
		"folder_uids", "folder_emails", "account_references", "account_lookups",
		"folder_email_parts", "folder_email_attachments", "folder_email_search",
	} {
		var count int
		if err := caches.db.QueryRow(`SELECT count(*) FROM ` + table).Scan(&count); err != nil {
			t.Fatalf("%s: %v", table, err)
		}
		if count != 0 {
			t.Fatalf("%s should be wiped, has %d rows", table, count)
		}

		var accountID int
		if err := caches.db.QueryRow(
			`SELECT count(*) FROM pragma_table_info(?) WHERE name = 'account_id'`, table,
		).Scan(&accountID); err != nil {
			t.Fatal(err)
		}
		if accountID != 1 {
			t.Fatalf("%s should have an account_id column", table)
		}
	}

	// FK cascade from folder_emails still intact post-rename
	if _, err := caches.db.Exec(
		`INSERT INTO folder_emails (account_id, folder_name, uid, message_id, data) VALUES ('id1', 'INBOX', 1, '<1@test>', x'')`,
	); err != nil {
		t.Fatal(err)
	}
	if _, err := caches.db.Exec(
		`INSERT INTO folder_email_search
			(account_id, folder_name, uid, subject, from_addrs, to_addrs, cc_addrs, excerpt, date_unix, seen, flagged)
			VALUES ('id1', 'INBOX', 1, '', '', '', '', '', 0, 0, 0)`,
	); err != nil {
		t.Fatal(err)
	}
	if _, err := caches.db.Exec(`DELETE FROM folder_emails`); err != nil {
		t.Fatal(err)
	}
	var count int
	if err := caches.db.QueryRow(`SELECT count(*) FROM folder_email_search`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatal("FK cascade should delete search rows with their parent email")
	}
}
