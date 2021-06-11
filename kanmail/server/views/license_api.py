from typing import Tuple, Union

from flask import abort, jsonify, request, Response

from kanmail.license import activate_license, LicenseActivationError, remove_license
from kanmail.server.app import app
from kanmail.server.util import get_or_400
from kanmail.window import reload_main_window


@app.route('/api/license', methods=('POST',))
def api_activate_license() -> Union[Response, Tuple[Response, int]]:
    request_data = request.get_json()
    license_data = get_or_400(request_data, 'license')

    # Cleanup any copy/paste issues with the license
    license_data = license_data.strip()
    license_data = license_data.strip('-')
    license_data = license_data.strip()

    try:
        email, token = [line.strip() for line in license_data.splitlines()]
    except ValueError:
        return jsonify(
            activated=False,
            error='Invalid license format, it should include both email and token.',
        ), 400

    try:
        activate_license(email, token)
    except LicenseActivationError as e:
        abort(400, f'{e}')

    reload_main_window()
    return jsonify(activated=True)


@app.route('/api/license', methods=('DELETE',))
def api_delete_license() -> Response:
    remove_license()
    reload_main_window()
    return jsonify(deleted=True)
