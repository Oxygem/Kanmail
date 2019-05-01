from flask import jsonify, request

from kanmail import settings
from kanmail.server.app import app
from kanmail.server.mail import reset_account_folders
from kanmail.server.mail.folder_cache import bust_all_cached_uids
from kanmail.settings import (
    get_settings,
    set_cached_window_settings,
    update_settings,
)
from kanmail.window import reload_main_window


@app.route('/api/settings', methods=('GET',))
def api_get_settings():
    return jsonify(
        settings=get_settings(),
        settings_file=settings.SETTINGS_FILE,
    )


@app.route('/api/settings', methods=('POST',))
def api_set_settings():
    request_data = request.get_json()

    changed_keys = update_settings(request_data)

    # If sync days changes we need to nuke the caches
    if 'system.sync_days' in changed_keys:
        reset_account_folders()  # un-cache accounts/folders
        bust_all_cached_uids()  # nuke the on-disk UID list caches

    reload_main_window()

    return jsonify(saved=True)


@app.route('/api/settings', methods=('PUT',))
def api_update_settings():
    request_data = request.get_json()

    update_settings(request_data)

    return jsonify(saved=True)


@app.route('/api/settings/window', methods=('POST',))
def api_update_window_settings():
    request_data = request.get_json()

    # Importing this before creating the initial main window isn't allowed
    # from webview.cocoa import BrowserView
    # top_bar_height = BrowserView.DragBar.default_height + 1
    top_bar_height = 23

    if 'height' in request_data:
        request_data['height'] += top_bar_height

    if 'top' in request_data:
        request_data['top'] -= top_bar_height

    set_cached_window_settings(**request_data)

    return jsonify(saved=True)
