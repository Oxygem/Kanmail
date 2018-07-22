from flask import jsonify, make_response

from kanmail.server.app import app


@app.errorhandler(400)
def error_bad_request(e):
    return make_response(jsonify(
        status_code=e.code,
        error_name=e.name,
        error_message=e.description,
    ), 400)


@app.errorhandler(404)
def error_not_found(e):
    return make_response(jsonify(
        status_code=e.code,
        error_name=e.name,
        error_message=e.description,
    ), 404)


@app.errorhandler(405)
def error_method_not_allowed(e):
    return make_response(jsonify(
        status_code=e.code,
        error_name=e.name,
        error_message=e.description,
    ), 405)
