import json
import random

from os import path

from flask import abort, jsonify, make_response, request

from kanmail.server.app import app


def _get_message_texts():
    json_path = path.join('fixtures', 'message_texts.json')
    json_data = open(json_path).read()
    return json.loads(json_data)['messages']


@app.route('/api/emails/<account_name>/<folder_name>/text')
def get_emails(account_name, folder_name):
    message_texts = _get_message_texts()
    uids = request.args.getlist('uid')

    return jsonify(emails={
        uid: random.choice(message_texts)
        for uid in uids
    })


@app.route('/<path:api_path>', methods=['GET'])
def fixture(api_path):
    filename = api_path.replace('/', '_').replace(' ', '_')
    filename = '{0}.json'.format(filename)

    json_path = path.join('fixtures', filename)

    if not path.exists(json_path):
        return abort(404)

    json_data = open(json_path).read()
    response = make_response(json_data)
    response.headers['Content-Type'] = 'application/json'

    return response
