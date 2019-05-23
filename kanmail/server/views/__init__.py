import webbrowser

from os import path
from uuid import uuid4

from flask import abort, jsonify, render_template, request

from kanmail.log import logger
from kanmail.server.app import app
from kanmail.server.mail.contacts import get_contacts
from kanmail.server.util import get_or_400
from kanmail.settings import DEBUG, FROZEN
from kanmail.version import get_version
from kanmail.window import create_open_dialog, create_window, destroy_window


SEND_WINDOW_DATA = {}


def _get_render_data():
    return {
        'version': get_version(),
        'frozen': FROZEN,
        'debug': DEBUG,
    }


@app.route('/', methods=('GET',))
def get_index():
    return render_template(
        'index.html',
        **_get_render_data(),
    )


@app.route('/settings', methods=('GET',))
def get_settings():
    return render_template(
        'settings.html',
        **_get_render_data(),
    )


@app.route('/send', methods=('GET',))
def get_send():
    return render_template(
        'send.html',
        contacts=get_contacts(),
        **_get_render_data(),
    )


@app.route('/send/<uid>', methods=('GET',))
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
        **_get_render_data(),
    )


@app.route('/open-link', methods=('GET',))
def open_link():
    link = request.args['url']

    if webbrowser.open(link):
        return '', 204

    logger.critical(f'Failed to open browser link: {link}!')
    return abort(500, 'Could not open link!')


@app.route('/open-settings', methods=('GET',))
def open_settings():
    if not create_window('settings', '/settings', width=800, unique=True):
        return abort(500, 'Could not open settings window')
    return '', 204


@app.route('/open-send', methods=('GET', 'POST'))
def open_send():
    endpoint = '/send'

    if request.method == 'POST':
        data = request.get_json()
        message_data = get_or_400(data, 'message')
        message_data['reply_all'] = data.get('reply_all', False)
        message_data['forward'] = data.get('forward', False)

        uid = str(uuid4())
        SEND_WINDOW_DATA[uid] = message_data

        endpoint = f'/send/{uid}'

    if not create_window('new email', endpoint):
        return abort(500, 'Could not open send window')
    return '', 204


@app.route('/close-window', methods=('GET',))
def close_window():
    internal_id = request.args['window_id']
    destroy_window(internal_id)

    return '', 204


@app.route('/select-files')
def select_files():
    local_filenames = create_open_dialog(path.expanduser('~'))
    local_filenames = local_filenames or []
    return jsonify(filenames=local_filenames)
