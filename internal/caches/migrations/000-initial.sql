-- Account/folder -> cached UIDs (up to X)
CREATE TABLE folder_uids (
    account_name  TEXT NOT NULL,
    folder_name   TEXT NOT NULL,
    uid_validity  INTEGER NOT NULL,
    uids_start_at INTEGER NOT NULL,
    uids BLOB     NOT NULL,

    PRIMARY KEY (account_name, folder_name)
) WITHOUT ROWID;


-- Account/folder/uid -> email (meta/headers, enough to render folder)
CREATE TABLE folder_emails (
    account_name TEXT NOT NULL,
    folder_name  TEXT NOT NULL,
    uid          INTEGER,
    message_id   TEXT NOT NULL,
    data BLOB    NOT NULL,

    PRIMARY KEY (account_name, folder_name, uid)
) WITHOUT ROWID;
-- Index message ID -> email for quick reference lookups
CREATE INDEX idx_folder_emails_message_id ON folder_emails (message_id);


-- Account/origin messageID -> referencing messageID
CREATE TABLE account_references (
    account_name     TEXT NOT NULL,
    to_message_id    TEXT NOT NULL,
    from_message_id  TEXT NOT NULL,

    PRIMARY KEY (account_name, to_message_id, from_message_id)
) WITHOUT ROWID;


-- Account/messageid -> lookup time, used to cache no such email responses
CREATE TABLE account_lookups (
    account_name TEXT NOT NULL,
    lookup_key   TEXT NOT NULL,
    lookup_at    TIMESTAMP NOT NULL,

    PRIMARY KEY (account_name, lookup_key)
) WITHOUT ROWID;


-- Account/folder/uid/partid -> data
CREATE TABLE folder_email_parts (
    account_name TEXT NOT NULL,
    folder_name  TEXT NOT NULL,
    uid          INTEGER NOT NULL,
    part_id      TEXT NOT NULL,
    data         BLOB,

    PRIMARY KEY (account_name, folder_name, uid, part_id)
) WITHOUT ROWID;


-- Email -> contact metadata
CREATE TABLE contacts (
    email TEXT NOT NULL,
    name  TEXT NOT NULL DEFAULT '',

    created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    always_show_images BOOLEAN NOT NULL DEFAULT FALSE,

    PRIMARY KEY (email, name)
) WITHOUT ROWID;


-- Email -> avatar blob
CREATE TABLE email_avatars (
    email      TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    data      BLOB, -- nullable to indicate no icon found
    data_size INTEGER NOT NULL,
    data_type TEXT NOT NULL,

    PRIMARY KEY (email)
) WITHOUT ROWID;


-- License key check cache - key itself is stored in the users keyring
CREATE TABLE license_check (
    license_key_hash TEXT NOT NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    checked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (license_key_hash)
) WITHOUT ROWID;
