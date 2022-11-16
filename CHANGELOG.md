# v1.2211160838

Small batch of bugfixes.

Changes:
- Fetch whole body rather than just 1024 bytes for excerpt
- Don't assume we have a part when parsing bodystructure
- Don't fail when bodystructure missing from email response
- Fix call to UID set during missing fix
- Don't throw sentry errors for not found accounts
- Don't fail when removing an already removed oauth req
- Allow disabling session token via env var
- Fix typo
- Use new notarytool for MacOS codesigning
- Docker fixes
- Update poetry lock

# v1.2208011017

Thing release fixes a bunch of issues with search, which should now function
as expected.

Also included are unread counts on the sidebar, and on MacOS the an initial
implementation of notifications for new emails and badge counts.

Changes:
- Fix JSON in HTML attributes
- Display search match counts in sidebar folder links
- Remove redundant assignment
- Setup prettier with eslint
- Git blame ignore prettier commit
- Install & run prettier on all JS(X)
- Use cache to indicate if a folder exists, or used to exist, on start
- Style fixes for search mode & sidebar
- Refactor handling of email store search mode/control
- Remove beta text in sidebar
- Use bundled certifi CA file for SSL IMAP & SMTP connections
- Misc cleanup & logging improvements
- Send notifications for newly synced inbox emails
- Show unread badge & inbox sidebar link counts
- Add notification API & implement MacOS notifications
- Add debug log at the end of route handling
- Use sentinel object to detect missing values
- Cleanup old requirements code
- Add `.git-blame-ignore-revs` file
- Use poetry for Python dependency management
- Run black & isort
- Move window file into module
- Use common prefix for window management endpoints
- Update MacOS dev requirements

# v1.2206171827

Changes:
- Fix Windows builds temporary workaround for choco
- Update changelog for v1.2206171656
- Fix editing emails without quotes
- Fix email send & save button handling / API
- Pin `dsdev-utils` package to avoid bug
- Fix cryptography version in Docker requirements
- Cleanup changelog commit message

# v1.2206171656

Changes:
- Fix editing emails without quotes
- Fix email send & save button handling / API
- Pin `dsdev-utils` package to avoid bug
- Fix cryptography version in Docker requirements
- Cleanup changelog commit message

# v1.2205081824

Slow release to get out this one due to unforseen complications with Windows
testing. Next up focus is on the Windows version including a proper installer.

Changes:
- Only run Linux tests with xvfb
- Bump python version file
- Run the tests with xvfb on Linux
- Add FUNDING config
- Cleanup of build action, start building Linux again
- Install webview2-runtime on Windows before build
- Only run requirements workflow on req file change
- Make pytest verbose
- Use Python 3.8 for Windows builds
- Use platform specific requirements for build
- Add compiled development requirements
- Update compiled requirements
- Upload compiled requirements as artifacts
- Upgrade to python v3.9.12
- Don't throw error for bug in pyupdater refresh method
- Fixup requirement versions
- Run requirements compilation on main branch
- Upgrade pip before compiling requirements
- Upgrade Windows version in workflows
- Add requirements compile workflow
- Upgrade to pywebview 3.6
- Generate development requirements each platform
- Pass session token to newly opened windows in browser mode
- Capture `IMAP4.Abort` errors
- Add a basic docker-compose.yml for deployment convenience
- Add options to deactivate external APIs + opt-out for update
- Rework emails API to work around flask/werkzeug path handling fails
- Improve handling of body IMAP responses
- Stop sending JS `RequestError`s to Sentry that the server already handled
- Include tracebacks for all error logs
- Fix offline not loading cached date
- Don't fail folders endpoint for individual account issues
- Add notarize team ID support/envvar.

# v1.2201182059

More fixes for Outlook accounts.

Changes:
- Always fetch IMAP capabilities when opening new connections.
- Fix support for IMAP servers that still don't support UTF-8 (Outlook).

# v1.2201151710

This release fixes SMTP with Outlook accounts.

Changes:
- Re-implement the "copy from inbox" feature.
- Bring in Python 3.8 SMTP fix.

# v1.2112242054

Changes:
- Fix mixin import.
- Handle when a remote build is missing and optionally continue.
- Fix make github release function.

# v1.2112131141

Changes:
- Ensure we load meta files with utf8 encoding.
- Strip off git tag v prefix.
- Fix call to docker tag.

# v1.2112121539

This release adds support for signatures and huge improvements to the send message editor.

Changes:
- Remove unused release script.
- Don't check session token on index in non-app mode.
- Always create column + meta stores.
- Implement link entities in the editor component using control input.
- Make control input component/store more flexible.
- Only generate text as HTML if there's text data.
- Rewrite email send app.
- Fix contact delete button.
- Separate text from HTML-ified text in messages.
- Fix loading folders after initial app start.
- Add some basic styles to the drafttail editor.
- Add draft-js and remove quill.
- Add signatures to the settings model.
- Add signatures to settings.
- Fix using false boolean in class name.
- Complete conversion of account list to use overlay list base.
- Don't allow saving account form with an empty name.
- Extract common editor component parts.
- Extract common list overlay component methods.
- Add basic app run test.
- Improve exit handling in main script.
- Add test stage before building.
- Disable Linux build/test for now.
- Bump ipython dev requirement.
- Add pytest dev requirement.
- fix config volume permission issues

# v1.2110131703

Contains an urgent fix for the latest Windows build.

Changes:
- Finish complete release script.
- Tolerate wobbly MacOS notarization process.
- Update Windows requirements.
- Update dev requirements.

# v1.2110040834

Changes:
- Make build commmand work on Windows.
- Fix `check_output` call.
- Remove leftover temp version lock references.
- Cleanup version release handling.
- Add attachments to IMAP connection mock bodystructure output.
- Improve formatting of bytes in attachments.
- Run build work flow on push & tag.
- Cleanup account form styling.
- De-duplicate account settings state handling functions.
- Bump to upstream pywebview commit (MacOS reqs only for now).
- Run the build workflow on main branch.
- Update MacOS requirements.
- Add the latest docker tag when making a release.
- Fix add contact form styles.
- Hide any overflow on email thread avatar initials.
- Merge the main + user folders in the sidebar.
- Improve account settings error handling UX.
- Don't pass `false` as a classname, use undefined.
- Fix button & form styling bugs in contacts app.
- Fix two bugs in the connection mocks.
- Add compact columns style/setting.
- Fix prop type validation on tooltip components.
- Don't assume the inbox alias setting exists.
- Add licensed settings to disable Sentry/Posthog.
- Fix account name validation.
- Update for pywebview 3.5.
- Use git version of pywebview with bugfix.
- Fixes for building Linux client in Docker.
- Add comment for MacOS Python package install/build.
- Use github path to fix macOS path.
- Try to fix macOS path before building.
- Don't use `pip-tools` in builds just normal pip reqs.
- Use python3/pip3 commands.
- Install macOS pkg with old macosx SDK target.
- Pin specific commits for third party actions.
- More fixes for the binary filtering in spec.
- Fix indentation in spec file.
- Update docker reqs & fix Docker builds.
- Update spec exclusion of libraries.
- Install gtk/cairo/webkit apt packages when building for Linux.
- Downgrade werkzeug in linux requirements.
- Set `MACOSX_DEPLOYMENT_TARGET=10.14` in build workflow.
- Add Linux build & requirements.
- Ensure clean script removes any release changelog file.
- Add macOS build target.
- Cleanup build action.
- Use Windows server 2016.
- Use matrix strategy for build action.
- Add fake pyu config for GitHub builds.
- Upload the build to S3 once complete.
- Pass through secrets when building the app.
- Make an empty `.pyupdater` directory before building.
- Setup Windows build workflow.
- Add Windows `pywin32` requirement.

# v1.2107311301

Changes:
- Return & display error information when fetching email texts.
- Handle update errors in the UI.
- Fix handling account UI when failing to auto setup a new acccount.
- Improve error when we autoconf but login still fails.
- Add temporary handling of missing header errors.
- Switch to the GitHub hosted ISPDB.
- Capture & log request errors contacting the ISPDB.
- Restore auto creation of GitHub releases.
- Fix pywebview debug in window hacks.
- Wait before starting to check for notarization status.
- Replace invalid header characters when decoding.
- Catch and log request errors fetching contact icons.
- Add `pywin32` Windows requirement.

# v1.2107081657

Changes:
- Cleanup request error handling.
- Set release for Sentry.
- Log which app was loaded to PostHog.
- Capture/handle OAuth request errors properly.
- Pass through `werkzeug.HTTPException` errors properly.
- Ignore missing folder UID lists in cleanup.
- Pass utf-8 charset when searching against the server.
- Don't attempt to decode null data.
- Don't raise error when server returns less than expected messages.
- Don't delete oauth responses until tested.

# v1.2107031449

Changes:
- Bump pyupdater to v4.
- Update Windows requirements.
- Only run `pip-sync` during release builds.
- Don't mangle names when compiling JavaScript.
- Fix path fields in pyupdater spec template.
- Fix bug where changing account name breaks cached headers.
- Fix handling of different return IMAP keys.
- Fix logo on meta window.
- Downgrade to python3.8.

# v1.2107011421

Big release, top highlight is Google OAuth integration enabling "sign in with Google".

Changes:
- Fix email header response parsing for Zoho mail.
- Use one `criticalRequestNonce` per thread load.
- Fixup build instructions for M1 Macs.
- Pass Posthog settings to base template.
- Reoder window settings.
- Throw a proper error if no root element is found.
- Add Posthog JS to capture app load events & settings.
- Add debug sentry flag.
- Add random device IDs to add to Sentry/Posthog events.
- Use a `TimedRotatingFileHandler` instead of `FileHandler`.
- Fix missing response on OAuth delete response API.
- Update MacOS compiled pip requirements.
- Remove `object-hash` JS requirement.
- Use an incremental critical request nonce to fix weirdness.
- Re-ehlo before attempting to re-auth when refreshing OAuth token for SMTP.
- Fix missing favicon in builds.
- Delete OAuth responses only after they're handled.
- Rework session token route wrapper.
- Use warning log for view network exceptions.
- Don't send sentry JS errors for network errors.
- Cleanup request error handling.
- Bump defusedxml to v0.7.0.
- Fix license error response message key.
- Make new account flow always same width.
- Hide any previous account error when we connect.
- Fix connected text on welcome settings.
- Improve license error message.
- Cleanup license content before parsing.
- Don't log refresh tokens.
- Capture OAuth errors and refresh the access token.
- Fix missing sentry sdk MacOS requirement.
- Implement bundling of "hidden" data when building.
- Update text when failing to connect to OAuth accounts.
- Move settings errors into dedicated message element.
- Hide username & password when editing OAuth accounts.
- Use hint to fix connected/not connected text in account settings.
- Provide hint on whether an account is connected in settings UI.
- Properly abort when checking for duplicate account names.
- Hide password field when editing OAuth email accounts.
- Add setting migration for removal of `copy_on_move`.
- Only hide archive when showing other tags a thread has.
- Highlight trashed messages in thread view.
- Get Google OAuth settings from hidden data.
- Fix SMTP oauth2 authentication string/process.
- Don't assume oauth responses contain a (new) refresh token.
- Limit the max width of the new account form.
- Use "sign in with Google" language.
- Add cancel button when waiting for oAuth consent.
- Remove Google app password information.
- Add oauth settings for gmail.
- Implement OAuth based authentication for IMAP/SMTP connections.
- Add OAuth handlers, API and support to accounts/settings APIs.
- Don't add password setting during autoconfiguration.
- Implement OAuth new account form in settings app.
- Tidy up tag listing in email column threads.
- Use `json.load` > `json.loads`.
- ADd Sentry to the frontend.
- Add Sentry to the backend server.
- Add "hidden" data at build time.
- Sync sidebar folders by default.
- Move all regular interval email syncs to the main component.
- Render other folders as labels in threads.
- Remove complicated "copy on move" feature.
- Fix sidebar header buttons when frameless.
- Add tooltips w/keyboard shortcuts to header search/compose buttons.
- Add c keyboard shortcut to open a new compose window.
- Rework keyboard shortcut handling to work with combinations.
- Add s keyboard shortcut to star/unstar threads.
- Change the search keyboard shortcut from s -> /.
- Add move button to threads, remove explicit copy shortcut.
- Use self closing tags for icons.
- Correct unstar button tooltip text.
- Make it possible to hide the main column.
- Enable save sent copies setting by default unless gmail.
- Add delete on trash setting.
- Move pyinstaller/pyupdater into base requirements.
- Prevent paths being passed as download filenames.
- Add delete emails server API.
- Filter threads in the trash column to only show trashed messages.
- Add email store `deleteEmails` function.
- Show a star on starred threads (not just hover!).
- Add tooltips to the thread buttons.
- Add permanent delete button to threads in the trash folder.
- Reimplement the tooltip in JavaScript.
- Only trigger stale labels on unassigned bugs.
- Upgrade pyinstaller & flake8 dev requirements.
- Upgrade pyobjc to 7.2.
- Upgrade to Python 3.9.
- Use node 16.
- Upgrade yarn packages.
- Fix webpack argument order.
- Remove no longer needed MacOS build fixes.

# v1.2104091748

Big release containing many bug fixes and performance improvements. Major feature
is a new, simplified setup account flow.

Changes:
- Fix docker builds.
- Upgrade/audit yarn packages.
- Fix updating accounts missing account index ID.
- Better label for the account display name.
- Don't allow adding accounts with no display name.
- Better prop name for adding new account flag.
- Tidy up new account form buttons.
- Fix Windows ico file.
- Fix up last release changelog (Windows only).
- Restore absolute path for make constants.
- Formatting clean script imports.
- Run `pip-sync` before building.
- Fixup readme information.
- Use `pip-tools` to manage requirements.
- Fix window open URL server & host.
- Move to Open Sans font and cleanup typography.
- Fix license text issues.
- New (final) icons.
- Remove unncessary resize on settings window load.
- Fix meta file header icon position.
- Add links to iCloud/Google app password documentation pages.
- Update to new logo.
- Improve style of the error boundary.
- Implement app loading initial page content.
- Remove unused state variables.
- Use `cheroot` server in production/app mode.
- Update account API path for consistency.
- Don't require a Docker image to release.
- Add two-phase new account form.
- Return back whether autconf was successful in account test API.
- Allow frontend to specify domain to autoconf.
- Add type hints to autoconf module.
- Enable passing a specific domain into `get_autoconf_settings`.
- Add per-domain hard-coded connection settings for  main providers.
- Setup theme CSS for settings app.
- Add default (true) for SSL verify hostname connection setting.
- Disable resize on meta window.
- Reduce default window width.
- Confirm before closing settings window.
- Tidy up contacts app header.
- Remove loader background color.
- Update settings app to use tabbed design.
- Fix error handling contact emails without `@`.
- Provide `Message-ID` when creating messages to send.
- Add `resizable` & `confirm_close` options when opening windows.
- Add resize window API/util.
- Remove unused minimize/maximize window API/functions.
- Rework themes to use variables, one common set of styles.
- Add header button set / active styles.
- Don't assume emails have a message ID.
- Use the same JS files in all modes in the base template.
- Restore old static folder location.
- Use `url_for` in frozen (app) static redirect.
- Add `/favicon.ico` endpoint.
- Install `cargo` to fix `cryptography` compilation.
- Batch save contacts from multiple messages together.
- Fix bug in saving contacts.
- Fix keyboard shortcuts remaining disabled after searching.
- Use the latest external email for thread avatars.
- Add favicon for browser mode.
- Fix static folder path.

# v1.2103140902

Windows only release, fixing pywebview issues.

Changes:
- Upgrade to pywebview `3.4`.
- Implement custom `smtplib` override to enable Unicode passwords.
- Updated screenshot.
- Debounce the main process emails function.
- Use `ReactDOM.unstable_batchedUpdates` to batch email updates.
- Use the icon from the client assets in readme.
- Tidy up docstring.

# v1.2101301934

This release adds support for IMAP namespaces.

Changes:
- Update folder settings when creating a new account.
- Add folder prefix to account settings.
- Implement proper IMAP namespace handling.
- Rewrite account test API to use an exception for errors.
- Fix margin on welcome settings header.
- Don't lookup the same domain twice in autoconf.

# v1.2101211835

This releases introduces a major design overhaul and cleanup, with dark
mode support. Check out the settings to pick default, light or dark 
theme settings.

Changes:
- Correct thread title border colour in default/light themes.
- Fix thread message border in dark theme.
- Only add dark mode event listener if supported.
- Fixes for dark theme colours.
- Tweak contacts header search bar margin.
- Sort merged single sender threads properly.
- Make control overlay text bigger.
- Combine if statements.
- Add theme class after removing old one (in case same).
- Add dark/light theme settings.
- Fix 1px extra margin error on main column.
- Tidy up headers, make buttons not drag window.
- Add avatars to contact list.
- Rework Cocoa traffic light button repositioning.
- Dramatically improve the fake IMAP response content.
- Never enable caching if we're using fake IMAP responses.
- Always sync trash folder, as may contain thread messages.
- Re-order main alias folder sidebar ordering.
- Improve date formatting for this-year dates.
- Increase text size of meta/meta-file apps.
- Don't attempt to make drag region on non-element.
- Improve short address formatting.
- Add dark/light theme settings to the setting model.
- Setup dark/light theme switching and activation on app boot.
- Remove Robot slab import.
- Tidy up column email design/layout.
- Add settingsStore to window for debugging.
- Import the new dark/light themes.
- Ensure tooltips always appear on top.
- Move thread sidebar width into less variable.
- Allow open column to be larger and detect/fix main column width.
- Set frameless/wrapper classes in generic app boot.
- Add "s"/escape keyboard shortcut to open/close search.
- Move search out of sidebar and above the columns.
- Tidy up sidebar icons, make spam yellow.
- Move purchase button to top of sidebar.
- Move save/etc window buttons into headers, tidy up styling.
- Remove unused CSS.
- Rename `frameless.less` -> `platforms.less` and cleanup.
- Move font sizes into less variables.
- Add dark & light theme CSS.
- Break out all colour related CSS into a theme.
- Use webpack `--mode` argument instead of envvar.
- Better name for get main JS filename in webpack config.
- Use python rather than script direct (Windows dev support).
- Rename less variable `orangee` -> `red`.
- Replace/simplify the headerbar + dragbar components.
- Update spam icon (exclamation triangle).
- Remove Roboto Slab font.
- Add `lock_function` util.
- Fix cache disable envvar flag.
- Raise an error when parts missing in dev.
- Lock the `add_contacts` function.
- Capture `LoginError`s connecting to IMAP servers.
- Use deep path for scroll polyfill to fix Windows support.
- Use JS screen info to cap saved window height/width.
- Pass JS detected window position/size/resolution to backend.
- Expand support for German IMAP folder names (provided by @georks).
- Sort column threads after including incoming.
- Merge pull request #148 from vilhelmprytz/vilhelmprytz-minor-readme-fix
- Fix key error when accessing missing header parts.
- Lock when adding/removing cached header flags.
- Fix unsetting column maxwidth.
- Add CSS classes to each of the sidebar alias folders.
- Make new avatar component and extract icons from thread message.
- Show incoming threads when moving to a new column.
- Replace "intsall" with "install" in README
- Update yarn lock file.
- Add seamless scroll polyfill package.
- Remove old debug statement (whoops!).
- Make the column header email count respect the selected account.
- Fix deleted/moved/archived threads re-appearing when switching main column.
- Update drafts sidebar icon (file -> pencil).
- Move sent after archive in sidebar.
- Make moving messages undo-able.
- Ensure development works properly / similarly to app builds.
- Split up webpack app bundles and extract files/css.
- Remove unused style.
- Install less `pyobjc` packages and upgrade to v6.2.2.
- Remove pinned requirements.

# v1.2012041414

Major addition: always show images from a given sender.

Changes:
- Use newer pywebview commit than released.
- Implement "window hacks" for cocoa.
- Tidy up the add contact form/contacts app.
- Fix contact option list in send app.
- Restore sleep inside main python when debug.
- Upgrade pywebview to 3.3.5.
- Offer to always allow images for a message in thread view.
- Implement allowed images in email text API.
- Add API to create/delete allowed image flags for an email.
- Add the allowed images database table/model.
- Remove `Folder.get_email_header_parts`.
- Fix save contacts call argument.
- Make keyboard column scrolling smoother & consistent.
- Scroll down to first open message on open thread.
- Remove sleep before starting app in dev.
- Actually remove `pydash` requirement.
- Tidy up logging module mess - always log to stderr.
- Add batch save contacts function and use when adding contacts.
- Store contacts from trash.
- More descriptive function name.
- Add get contacts API endpoint.
- Improve consistency of contacts module.
- Use functools LRU cache `cache_clear`.
- Replace `pydash.memoize` with `functools.lru_cache`.
- Fix scroll container on contacts app.

# v1.2011090915

Changes:
- Fix column jumping where all remaining columns emptry.

# v1.2010161619

Changes:
- Only warn when part is missing on thread fetch.
- Fix connection mock folder class for offline dev.
- Try the following column if the first is empty when navigating between.
- Redo attachment handling to be compatible with browser mode.
- Fix empty column message by always showing it.
- Reload the welcome window after saving initil settings.
- Upgrade to webpack 4 & tidy up packages.
- Update dev instructions.
- Update readme to remove Linux official support.
- Don't build Linux app by default.
- Fix the new issue links.

# v1.2010061014

No Linux build yet unfortunately due to upstream changes breaking the build process.

Changes:
- Correct providers & support doc link constants.
- Hide emails immediately when dropping on sidebar folders.
- Automatically clean the folder cache after 120s after start.
- Implement vacuuming for the sqlite folders database.
- Pass message object, not string, when saving copies of sent messages.
- Add help button to sidebar, with setting to hide.
- Update license button.
- Update screenshot.

# v1.2009020945

Minor improvements - note you will need to resize/position the main window.

Changes:
- Further improve the fake IMAP mocking.
- Store window position as JSON in new location.
- Icon support for iCloud/Outlook accounts.
- Include account key when merging threads.
- Move docs to website.
- Create codeql-analysis.yml

# v1.2008131047

Changes:
- Fix reply/reply all sending to logic.

# v1.2008071409

This release adds full draft support (save + edit), as well
as move and copy keyboard shortcuts (m & c respectively).

Changes:
- Fix variable in send handler.
- Rework the connection mock classes for better testing.
- Fix non-main window drag bar z-index.
- Fix sidebar show/hide button count.
- Tidy up the control input style.
- Make threads slide away when moving.
- Implement copy & move keyboard shortcuts.
- Yum upgrade run.
- Bump webpack dev server patch version.
- Actually fix subject header lines.
- Use switch instead of all the if statements for keyboard controls.
- Fix overflow hiding tooltip in column email threads.
- Fix z-index of header errors in non-main windows.
- Fix width of add new column form.
- Complete implementation of draft saving and editing.
- Tweak merging of single sender threads:
- Add save draft/email button to send app.
- Don't show archive button for draft threads.
- Add append email to folder API endpoint.
- Add many more Python type annotations/mypy setup.
- Move `fake_imap.py` -> `connection_mocks.py`.
- Fix header errors showing behind columns.
- Add contact icons checkbox to welcome settings flow.

# v1.2007081733

Changes:
- Sort the folder list so we group single thread messages properly.
- Fix drag bar on non-main window.
- Always render the dragbar.
- Fix `.no-select` class w/WebKit.

# v1.2007031541

This version brings a *major* update to Kanmail including an
overhaul of the column and thread designs and a number of
fixes.

Changes:
- Fix Quill editor to use `div` instead of `p` for blocks.
- Fix call to delete header items.
- Ignore null thread references.
- Remove pointless keyboard disabling.
- Major overhaul of main emails app design.
- Add `randomcolor` npm package.
- Default yes to all release script prompts.
- Don't apply dragging functions when not frameless.
- Add get contact icons + group single threads settings.
- Enable cross origin access in dev for usable stack traces.
- Fix incorrect decoding of attachments (leave as bytes).
- Accept the session token as a URL parameter as well as header.
- Add API to fetch icons for emails.
- Rename send app less file.
- Show JS error tracebacks.
- Enable merging threads by subject behind a flag.
- Add logic to enable merging single emails from the same sender.
- Don't include column meta count if the folder does not exist on the server.
- Stop closing thread on keyboard shortcuts.
- Add `makeNoDragElement` function.
- Move `makeDragElement` into `window.js`.

# v1.2006211645

Changes:
- Don't close the window when saving onboarding settings!
- Add top margin on send + welcome settings.
- Add docs link to issue chooser.
- Remove temp changelog removal from `make.clean` script.
- Comment out github release bits as does not work.
- Write changelog before building.
- Fix headers for contacts + settings apps.
- Improve thread overlay styling.
- Make thread meta 50% opaque unless hovered/active.
- Split out window API views.
- Ensure default options on `openWindow` util.
- Remove pre background color.
- Allow body scrolling.
- Remove unused method.
- Link to changelog/license on meta page.
- Create `MetaFileApp` to view bundled markdown files.
- Add `linkify=True` kwarg to `markdownify` util function.
- Remove unncessary wrapper classes.
- Implement new welcome/onboarding page with account settings.
- Break out the account list into it's own component.

# v1.2006081025

This release completely rebuilds the thread view, which now appears as
a popover on top of all the columns/folders. This means it shows up
consistently rather than jumping around the screen. This also enables
an improved thread view and controls.

Changes:
- Add a debug traceback log on account connection tests.
- Add comment to support unicode SMTP usernames/passwords.
- Properly encode unicode IMAP usernames/passwords.
- Rebuild the thread view.
- Move green into less variable.
- Fix thread hashing by actually using the *oldest* email.
- Move logic for finding next/previous thread/column into util.
- Reset column store temporary hash sets on render.
- Fix `columnStore.hasHiddenThread` return value.
- Tidy up readme bits.
- Add UI docs.
- Re-capture that keyerror when destroying a window.
- Fix saving window position/size on Linux/Windows.
- Upgrade pywebview and use the drag region functionality.
- Log the server host/port on start (debug).
- Formatting.
- Add `.node-version` file.
- Remove leftover try/except.
- Log the settion token (debug).
- Improve new issues page.

# v1.2005191209

Linux only release to fix opening links.

Changes:
- Inline variables when only used once.
- Fix open links on Linux.
- Add stale issue workflow.

# v1.2005140926

Adds dropdown for all folders in sidebar with pin/unpin buttons.

Misc bugfixes (safer string handling, improved locking).

Changes:
- Fix cleaning * shell arguments.
- Run clean before starting a release.
- Use `decode_string` everywhere for safer decoding.
- Properly raise after failing to connect to IMAP.
- Drop default connection attempts to 3.
- Add basic about/meta page.
- Fix for network header errors.
- Add missing key prop to show/hide all folders button.
- Split out header styles.
- Add copy debug info button to header errors.
- Limit store subscriptions to reduce email column renders.
- Load the list of folders on emails app start.
- Fix missing key error on request store lists.
- Better request store message when searching.
- Add `KANMAIL_DEBUG_LOCKS` environment variable.
- Use an `RLock` for thread class locking.
- Fix old setting migration (sidebar_folders should be a list).
- Add all folders to the sidebar w/ability to pin.
- Make module tidy ups.
- Add `make/release.py` shortcut script.
- Move `make/clean.sh` -> `make/clean.py`.

# v1.2005120955

Changes:
- Use zip files > git commits in base requirements.
- Tidy up Linux build Dockerfile.
- Set -ex in clean script.
- Link Linux docs.
- Update Linux docs with latest info.
- Include `libbz2` in the bundle (fix Fedora).
- Tidy up Linux doc.
- Make Linux client script executable.
- Add Linux doc.
- Add `KANMAIL_APP_DIR` envvar override.
- Fix adding a new account after autoconfig fails.
- Fixup build linux client docker script.
- Add `make/build_linux_client_docker.sh` script.
- Implement hack to _remove_ binaries from pyinstaller analysis.
- Remove `Makefile` and replace with `make/clean.sh`.
- Remove extra binaries from spec as not needed.
- Pin mac/linux extra requirements.
- Remove commented staticx lines.
- Remove icons/themes from docker build image.
- Add `--onedir` argument to make scripts.
- Add `client-linux-docker` make target that builds the Linux client using Docker.
- Bundle required shared libraries in Linux.

# v1.2005071756

Security & bugfix release.

Changes:
- Expunge emails after deleting them.
- Lock `Account.get_folder` to prevent race condition on folder create.
- Tidy up `__str__` and `log` methods for account/folder/foldercache.
- Add a session token to prevent CSRF attacks.
- Merge common error views.
- Highlight emails flagged as deleted.
- Apply new drag n' drop method to sidebar folders.
- Tidy up copy on move information.
- Don't attempt to parse single item tuples in bodystructure.
- Expand support doc information.
- Add copy not move information to providers doc.
- Create issue templates.

# v1.2005061610

This release adds "copy on move" for better compatibility with label-style
providers (Gmail, Fastmail beta).

Also brings in a much improved error display with more information to
improve debugging, along with a bunch of fixes.

Changes:
- Add cache cleanup script.
- Add cache cleanup functions.
- Add `__str__` methods to folder items.
- Extract cache key name into function.
- Better function name.
- Show traceback infomation in header errors, link to support doc.
- Include tracebacks for unexpected errors.
- Handle `copy_on_move` when dragging emails between columns.
- Default `copy_on_move` true if we're gmail.
- Add copy emails function to the base email store.
- Add `copy_on_move` setting.
- Respect the `options.accountName` filter on sync emails.
- Log a warning when trying to delete emails that don't exist.
- When moving emails rely on backend sync to update columns.
- Remove unused styles.
- Add `settingsStore.getAccountSettings` function.
- Fix account settings default (array not object).
- Fix how we store mapping of account/folder/uid -> email.
- Make the spec template able to generate onedir pyinstaller bundles.
- Remove the dist changelog on `make clean`.
- Remove upx.
- Move `MACOSX_DEPLOYMENT_TARGET` into settings.
- Remove `--no-binary` flag as not required/working.
- Update maintainer label in Dockerfile.
- Update Docker docs for kanmail user.

# v1.2005020754

Changes:
- Symlink pip as well as python for macos build env.
- Use `MACOSX_DEPLOYMENT_TARGET` envvar when compiling.
- Add pip install to MacOS build env.
- Fix header errors in contacts/settings.
- Better highlight new account form.
- Default enable SSL when autoconf fails.
- Fix adding new accounts after failed autoconf.
- Add button to skip new account form and go straight to IMAP/SMTP settings.
- Fix error display in contacts and expected API errors.
- Move `criticalRequestNonce` argument into options object.
- Fix TOC link in providers.
- Add JavaScript requirement install to readme.
- Merge pull request #103 from jetmore/patch-1
- Update README.md

# v1.2004301944

Building using MacOS 10.12 SDK.

Changes:
- Expand readme w/OS specific dev + build instructions.
- Move util functions into make util module.
- Expand providers doc.
- Build tidy up.
- Rename `SidebarHeader` -> `HeaderErrors` component and display in all windows.
- Form style tweaks.
- Implement `ssl_verify_hostname=True` connection setting.
- Better handle duplicate contacts on add/update.
- Don't update in-memory settings on save error.
- Refuse emails with no recipients.
- Add SSL verify hostname IMAP/SMTP settings checkboxes.
- Fix new blank email account selection and error handling on send button.
- Update new account link + text.
- Add providers doc link constant.
- Tidy settings save button render.
- Redo new contact form w/error handling.
- Merge pull request #95 from 0xflotus/patch-1
- fixed small error
- Update providers note on add new account form.
- Correct package.json license.
- Don't dump the output of docker inspect pre-releasing.
- Add `docker-release` make command.
- Correct docker tag when building.
- Merge pull request #80 from Lerentis/master
- Correct license terminology (source available) - thank you HN!
- added Maintainer label and dropped privileges inside container

# v1.2004231151

First release to include licensing. Also loads of bugs fixed :)

Changes:
- Tidy up license file handling to support multiple app tokens.
- Don't codesign/notarize unless making a release build.
- Readme tidy up.
- Improve docs/readme.
- Fix empty/loading column states.
- Hide overflowing text in contact list.
- Implement account specific icons.
- Return autoconf ports as integers.
- Move whether to save contacts into the folder class.
- Don't save contacts with " via " in the name.
- Fixup boot imports.
- Add message to abort in `get_or_400`.
- Add wrappers around keyring functions and improve the naming.
- Rename device module -> update.
- Implement license key elements.
- Nice formatting for contact count.
- Add license info to the readme.
- Add license sidebar link + footer updates.
- Use default size for send windows.
- Use info log for post-process console message.
- Rename emailss app root element ID.
- Update screenshot.
- De-dupe validating no duplicate accounts.
- Use imap user + host to identify folder caches.
- Add default window width/height.
- Fix address count in column thread.
- Remove `UNSAFE_componentWillReceiveProps` code.
- Use store functions to check thread hashes.
- Reset contact state after cancelling edit.
- New Mac/Win icons.
- Add new logo, add to readme titles.
- New colour palette and default pink.
- Tidy up address list rendering, add support for avatars.
- Docs improvements.
- Updated screenshot.
- Move technical docs into the readme.
- Expand some of the fake IMAP client functionality.
- Add website URL constant.
- Update constant names.
- Update yarn lockfile with less & upgraded dependencies.
- Upgrade less to v3.
- Bump pyupdater s3 plugin.
- Correct print statements in make.
- Add `release-complete` make job.

# v1.2004031156

Changes:
- Add check for notarize envar on MacOS.
- Add entitlements.plist for MacOS codesigning.
- First pass implementation at MacOS notarization during build.
- Print and run > print and check output for docker inspect.
- Handle strip/decode in the util.
- Move `Dockerfile` to the top directory.
- Replace scripts with a `Makefile`.
- Swap `--build-only` for `--release` so the default is build, not release.
- Split `scripts/build_release.py` into a module under `make`.

# v1.2003251947

Changes:
- Don't overwrite existing files when downloading attachments.
- After downloading an attachment, second click opens it (if possible).
- Remove pointless logging in requests util.
- Properly handle (ignore) invalid critical request responses in thread.
- Trigger thread store update when fetching.
- Actually pass back the data/error from request store responses.
- Revert "Reset the hidden/read thread caches on column stores when updating."
- Fixup missing/incorrect prop types.
- Reset the hidden/read thread caches on column stores when updating.
- Fix unsubscribe from store.
- Track/cache read threads in the column store.
- Set 30s timeout on sqlite to fix/reduce database lock exceptions.
- Make email columns only listen for `accountName` filter prop changes.
- Make it possible to subscribe to individual store props.
- Fix key used to flag email threads as read.
- Reset state after adding a new account.
- Add `win32timezone` hidden import on Windows.
- Rename `scripts/release.py` -> `scripts/build_release.py`.
- Correct error data variables when adding a new account.
- Tidy up the add account process and error handling.
- Downgrade keyring to `19.2.0` and add `keyrings.alt`.
- Add secrets module to setup keyring.
- Don't allow multiple accounts with the same name.
- Change settings `accounts` from a dict to a list.
- Remove unnecessary `__future__` imports.
- Install libssl + libffi.
- Remove stale settings doc.
- Move `arrayMove` into `util/array.js`.
- Add contacts in batches.
- Formatting.
- Flag whether changes have been made when fixing old settings.
- Correct window settings: (left -> x, top -> y).
- Re-save  settings if we fix/migrate old formats.
- Fix batch get headers usage.
- Also capture `LoginError` in IMAP connection retries.
- Put password back as an allowed connection kwarg.
- Debounce saving window settings.
- Don't trigger updates after thread delete.
- Add error view for missing password exception.
- Add a conversion for old in-settings-file passwords -> keyring.
- Get/set IMAP/SMTP passwords using keyring.
- Add keyring requirement.
- Properly reset all account classes on settings update.
- Fix folder initialisation checking whether a folder exists.
- Formatting.
- Use correct function: `pickBy` for objects (not `filter`).
- Flag threads as hidden in the column store when moving.
- Add fix any old settings function.
- Fix incorrect check when validating settings keys with defaults.
- Formatting tidy up.
- Add logging to the folder cache and contacts modules.
- Separate contact validation into a function.
- Separate out settings constants.

# v1.2002211810

Changes:
- Make the form on contacts page top sticky.
- Label copy tidy on settings.
- Only allow one contacts/settings window at once.
- Use more less variables.
- Turn the sidebar folder list into a proper multiselect in settings.
- Move react select styles into own file.

# v1.2002191933

Big release with lots of changes; highlights:
- contact manager, less spammy contacts
- rebuild cache with increased performance/less disk write
- tidy up settings
- test/validate working with fastmail

Changes:
- Don't use save dialog (broken?) when downloading files.
- Remove unused view.
- Save copies of emails sent if the `save_sent_copies` setting is true.
- Add `Date` header to emails.
- Don't assume emails have dates.
- Remove unused `Folder.delete_messages` method.
- Rename variable for explicitness.
- Don't store contacts w/o a name.
- Move actual sending of messages into account class.
- Rename `send.py` -> `message.py`.
- Add `save_sent_copies` folder setting to the settings app.
- Implement error handling on settings save failures.
- Rename `type` -> `method` in JS request util.
- Ensure the settings app respects strict settings model.
- Implement a settings model with validation.
- Tidy up settings account edit.
- Redo account settings with tabs.
- Make it possible to rename accounts.
- Update readme w/fastmail tested.
- Add server support doc.
- Sort out the settings API: separate overwrite from update.
- Make `HeaderBar` reflect the header background style setting.
- Return both name + email when selecting addresses in the send app.
- Use the `email.headerregistry` package for addresses.
- Fix contact manager form styles.
- Remove sidebar borders.
- Implement & use batch get/set header functions for the folder cache.
- Modify save/delete cache methods to take multiple objects.
- Explicitly define pyupdater-s3-plugin requirement.
- Don't cache the folder ID.
- Offer to build JS bundle when building only.
- Reimplement the folder cache using sqlite.
- Enable foreign keys in sqlite.
- Fix folder pagination: don't mutate passed in UID list.
- Add `flake8-quotes` development requirement.
- Update `add_contact` function usage.
- Finish `ContactsApp` component.
- Improve add contact bounce/noreply email detection.
- Add save/delete contact functions.
- Add `KANMAIL_DEBUG_SMTP` environment variable flag.
- Finish contacts API views.
- Log settings errors as console errors, not log.
- Add contacts window/page with stub management methods.
- Fix send app loading of contact list.
- Remove borders from column styles.
- Add flask-sqlalchemy/sqlalchemy requirement.
- Save contacts using sqlite/sqlalchemy.
- Move form styles out of settings style.
- Don't wait indefinitely the server to start.
- Don't start monitor thread until after the server boots.
- Add/use `destroy_main_window` function.
- Remove email borders.
- Don't save contacts from emails in spam/trash.
- Don't save window settings in server mode.
- Add Windows icon.
- Update werkzeug `ImmutableDict` import.
- Capture/retry additional `ImapClientError`'s.
- Improve sidebar style of "update complete" text.
- Remove restart device api/util.
- Expand docker docs to include volume.
- Fix writing of changelog.

# v1.2002061815

Changes:
- Add Python version @ 3.7.6.
- Make it possible to pass a version when building.
- Require building the JS bundle outside of the release script when building only.
- Reimplement tracking of seen email UIDs in the folder class.
- Fix z-index styles.
- Render custom sidebar folders in a separate list.
- Fix scroll handler errors when changing main column.
- Add frameless class when in frameless mode.
- Implement non-frameless styles.
- Only flag as frameless if we're in app mode (on MacOS).
- Pass frameless setting to the frontend.
- Fix offset correction when removing UIDs from a folder.
- Add Docker docs.
- Expand development instructions, add Windows notes.
- Build the client bundle once during a release.
- Handle Docker not having versioned folder for JS.
- Store the main JS file in a versioned directory.
- Windows build support!
- Create a github release after pushing new tag.

# v1.2001291810

First release for Linux & Docker!

Changes:
- Bump `pyinstaller` and `pyupdater` requirements.
- Ensure we pass width/height as integers.
- Make it possible to drag n' drop emails into sidebar folders.
- Improve advanced settings block style.
- Add `sidebar_folders` setting.
- Tweak save button for service/browser mode.
- Fix version to work with pyupdater.
- Show hover state when dragging emails between columns.
- Fix Kanmail link.
- Begin adding type annotations to the server.
- Linux & Docker build support!
- Proper support for running as a server.

# v1.2001061828

Changes:
- Don't attempt to verify/fix UIDs returned when syncing flags (non-essential).
- Fix attempting to decode dodgy strings.

# v1.1911190836

Changes:
- Fix window dialog creation (save/add attachments).

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
