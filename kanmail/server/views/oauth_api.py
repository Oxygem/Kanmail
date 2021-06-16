from uuid import uuid4

from flask import abort, jsonify, redirect, render_template, request

from kanmail.server.app import add_public_route, add_route
from kanmail.server.mail.oauth import (
    get_oauth_request_url,
    get_oauth_tokens_from_code,
)


OAUTH_REQUESTS = {}


@add_public_route('/oauth-complete')
def get_oauth_complete():
    return render_template('oauth_complete.html')


@add_route('/api/oauth/request', methods=('POST',))
def make_oauth_request():
    request_data = request.get_json()
    oauth_provider = request_data['oauth_provider']

    uid = str(uuid4())
    OAUTH_REQUESTS[uid] = {
        'provider': oauth_provider,
    }

    auth_url = get_oauth_request_url(oauth_provider, uid)

    return jsonify(auth_url=auth_url, uid=uid)


@add_route('/api/oauth/respond')
def handle_oauth_response():
    # Store the OAuth auth code from the server for the app to retrieve
    uid = request.args['uid']
    auth_code = request.args['code']

    oauth_request = OAUTH_REQUESTS[uid]

    oauth_response = get_oauth_tokens_from_code(
        oauth_request['provider'],
        uid,
        auth_code,
    )

    OAUTH_REQUESTS[uid]['response'] = oauth_response
    return redirect('/oauth-complete')


@add_route('/api/oauth/response/<uid>')
def get_oauth_response(uid):
    response = OAUTH_REQUESTS.get(uid)

    if not response:
        abort(404, 'OAuth response not found!')

    return jsonify(response)


@add_route('/api/oauth/response/<uid>', methods=('DELETE',))
def delete_oauth_response(uid):
    OAUTH_REQUESTS.pop(uid)
