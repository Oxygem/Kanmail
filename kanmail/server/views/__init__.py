import webbrowser

from uuid import uuid4

from flask import abort, render_template, request

from kanmail import settings
from kanmail.log import logger
from kanmail.server.app import app
from kanmail.server.mail.contacts import get_contacts
from kanmail.server.util import get_or_400
from kanmail.version import __version__
from kanmail.window import create_window


send_window_data = {}


@app.route('/', methods=['GET'])
def get_index():
    return render_template(
        'index.html',
        version=__version__,
        frozen=settings.FROZEN,
        debug=settings.DEBUG,
    )


@app.route('/settings', methods=['GET'])
def get_settings():
    return render_template(
        'settings.html',
        frozen=settings.FROZEN,
        debug=settings.DEBUG,
    )


@app.route('/send', methods=['GET'])
def get_send():
    return render_template(
        'send.html',
        contacts=get_contacts(),
        frozen=settings.FROZEN,
        debug=settings.DEBUG,
    )


@app.route('/send/<uid>', methods=['GET'])
def get_send_reply(uid):
    if settings.DEBUG:
        reply = send_window_data.get(uid)
    else:
        reply = send_window_data.pop(uid, None)

    if not reply:
        abort(404, 'Reply message not found!')

    return render_template(
        'send.html',
        reply=reply,
        contacts=get_contacts(),
        frozen=settings.FROZEN,
        debug=settings.DEBUG,
    )


@app.route('/open-link', methods=['GET'])
def open_link():
    link = request.args['url']

    if webbrowser.open(link):
        return '', 204

    logger.critical('Failed to open browser link: {0}!'.format(link))
    return abort(500, 'Could not open link!')


def _open_window(name, endpoint):
    link = 'http://localhost:{0}{1}'.format(settings.SERVER_PORT, endpoint)

    if settings.IS_APP:
        create_window(name, endpoint)
        return '', 204
    else:
        if webbrowser.open(link):
            return '', 204

    logger.critical('Failed to open {0} window!'.format(name))
    return abort(500, 'Could not open {0} window!'.format(name))


@app.route('/open-settings', methods=['GET'])
def open_settings():
    return _open_window('settings', '/settings')


@app.route('/open-send', methods=['GET', 'POST'])
def open_send():
    endpoint = '/send'

    if request.method == 'POST':
        data = request.get_json()
        message_data = get_or_400(data, 'message')
        message_data['reply_all'] = data.get('reply_all', False)

        uid = str(uuid4())
        send_window_data[uid] = message_data

        endpoint = '/send/{0}'.format(uid)

    return _open_window('new email', endpoint)
