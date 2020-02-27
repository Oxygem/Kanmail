from flask import jsonify, request

from kanmail.server.app import app
from kanmail.server.mail import reset_accounts
from kanmail.server.mail.folder_cache import bust_all_caches
from kanmail.settings import (
    get_settings,
    overwrite_settings,
    set_window_settings,
    update_settings,
)
from kanmail.settings.constants import IS_APP, SETTINGS_FILE
from kanmail.window import get_main_window_size_position, reload_main_window


@app.route('/api/settings', methods=('GET',))
def api_get_settings():
    return jsonify(
        settings=get_settings(),
        settings_file=SETTINGS_FILE,
    )


@app.route('/api/settings', methods=('PUT',))
def api_set_settings():
    request_data = request.get_json()

    changed_keys = overwrite_settings(request_data)

    # If sync days changes we need to nuke the caches
    if 'system.sync_days' in changed_keys:
        bust_all_caches()  # nuke the on-disk caches

    reset_accounts()  # un-cache accounts + folders to pick up settings changes
    reload_main_window()

    return jsonify(saved=True)


@app.route('/api/settings', methods=('POST',))
def api_update_settings():
    request_data = request.get_json()
    update_settings(request_data)
    return jsonify(saved=True)


@app.route('/api/settings/cache', methods=('DELETE',))
def api_delete_caches():
    bust_all_caches()
    reload_main_window()
    return jsonify(deleted=True)


@app.route('/api/settings/window', methods=('POST',))
def api_update_window_settings():
    if not IS_APP:
        return jsonify(saved=False)  # success response, but not saved (browser mode)

    window_settings = get_main_window_size_position()
    set_window_settings(**window_settings)
    return jsonify(saved=True)
