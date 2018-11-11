import webbrowser

from uuid import uuid4

from flask import abort, render_template, request

from kanmail.log import logger
from kanmail.server.app import app
from kanmail.server.mail.contacts import get_contacts
from kanmail.server.util import get_or_400
from kanmail.settings import DEBUG, FROZEN, IS_APP, SERVER_PORT
from kanmail.version import get_version
from kanmail.window import create_window


SEND_WINDOW_DATA = {}


@app.route('/', methods=['GET'])
def get_index():
    return render_template(
        'index.html',
        version=get_version(),
        frozen=FROZEN,
        debug=DEBUG,
    )


@app.route('/settings', methods=['GET'])
def get_settings():
    return render_template(
        'settings.html',
        frozen=FROZEN,
        debug=DEBUG,
    )


@app.route('/send', methods=['GET'])
def get_send():
    return render_template(
        'send.html',
        contacts=get_contacts(),
        frozen=FROZEN,
        debug=DEBUG,
    )


@app.route('/send/<uid>', methods=['GET'])
def get_send_reply(uid):
    if DEBUG:
        reply = SEND_WINDOW_DATA.get(uid)
    else:
        reply = SEND_WINDOW_DATA.pop(uid, None)

    if not reply:
        abort(404, 'Reply message not found!')

    return render_template(
        'send.html',
        reply=reply,
        contacts=get_contacts(),
        frozen=FROZEN,
        debug=DEBUG,
    )


@app.route('/open-link', methods=['GET'])
def open_link():
    link = request.args['url']

    if webbrowser.open(link):
        return '', 204

    logger.critical(f'Failed to open browser link: {link}!')
    return abort(500, 'Could not open link!')


def _open_window(name, endpoint, **kwargs):
    link = f'http://localhost:{SERVER_PORT}{endpoint}'

    if IS_APP:
        create_window(name, endpoint, **kwargs)
        return '', 204
    else:
        if webbrowser.open(link):
            return '', 204

    logger.critical(f'Failed to open {name} window!')
    return abort(500, f'Could not open {name} window!')


@app.route('/open-settings', methods=['GET'])
def open_settings():
    return _open_window('settings', '/settings', width=800, unique=True)


@app.route('/open-send', methods=['GET', 'POST'])
def open_send():
    endpoint = '/send'

    if request.method == 'POST':
        data = request.get_json()
        message_data = get_or_400(data, 'message')
        message_data['reply_all'] = data.get('reply_all', False)

        uid = str(uuid4())
        SEND_WINDOW_DATA[uid] = message_data

        endpoint = f'/send/{uid}'

    return _open_window('new email', endpoint)
