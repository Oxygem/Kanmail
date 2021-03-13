import traceback

from flask import jsonify, request
from imapclient import imapclient

from kanmail.log import logger
from kanmail.server.app import app
from kanmail.server.mail import Account
from kanmail.server.mail.autoconf import get_autoconf_settings

CONNECTION_KEYS = ('host', 'port', 'username')


# German folder names provided by @georks
# (https://github.com/Oxygem/Kanmail/issues/146)
INBOX_NAMES = ('inbox', 'posteingang')

EXTRA_SPECIAL_FOLDER_NAMES = {
    imapclient.SENT: ('Gesendet', 'gesendet'),
    imapclient.DRAFTS: ('Entwuerfe', 'Entwürfe'),
    imapclient.ARCHIVE: ('Archiv', 'Archivieren'),
    imapclient.TRASH: ('Papierkorb', 'Gelöschte Elemente'),
    imapclient.JUNK: ('Unerwünscht', 'Unerwuenscht'),
}
for key, extra_names in EXTRA_SPECIAL_FOLDER_NAMES.items():
    imapclient._POPULAR_SPECIAL_FOLDERS[key] += extra_names


def _get_folder_settings(imap_settings, connection):
    # First, figure out the folder prefix & separator using the NAMESPACE IMAP
    # extension if available on the server.
    prefix = ''
    separator = '/'

    capabilities = connection.capabilities()
    if b'NAMESPACE' in capabilities:
        namespace = connection.namespace().personal[0]
        prefix, separator = namespace

    folders = {
        'prefix': prefix,
        'separator': separator,
    }

    # Get the alias folders
    for alias in (
        'sent', 'drafts', 'archive', 'trash',
        # Map junk => spam used internally for Kanmail
        ('junk', 'spam'),
    ):
        folder = alias
        if isinstance(alias, tuple):
            alias, folder = alias

        constant = getattr(imapclient, alias.upper())
        special_folder = connection.find_special_folder(constant)

        if special_folder:
            if special_folder.startswith(prefix):
                special_folder = special_folder[len(prefix):]
            folders[folder] = special_folder

    # Some email providers use ALL instead of ARCHIVE (gmail)
    if 'archive' not in folders:
        all_folder = connection.find_special_folder(imapclient.ALL)
        if all_folder:
            folders['archive'] = all_folder

    # Now find the inbox folder
    for folder in connection.list_folders():
        if folder[2].lower() in INBOX_NAMES:
            folders['inbox'] = folder[2]
            break

    # Gmail is the only provider that *always* supports copy from inbox ie
    # label style IMAP rather than folder style.
    if imap_settings['host'] == 'imap.gmail.com':
        folders['copy_on_move'] = True

    return folders


class TestAccountSettingsError(Exception):
    pass


def _test_account_settings(account_settings, get_folder_settings=False):
    imap_settings = account_settings['imap_connection']
    smtp_settings = account_settings['smtp_connection']

    for settings_type, settings in (
        ('imap', imap_settings),
        ('smtp', smtp_settings),
    ):
        for key in CONNECTION_KEYS:
            if not settings.get(key):
                raise TestAccountSettingsError(
                    settings_type,
                    f'Missing {settings_type} setting: {key}',
                )

    new_account = Account('Unsaved test account', account_settings)

    folders = {}

    # Check IMAP and folders as needed
    try:
        with new_account.get_imap_connection() as connection:
            connection.noop()
            if get_folder_settings:
                folders = _get_folder_settings(imap_settings, connection)
    except Exception as e:
        trace = traceback.format_exc().strip()
        logger.debug(f'IMAP connection exception traceback: {trace}')
        raise TestAccountSettingsError('imap', f'{e}')

    # Check SMTP
    try:
        with new_account.get_smtp_connection() as connection:
            pass
    except Exception as e:
        trace = traceback.format_exc().strip()
        logger.debug(f'SMTP connection exception traceback: {trace}')
        raise TestAccountSettingsError('smtp', f'{e}')

    return folders or True


@app.route('/api/settings/account/test', methods=('POST',))
def api_test_account_settings():
    request_data = request.get_json()

    account_settings = {
        'imap_connection': request_data['imap_connection'],
        'smtp_connection': request_data['smtp_connection'],
    }

    update_folder_settings = request_data.get('update_folder_settings') is True

    try:
        folders = _test_account_settings(
            account_settings,
            get_folder_settings=update_folder_settings,
        )
    except TestAccountSettingsError as e:
        error_type, error_message = e.args
        return jsonify(
            connected=False,
            error_type=error_type,
            error_message=error_message,
        ), 400

    if update_folder_settings:
        account_settings['folders'] = folders

    return jsonify(connected=True, settings=account_settings)


@app.route('/api/settings/account/new', methods=('POST',))
def api_test_new_account_settings():
    '''
    Attempt to autoconfigure and connect to a new account using email/password,
    returning any/all the settings found.
    '''

    request_data = request.get_json()

    username = request_data['username']
    password = request_data['password']

    error_name = None
    error_message = 'Could not autoconfigure'

    did_autoconf, account_settings = get_autoconf_settings(
        username,
        password,
        domain=request_data.get('autoconf_domain'),
    )

    if did_autoconf:
        try:
            folders = _test_account_settings(
                account_settings,
                get_folder_settings=True,
            )
        except TestAccountSettingsError as e:
            error_name, error_message = e.args
        else:
            account_settings['folders'] = folders
            return jsonify(connected=True, settings=account_settings)

    return jsonify(
        connected=False,
        settings=account_settings,
        error_name=error_name,
        error_message=error_message,
    ), 400
