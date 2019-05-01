import webbrowser

from uuid import uuid4

import webview

from kanmail.log import logger
from kanmail.settings import DEBUG, IS_APP, SERVER_PORT

ID_TO_UID = {}  # internal ID -> UID (ID passed to window via url)
UNIQUE_NAME_TO_UID = {}  # name -> UID for unique windows


def create_window(title='Kanmail', endpoint='/', unique=False, **kwargs):
    internal_id = str(uuid4())
    link = f'http://localhost:{SERVER_PORT}{endpoint}?window_id={internal_id}'

    logger.debug(
        f'Opening window (#{internal_id}) '
        f'{title}: url={endpoint} kwargs={kwargs}',
    )

    if IS_APP:
        # Nuke any existing unique window
        if unique and title in UNIQUE_NAME_TO_UID:
            window_uid = UNIQUE_NAME_TO_UID[title]
            destroy_window(window_uid)

        window_uid = webview.create_window(
            title, link,
            debug=DEBUG,
            frameless=True,
            text_select=True,
            **kwargs,
        )

        ID_TO_UID[internal_id] = window_uid

        if unique:
            UNIQUE_NAME_TO_UID[title] = window_uid
    else:
        if not webbrowser.open(link):
            logger.warning('Failed to open browser window!')
            return False

    return internal_id


def destroy_window(internal_id):
    window_uid = ID_TO_UID[internal_id]
    if webview.window_exists(uid=window_uid):
        webview.destroy_window(uid=window_uid)
    else:
        logger.warning(f'Tried to destroy non-existant window: {internal_id}')


def reload_main_window():
    if IS_APP:
        webview.evaluate_js('window.location.reload()')
