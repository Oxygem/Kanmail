from flask import abort, jsonify

from kanmail.device import check_device_update, restart_device, update_device
from kanmail.server.app import app
from kanmail.version import get_version


@app.route('/api/update', methods=('GET',))
def get_check_update():
    update = check_device_update()

    if update:
        return jsonify(update=update.version, current_version=get_version())
    return jsonify(update=None)


@app.route('/api/update', methods=('POST',))
def api_update_and_restart():
    update = check_device_update()

    if not update:
        return abort(404, 'No update found!')

    update_device(update)
    return jsonify(update_ready=True)


@app.route('/api/update/restart', methods=('POST',))
def api_restart():
    restart_device()
    # No return as we'll never get here!
