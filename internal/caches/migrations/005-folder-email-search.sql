-- Denormalized search columns for local-first search, written alongside
-- folder_emails by Store/Replace and backfilled from existing gob blobs by
-- the 002-backfill-search-rows upgrade. Text columns are stored lowercased
-- (LIKE patterns are lowercased in Go for unicode case-insensitivity).
-- An email without a search row never matches a local search.
CREATE TABLE folder_email_search (
    account_name TEXT NOT NULL,
    folder_name  TEXT NOT NULL,
    uid          INTEGER,
    subject      TEXT NOT NULL,
    from_addrs   TEXT NOT NULL,
    to_addrs     TEXT NOT NULL,
    cc_addrs     TEXT NOT NULL,
    excerpt      TEXT NOT NULL,
    date_unix    INTEGER NOT NULL,
    seen         INTEGER NOT NULL,
    flagged      INTEGER NOT NULL,
    PRIMARY KEY (account_name, folder_name, uid),
    FOREIGN KEY (account_name, folder_name, uid)
        REFERENCES folder_emails (account_name, folder_name, uid)
        ON DELETE CASCADE
) WITHOUT ROWID;
