import webview

from kanmail.log import logger
from kanmail.settings import DEBUG, SERVER_PORT

UNIQUE_NAME_TO_UID = {}


def create_window(title='Kanmail', endpoint='/', unique=False, **kwargs):
    if unique and title in UNIQUE_NAME_TO_UID:
        window_uid = UNIQUE_NAME_TO_UID[title]
        if webview.window_exists(uid=window_uid):
            webview.destroy_window(uid=window_uid)

    link = f'http://localhost:{SERVER_PORT}{endpoint}'

    logger.debug(f'Opening window {title}: url={endpoint} kwargs={kwargs}')

    window_uid = webview.create_window(
        title, link,
        debug=DEBUG,
        frameless=True,
        text_select=True,
        **kwargs,
    )

    if unique:
        UNIQUE_NAME_TO_UID[title] = window_uid

    return window_uid
