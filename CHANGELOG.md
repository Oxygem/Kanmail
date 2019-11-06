# v1.1911061838

Changes:
- Capture and attempt to base64 decode line by line if full text is partial.
- Look at part `1.1` if `1` doesn't exist (multipart excerpt support).
- Strip style tags that contain background images.
- Remove background images in emails.
- Remove srcsets when replacing images w/buttons.
- Fix inline images by removing <> tag wraps.

# v1.1911011831

Changes:
- Stop removal of UIDs on move/delete emails, handled by sync.
- Capture `ImapClientError` when checking if a folder exists.
- Improve handling of select/unselect folder errors.
- Upgrade to pywebview 3, with some additions.
- Remove use of `six` + requirement.
- Expand the sycning docs.
- Add some basic syncing docs.
- Handle failed thread loading state.
- Ensure, on get folder emails, we *always* return.
- Fix indent.
- Make the archive/star/trash thread buttons nicer colours.
- Implement & undo `getDerivedStateFromProps` replacement for `componentWillReceiveProps`.
- Fix new account testing by providing an account name.
- Fix thread positioning with 4+ columns.
- Fix message meta/buttons being unclickable.
- Doesn't work because the webserver cannot open windows, ugh!

# v1.1910250852

Changes:
- Improve backend network errors by including the account.
- Improve layout/styling of errors.
- Store new errors at the *start* of the lists.
- Re-add `clearNetworkErrors` function.
- Implement full dev reloading.

# v1.1910232049

Changes:
- Replace `Connection.connection` with `Connection.config`.
- Fix attribute access.
- Improve tracking+display of network/request errors.
- Use a `Lock` instead of `RLock` for class locking.
- Overhaul connection logging and make logs consistent.

# v1.1909052150

Changes:
- Split checking whether a folder exists from fetching UIDs.
- Implement left/right buttons on column header to re-order columns (excluding main).

# v1.1908300907

Changes:
- Remove restart link as it still doesn't bloody work.

# v1.1908300715

Changes:
- Add ping endpoint and don't create the main window until it responds.
- Import settings variables rather tha module.
- Consistent function names.
- Change the frontend to show a restart button on update download.
- Implement `restart_device` w/API endpoint.

# v1.1908290941

Changes:
- Decode bytes values.

# v1.1908250954

Changes:
- Decode all headers.
- Remove unused import.

# v1.1908141956

Changes:
- Fix attachments missing.

# v1.1908141947

Changes:
- Add all non-text/html objects as attachments.
- Include `X-Mailer` header in emails.
- Remove floats in threads to fix layout.
- Add new yarn lockfile.
- Remove `parcel-bundler` dependency.

# v1.1907261109

Changes:
- Fixup selecting a folder in IMAP connections.
- Render network erros in sidebar header.
- Store network errors (503) separately to other request errors.

# v1.1907220932

Changes:
- Fix and tidy up trashing/archiving/moving of email threads.
- Fix IMAP connection retrys.
- Fix bug when trying to remove a message that doesn't exist.
- Fix fake boxy text (return string not list).
- Tidy up fake fetch key handling.
- Never disable the UID validity cache.

# v1.1906061816

Changes:
- Ignore invalid keys when parsing `BODYSTRUCTURE`.
- Fixup requirements for dodgy packages.

# v1.1906051011

This version adds support for sending attachments and syncing email reads!

Changes:
- Fetch the first 1024 bytes of the body.
- Strip headers/duplicate lines when parsing excerpt.
- Fix downloading text files/content.
- Improve parsing of bodystructure attachments on Outlook.
- Implement sending attachments.
- Use `EmailMessage` (py3.6+) over `MIMEMultipart`.
- Only fix if we have UIDs.
- Ensure UID count is an integer.
- Restore the `PUT` update settings endpoint.
- Add refresh button to email column header.
- Implement checking for read emails on the server.
- Re-add UID count checking on sync when moving between folders.
- Only sync unreads for the open main column.
- Prepare email stores to sync unreads.
- Move sync days out of advanced settings.
- When a thread is open and we receive an update, reload it and mark emails read.
- Don't assume we have content IDs/part headers.
- Improve error formatting.
- Default filenames to an empty list.
- Retry when IMAP server misses parts.
- Separate loading a thread from opening it, enabling reloads.

# v1.1905211057

Changes:
- Add `/select-files` endpoint in prep for sending attachments.
- Tidy up view methods.
- Fix reply quotes now we have both html+text emails.

# v1.1905201255

Changes:
- Add untested Linux/Windows requirements.
- Ask where to save attachments to and reflect this in the UI.
- Add save/open dialog helpers to window module.

# v1.1905181142

Changes:
- Raise the first of any exceptions when executing threaded functions.
- Only re-cache UIDs if changed.
- Capture/wrap IMAP connection errors and handle in error view.
- Get account capabilities on demand.

# v1.1905171913

Changes:
- Provide feedback when updating and render the correct version.
- Return something from the update view.
- Don't auto restart after updating.

# v1.1905152003

Changes:
- Huge improvement to parsing of `BODYSTRUCTURE`.
- Add bust cache button to advanced settings.
- Add API to delete caches.
- Only bust cache if we had a UIDVALIDITY.
- Add `delete` method to requests util.
- Hide advanced settings behind a toggle.
- Don't hide images included as attachments - only remote images.
- Fix bug in re-opening settings window.
- Up default undo ms to 5000.
- Add `sync_interval` setting.

# v1.1905141947

Changes:
- Add a `--build-only` flag to the release script.
- Use more appropriate exceptions in the release script.
- Include version number in the JS bundle.
- De-dupe view data.

# v1.1905141113

Changes:
- Extend clean script to remove any incomplete builds/changelog.
- Properly prevent images from loading until explicitly allowed.
- Tidy up.
- Upgrade `pyupdater` and remove symlink hack.
- Markdownify the text version of emails.
- Show both plaintext and HTML (default) versions of emails.
- Hide images by default with toggles to show.

# v1.1905091719

Changes:
- Fix column meta clashes by tracking number of syncs/loads.
- Move email stores back inside stores folder.
- Fix syncing when UID validity has changed.

# v1.1905051259

Changes:
- Limit the number of parallel requests executed via the `requestStore`.
- Bump throttling of column scroll to 1000.
- Fix wrong variable when markdownifying text data.
- Fix create/destroy window issues.
- Make sure main/search email stores don't clash when updating loading icons.

# v1.1905012055

Changes:
- Improve how column meta is handled by the email stores.
- Throttle onscroll loading of more emails.
- Implement message forwarding.
- When UID validity changes - don't fetch all messages at once!
- Return both HTML and plaintext when fetching email texts.
- Improve order of methods on `Folder`.
- On changing `system.sync_days` setting, bust UID list caches and account folders.
- Add `reload_main_window` function to window module.
- Add `reset` method to `Account` and function to reset all accounts.
- Add function to bust all UID list caches.
- Add missing return on close window view.
- Move all `IS_APP` window controls to the window module.
- Separate UID validity caching from UID lists.
- Return a list of changed keys when updating settings.
- Add sync days to settings.
- Add default `sync_days` value (0 for all).
- Ensure the app/cache directories exist before setting up logging.
- Remove old static directory data from build script.
- Include pyupdater s3 extras.
- Pass signals to the executable not bootloader.
- Update dev requirements.

# v1.1904292053

Changes:
- Use the new close window API instead of `window.close`.
- Run `sys.exit` after main window close.
- Implement close window API (`window.close` no longer works).
- Add development requirements.
- Tuples > lists.
- Linting.
- Upgrade to pywebview 2.4 (ish).
- Don't render threads over the sidebar.
- Fix window width variable (new webkit changes).
- Tidy up/sort base requirements.
- Fix pyupdater broken dependency.
- Add missing fonts: `roboto` and `roboto-slab`.
- Move `static` -> `fonts`.

# v1.1904042139

This version is the first to be tested with Outlook, and includes a number of related fixes.

Additionally emails are now moved between folders as you would expect, rather than a mix of copy & move.

Changes:
- Better handle different mail servers when parsing bodystructure.
- Fix folder refresh and running w/o cache.
- Correct call to get IMAP connection.
- Reimplement `Folder.reset` and handling `Folder.exists`.
- Add tls checkbox to the account settings component.
- Always set ssl/tls during autoconf.
- Improve the connection debug logs.
- Change to *move* emails between columns.
- Always move emails, don't copy between folders.
- Remove the link between main column and others.

# v1.1903011133

Changes:
- Fix replying to emails sending from the wrong account.

# v1.1902221908

Changes:
- Ensure threads in the folder columns do not appear in the main column.

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
