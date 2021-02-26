import webbrowser

from os import environ
from typing import Tuple

from flask import abort, request

from kanmail.log import logger
from kanmail.server.app import app
from kanmail.window import create_window, destroy_window


@app.route('/open-link', methods=('GET',))
def open_link() -> Tuple[str, int]:
    link = request.args['url']

    # https://github.com/pyinstaller/pyinstaller/issues/3668
    xdg_data_dirs = environ.pop('XDG_DATA_DIRS', None)
    try:
        if webbrowser.open(link):
            return '', 204
    finally:
        if xdg_data_dirs:
            environ['XDG_DATA_DIRS'] = xdg_data_dirs

    logger.critical(f'Failed to open browser link: {link}!')
    abort(500, 'Could not open link!')


@app.route('/open-window', methods=('GET',))
def open_window() -> Tuple[str, int]:
    link = request.args['url']

    if not create_window(
        link,
        width=int(request.args['width']),
        height=int(request.args['height']),
        unique_key=request.args.get('unique_key'),
    ):
        abort(500, f'Could not open {link} window')
    return '', 204


@app.route('/close-window', methods=('GET',))
def close_window() -> Tuple[str, int]:
    destroy_window(request.args['window_id'])
    return '', 204
