from flask import jsonify, request, Response

from kanmail.log import logger
from kanmail.secrets import set_password
from kanmail.server.app import app
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


@app.route('/api/settings', methods=('GET',))
def api_get_settings() -> Response:
    return jsonify(
        settings=get_settings(),
        settings_file=SETTINGS_FILE,
    )


def _extract_password(obj) -> None:
    if not obj or not all(k in obj for k in ('host', 'username', 'password')):
        return

    set_password('account', obj['host'], obj['username'], obj.pop('password'))


@app.route('/api/settings', methods=('PUT',))
def api_set_settings() -> Response:
    request_data = request.get_json()

    accounts = request_data.get('accounts', [])
    validate_unique_accounts(accounts)

    for account in accounts:
        _extract_password(account.get('imap_settings'))
        _extract_password(account.get('smtp_settings'))

    changed_keys = overwrite_settings(request_data)

    # If sync days changes we need to nuke the caches
    if 'system.sync_days' in changed_keys:
        bust_all_caches()  # nuke the on-disk caches

    reset_accounts()  # un-cache accounts + folders to pick up settings changes
    reload_main_window()

    return jsonify(saved=True)


@app.route('/api/settings', methods=('POST',))
def api_update_settings() -> Response:
    request_data = request.get_json()
    update_settings(request_data)
    return jsonify(saved=True)


@app.route('/api/settings/cache', methods=('DELETE',))
def api_delete_caches() -> Response:
    bust_all_caches()
    reload_main_window()
    return jsonify(deleted=True)


@app.route('/api/settings/window', methods=('POST',))
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
