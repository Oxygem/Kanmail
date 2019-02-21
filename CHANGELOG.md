# v1.1902212035

This version brings aliases/addresses in the account settings.

Changes:
- Filter out empty contacts.
- Add address/contact management to the settings app.
- Formatting.
- De-dupe wide/half/quarter/etc styles.
- Add proper support for contacts in settings.

# v1.1902101127

Changes:
- Add error state to the send window/button.
- Improve performance of the contact multi-selects.
- Improve send window styles/consistency.

# v1.1902071755

Changes:
- Open the previous thread if there's no next thread.
- Make `get_parts` on the folder cache work if the headers don't exist.
- Handle/ignore dodgy contacts cache.
- Add hover state to threads w/error.

# v1.1812191114

Changes:
- Noop when drag + drop to the same column.
- Better wrapper for email content.
- Don't prepend `Re:` if the email subject already starts.

# v1.1811271504

Changes:
- Properly handle plain text email content.

# v1.1811162231

Changes:
- Finish setting up the new editor.
- Update yarn lock.
- Switch out `react-wysiwyg` for `react-quill`.
- You don't actually put the Bcc list in the email!

# v1.1811151944

Changes:
- Update dev docs.
- Add `--onefile` to build script.
- Make search useful:
- Link the alert icon to reload when we encounter JS/backend errors.
- Update docs.

# v1.1811131854

Changes:
- Add gmail app password info.
- Fix password input on account.
- Delete columns, icon on header meta hover.
- Validate settings values.
- Remove sync days from frontend as it's slower that fetching all, add danger zone icon/text to sync settings area.
- Fix sending emails by using SMTP username as from address (until accounts have addresses).

# v1.1811122107

Changes:
- Handle DNS failures properly in autoconf.
- Simplify the error page (message is useless).

# v1.1811111817

This version brings a full settings UI so there's no need to manually edit the JSON file.

Changes:
- Add flake8 and autoconfigure requirements.
- Formatting.
- Add `put` function and expand error handling to pass any data back from the server.
- Only allow one settings window open at once.
- Implement the settings app w/account add/remove and autoconfiguration!
- Add autoconf module to attempt to autoconfigure IMAP/SMTP settings.
- Add SMTP connection wrapper similar to the IMAP wrapper.
- Don't cache query folder UIDs.
- Don't alter account name.
- Add `sync_days` system setting.
- Format the folder message count.
- Set proper destination for changelog/license bundling.
- Fix search.

# v1.1811052202

Changes:
- Make the add column button usable.
- Handle null ref on the main column.
- Remove old prop type.
- Settings defaults.
- Add a screenshot!
- Use `Faker` for the fake imap.
- Remove unused function.
- Add settings docs and link to latest release.
- Improve release script changelog handling.
- Tidy up changelog/versions.
- Bump package versions.
- POST device ID & version to license server.
- Debug log when opening windows.
- Use `gnu-tar` rather than MacOS `tar` to avoid bundling extended attribute files.

# v1.1811031602

Changes:

- Don't assume the version file exists (non-release builds).
- Finish up release script and add new build/clean shortcut scripts.

# v1.1811031221

- A test release

# v1.1811021408

Changes:

- Better logging when version checking.
- Full stop changelog message.
- Update build script to always use `pyupdater`.
- Accept `KANMAIL_UPDATE_SERVER` and `KANMAIL_LICENSE_SERVER` envars in debug.
- Default loggers to WARN.

# v1.0

+ Welcome to the Kanmail v1 changelog
