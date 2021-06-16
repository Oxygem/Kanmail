import webbrowser

from os import environ
from typing import Tuple

from flask import abort, request

from kanmail.log import logger
from kanmail.server.app import add_route
from kanmail.window import create_window, destroy_window, resize_window


@add_route('/open-link', methods=('GET',))
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


@add_route('/open-window', methods=('GET',))
def open_window() -> Tuple[str, int]:
    link = request.args['url']

    if not create_window(
        link,
        width=int(request.args['width']),
        height=int(request.args['height']),
        unique_key=request.args.get('unique_key'),
        confirm_close=request.args.get('confirm_close'),
        resizable=not (request.args.get('resizable') == 'false'),
    ):
        abort(500, f'Could not open {link} window')
    return '', 204


@add_route('/close-window', methods=('GET',))
def close_window() -> Tuple[str, int]:
    destroy_window(request.args['window_id'])
    return '', 204


@add_route('/resize-window', methods=('GET',))
def window_resize() -> Tuple[str, int]:
    resize_window(
        request.args['window_id'],
        width=int(request.args['width']),
        height=int(request.args['height']),
    )
    return '', 204
