-- Account identity moved from (renameable) account names to stable account IDs.
-- Cached rows are keyed by the old names and cannot be mapped to IDs from here,
-- so wipe them (everything re-syncs from IMAP) and rename the columns.

DELETE FROM folder_email_search;

DELETE FROM folder_email_attachments;

DELETE FROM folder_email_parts;

DELETE FROM folder_emails;

DELETE FROM folder_uids;

DELETE FROM account_references;

DELETE FROM account_lookups;

ALTER TABLE folder_emails RENAME COLUMN account_name TO account_id;

ALTER TABLE folder_uids RENAME COLUMN account_name TO account_id;

ALTER TABLE account_references RENAME COLUMN account_name TO account_id;

ALTER TABLE account_lookups RENAME COLUMN account_name TO account_id;

ALTER TABLE folder_email_parts RENAME COLUMN account_name TO account_id;

ALTER TABLE folder_email_attachments RENAME COLUMN account_name TO account_id;

ALTER TABLE folder_email_search RENAME COLUMN account_name TO account_id;
