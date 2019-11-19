import webbrowser

from uuid import uuid4

import webview

from kanmail.log import logger
from kanmail.settings import IS_APP, SERVER_PORT

ID_TO_WINDOW = {}  # internal ID -> window object
UNIQUE_NAME_TO_ID = {}  # name -> internal ID for unique windows


def create_window(endpoint='/', unique_key=False, **kwargs):
    internal_id = str(uuid4())
    link = f'http://localhost:{SERVER_PORT}{endpoint}?window_id={internal_id}'

    logger.debug(
        f'Opening window (#{internal_id}) '
        f'url={endpoint} kwargs={kwargs}',
    )

    if IS_APP:
        # Nuke any existing unique window
        if unique_key and unique_key in UNIQUE_NAME_TO_ID:
            old_window_id = UNIQUE_NAME_TO_ID.get(unique_key)
            if old_window_id:
                destroy_window(old_window_id)

        window = webview.create_window(
            'Kanmail', link,
            frameless=True,
            text_select=True,
            **kwargs,
        )
    else:
        window = None
        if not webbrowser.open(link):
            logger.warning('Failed to open browser window!')
            return False

    ID_TO_WINDOW[internal_id] = window

    if unique_key:
        UNIQUE_NAME_TO_ID[unique_key] = internal_id

    return internal_id


def destroy_window(internal_id):
    window = ID_TO_WINDOW.pop(internal_id, None)

    if window:
        try:
            window.destroy()
            return
        except KeyError:
            pass

    logger.warning(f'Tried to destroy non-existant window: {internal_id}')


def reload_main_window():
    if IS_APP:
        window = get_main_window()
        window.evaluate_js('window.location.reload()')


def get_main_window():
    return ID_TO_WINDOW[UNIQUE_NAME_TO_ID['main']]


def get_main_window_size_position():
    window = get_main_window()

    x, y = window.get_position()
    width, height = window.get_size()

    return {
        'left': x,
        'top': y,
        'width': width,
        'height': height,
    }


def create_save_dialog(directory, filename):
    window = get_main_window()

    return window.create_file_dialog(
        webview.SAVE_DIALOG,
        directory=directory,
        save_filename=filename,
    )


def create_open_dialog(allow_multiple=True):
    window = get_main_window()

    return window.create_file_dialog(
        webview.OPEN_DIALOG,
        allow_multiple=allow_multiple,
    )
