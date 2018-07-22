import webbrowser

from os import environ
from uuid import uuid4

from flask import abort, render_template, request

from kanmail import settings
from kanmail.log import logger
from kanmail.server.app import app, open_window_process_queue, send_window_data
from kanmail.version import __version__


@app.route('/', methods=['GET'])
def index():
    return render_template(
        'index.html',
        version=__version__,
        debug=not settings.FROZEN,
    )


@app.route('/send', methods=['GET'])
def send():
    return render_template(
        'send.html',
        debug=not settings.FROZEN,
    )


@app.route('/send/<uid>', methods=['GET'])
def send_reply(uid):
    try:
        # TODO: pop if not debug!
        reply = send_window_data.get(uid)
    except KeyError:
        abort(404, 'Reply message not found!')

    return render_template(
        'send.html',
        reply=reply,
        debug=not settings.FROZEN,
    )


@app.route('/open-link', methods=['GET'])
def open_link():
    link = request.args['url']

    if webbrowser.open(link):
        return '', 204

    logger.critical('Failed to open browser link: {0}!'.format(link))
    return abort(500, 'Could not open link!')


@app.route('/open-send', methods=['GET', 'POST'])
def open_send():
    link = 'http://localhost:4420/send'

    if request.method == 'POST':
        data = request.get_json()
        uid = str(uuid4())

        send_window_data[uid] = data
        link = 'http://localhost:4420/send/{0}'.format(uid)

    if environ.get('KANMAIL_MODE') == 'server':
        if webbrowser.open(link):
            return '', 204

    else:
        open_window_process_queue.put((
            'Kanmail: new email',
            link,
            {'debug': True},
        ))

        return '', 204

    logger.critical('Failed to open send window!')
    return abort(500, 'Could not open send window!')
