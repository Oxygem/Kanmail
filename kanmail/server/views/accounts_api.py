from flask import jsonify, request
from imapclient import imapclient

from kanmail.server.app import app
from kanmail.server.mail import Account
from kanmail.server.mail.autoconf import get_autoconf_settings

CONNECTION_KEYS = ('host', 'port', 'username')


def _get_folders(connection):
    folders = {}

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
            folders[folder] = special_folder

    # Some email providers use ALL instead of ARCHIVE (gmail)
    if 'archive' not in folders:
        all_folder = connection.find_special_folder(imapclient.ALL)
        if all_folder:
            folders['archive'] = all_folder

    # Now find the inbox folder
    for folder in connection.list_folders():
        if folder[2].lower() == 'inbox':
            folders['inbox'] = folder[2]
            break

    return folders


def _test_account_settings(account_settings, get_folders=False):
    imap_settings = account_settings['imap_connection']
    smtp_settings = account_settings['smtp_connection']

    for settings_type, settings in (
        ('imap', imap_settings),
        ('smtp', smtp_settings),
    ):
        for key in CONNECTION_KEYS:
            if not settings.get(key):
                return False, (settings_type, f'Missing {settings_type} setting: {key}')

    new_account = Account('Unsaved test account', account_settings)

    folders = {}

    # Check IMAP and folders as needed
    try:
        with new_account.get_imap_connection() as connection:
            connection.noop()
            if get_folders:
                folders = _get_folders(connection)
    except Exception as e:
        return False, ('imap', f'{e}')

    # Check SMTP
    try:
        with new_account.get_smtp_connection() as connection:
            pass
    except Exception as e:
        return False, ('smtp', f'{e}')

    if get_folders:
        return True, folders
    return True, None


@app.route('/api/settings/account/test', methods=('POST',))
def api_test_account_settings():
    request_data = request.get_json()

    account_settings = {
        'imap_connection': request_data['imap_connection'],
        'smtp_connection': request_data['smtp_connection'],
    }

    status, error = _test_account_settings(account_settings)
    if status:
        return jsonify(connected=True)

    error_type, error_message = error
    return jsonify(
        connected=False,
        error_type=error_type,
        error_message=error_message,
    ), 400


@app.route('/api/settings/account/new', methods=('POST',))
def api_test_new_account_settings():
    '''
    Attempt to autoconfigure and connect to a new account using email/password,
    returning any/all the settings found.
    '''

    request_data = request.get_json()

    username = request_data['username']
    password = request_data['password']

    status = False
    folders_or_error = (None, 'Could not autoconfigure')

    did_autoconf, account_settings = get_autoconf_settings(username, password)

    if did_autoconf:
        status, folders_or_error = _test_account_settings(
            account_settings,
            get_folders=True,
        )

    if status:
        account_settings['folders'] = folders_or_error
        return jsonify(connected=True, settings=account_settings)

    error_type, error_message = folders_or_error
    return jsonify(
        connected=False,
        settings=account_settings,
        error_type=error_type,
        error_message=error_message,
    ), 400
