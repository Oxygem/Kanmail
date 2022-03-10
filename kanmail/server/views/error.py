import traceback

from flask import jsonify, make_response, Response
from werkzeug.exceptions import HTTPException

from kanmail.log import logger
from kanmail.server.app import app
from kanmail.server.mail.connection import ConnectionSettingsError, ImapConnectionError


@app.errorhandler(400)
@app.errorhandler(401)
@app.errorhandler(404)
@app.errorhandler(405)
def error_bad_request(e) -> Response:
    return make_response(jsonify(
        status_code=e.code,
        error_name=e.name,
        error_message=e.description,
    ), e.code)


@app.errorhandler(ConnectionSettingsError)
def error_connection_exception(e) -> Response:
    error_name = e.__class__.__name__
    message = f'{e} (account={e.account})'
    trace = traceback.format_exc().strip()
    logger.warning(f'Connection settings error in view: {message}: {trace}')
    return make_response(jsonify(
        status_code=400,
        error_name=error_name,
        error_message=message,
    ), 400)


@app.errorhandler(ImapConnectionError)
def error_network_exception(e) -> Response:
    error_name = e.__class__.__name__
    message = f'{e} (account={e.account})'
    trace = traceback.format_exc().strip()
    logger.warning(f'Network error in view: {message}: {trace}')
    return make_response(jsonify(
        status_code=503,
        error_name=error_name,
        error_message=message,
    ), 503)


@app.errorhandler(Exception)
def error_unexpected_exception(e) -> Response:
    if isinstance(e, HTTPException):
        return e

    error_name = e.__class__.__name__
    message = f'{e}'
    trace = traceback.format_exc().strip()
    logger.exception(f'Unexpected exception in view: {message}: {trace}')
    return make_response(jsonify(
        status_code=500,
        error_name=error_name,
        error_message=message,
        traceback=trace,
    ), 500)
