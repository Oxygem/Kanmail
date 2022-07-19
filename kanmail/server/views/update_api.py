from flask import Response, abort, jsonify

from kanmail.server.app import add_route
from kanmail.settings.constants import WATCH_UPDATE
from kanmail.update import check_device_update, update_device
from kanmail.version import get_version


@add_route("/api/update", methods=("GET",))
def api_check_update() -> Response:
    if WATCH_UPDATE:
        update = check_device_update()
    else:
        update = None

    if update:
        return jsonify(update=update.version, current_version=get_version())
    return jsonify(update=None)


@add_route("/api/update", methods=("POST",))
def api_download_overwrite_update() -> Response:
    update = check_device_update()

    if not update:
        abort(404, "No update found!")

    update_device(update)
    return jsonify(update_ready=True)
