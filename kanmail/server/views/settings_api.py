from flask import abort, jsonify, request, Response

from kanmail.log import logger
from kanmail.secrets import get_password, set_password
from kanmail.server.app import add_route
from kanmail.server.mail import reset_accounts
from kanmail.server.mail.folder_cache import bust_all_caches
from kanmail.settings import (
    get_settings,
    overwrite_settings,
    set_window_settings,
    update_settings,
)
from kanmail.settings.constants import DEBUG, IS_APP, SETTINGS_FILE
from kanmail.settings.model import validate_unique_accounts
from kanmail.window import get_main_window_size_position, reload_main_window


@add_route('/api/settings', methods=('GET',))
def api_get_settings() -> Response:
    settings = get_settings()

    account_name_to_connected = {}

    for account in settings.get('accounts', []):
        host = account['imap_connection']['host']
        username = account['imap_connection']['username']

        if account['imap_connection'].get('oauth_provider'):
            has_password = get_password('oauth-account', host, username) is not None
        else:
            has_password = get_password('account', host, username) is not None

        account_name_to_connected[account['name']] = has_password

    return jsonify(
        settings=settings,
        account_name_to_connected=account_name_to_connected,
        settings_file=SETTINGS_FILE,
    )


def _extract_any_secret(secret_type: str, secret_key: str, obj: dict) -> None:
    if not obj or not all(k in obj for k in ('host', 'username', secret_key)):
        return

    set_password(secret_type, obj['host'], obj['username'], obj.pop(secret_key))


@add_route('/api/settings', methods=('PUT',))
def api_set_settings() -> Response:
    request_data = request.get_json()

    accounts = request_data.get('accounts', [])

    try:
        validate_unique_accounts(accounts)
    except ValueError as e:
        abort(400, f'{e}')

    for account in accounts:
        # IMAP user/password accounts
        _extract_any_secret('account', 'password', account.get('imap_connection'))
        _extract_any_secret('account', 'password', account.get('smtp_connection'))
        # IMAP OAuth accounts
        _extract_any_secret('oauth-account', 'oauth_refresh_token', account.get('imap_connection'))
        _extract_any_secret('oauth-account', 'oauth_refresh_token', account.get('smtp_connection'))

    changed_keys = overwrite_settings(request_data)

    # If sync days changes we need to nuke the caches
    if 'system.sync_days' in changed_keys:
        bust_all_caches()  # nuke the on-disk caches

    reset_accounts()  # un-cache accounts + folders to pick up settings changes
    reload_main_window()

    return jsonify(saved=True)


@add_route('/api/settings', methods=('POST',))
def api_update_settings() -> Response:
    request_data = request.get_json()
    update_settings(request_data)
    return jsonify(saved=True)


@add_route('/api/settings/cache', methods=('DELETE',))
def api_delete_caches() -> Response:
    bust_all_caches()
    reload_main_window()
    return jsonify(deleted=True)


@add_route('/api/settings/window', methods=('POST',))
def api_update_window_settings() -> Response:
    if not IS_APP:
        return jsonify(saved=False)  # success response, but not saved (browser mode)

    window_settings = get_main_window_size_position()
    js_window_settings = request.get_json()

    if DEBUG:
        for key in ('left', 'top', 'width', 'height'):
            if window_settings[key] != js_window_settings[key]:
                logger.warning((
                    f'Mismatched Python <> JS window setting for {key}, '
                    f'py={window_settings[key]}, js={js_window_settings[key]}'
                ))

    # Cap the width + height to max size of screen
    window_settings['height'] = min(window_settings['height'], js_window_settings['height'])
    window_settings['width'] = min(window_settings['width'], js_window_settings['width'])

    set_window_settings(**window_settings)
    return jsonify(saved=True)
