-- Tracks completed data upgrades (run by AppService.RunUpgrades on startup)
CREATE TABLE upgrades (
    name   TEXT      NOT NULL,
    run_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (name)
) WITHOUT ROWID;


-- Attachment metadata index, populated alongside folder_emails. Bytes still
-- live in folder_email_parts (lazy, on-demand). The index lets the
-- attachments app browse everything cached without decoding gobs.
CREATE TABLE folder_email_attachments (
    account_name TEXT    NOT NULL,
    folder_name  TEXT    NOT NULL,
    uid          INTEGER NOT NULL,
    part_id      TEXT    NOT NULL,

    content_type TEXT    NOT NULL,
    filename     TEXT    NOT NULL,
    size         INTEGER NOT NULL,
    content_id   TEXT    NOT NULL DEFAULT '',

    FOREIGN KEY (account_name, folder_name, uid)
    REFERENCES folder_emails(account_name, folder_name, uid)
    ON DELETE CASCADE,

    PRIMARY KEY (account_name, folder_name, uid, part_id)
) WITHOUT ROWID;
