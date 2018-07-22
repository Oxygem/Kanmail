from flask import jsonify, request

from kanmail.server.app import app
from kanmail.settings import (
    get_settings,
    set_cached_window_settings,
    SETTINGS_FILE,
)


@app.route('/api/settings', methods=['GET'])
def api_get_settings():
    '''
    Get client settings.
    '''

    settings = get_settings()

    return jsonify(
        settings=settings,
        settings_file=SETTINGS_FILE,
    )


@app.route('/api/settings', methods=['POST'])
def api_update_settings():
    '''
    Update client settings.
    '''


@app.route('/api/window_settings', methods=['POST'])
def api_update_window_settings():
    request_data = request.get_json()
    set_cached_window_settings(**request_data)

    return jsonify(saved=True)
