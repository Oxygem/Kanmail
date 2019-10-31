# Syncing

Kanmail syncs email using the IMAP protocol. Instead of implementing a "complete sync engine" (one which attempts to keep a local copy of the server data), Kanmail uses a cache and loads data on demand. This simplifies the implementation but makes it hard/impossible to behave as an offline email client.

Kanmail keeps in sync with the remote server by checking UID lists. These are cached locally and every "sync" the full list is refreshed, ensuring the local copy is up to date with the server UID list. Email headers are cached against their UIDs.

Currently no actual full email data is cached, only the headers. Meaning when offline Kanmail will load any cached threads into the column view, but it won't be able to open any of these threads.

## Initial load (get emails)

When Kanmail starts, the UI attempts to get emails for each folder (both columns and "core" folders like archive/drafts) - this API endpoint is always expected to return a valid response, even if empty, and does not require connectivity. If there is a local cache of UIDs and email headers, these will be returned.

Subsequent calls to this API endpoint will load more emails, loading headers from the server as required.

## Updates (sync emails)

During the lifetime of a running Kanmail app it will periodically request to sync emails with the server. At this time the full UID list is reloaded from the server (failing if offline) and any new email headers are fetched. This endpoint returns new emails and the UIDs of any deleted emails from the UID list.
