from typing import Dict, Optional, Union
from uuid import uuid4

import webview

from kanmail.log import logger
from kanmail.settings.constants import FRAMELESS, IS_APP, SERVER_PORT

ID_TO_WINDOW = {}  # internal ID -> window object
UNIQUE_NAME_TO_ID = {}  # name -> internal ID for unique windows


def create_window(
    endpoint: str = '/',
    unique_key: Optional[str] = None,
    **kwargs,
) -> Union[str, bool]:
    if not IS_APP:
        logger.warning('Cannot open window in server mode!')
        return False

    internal_id = str(uuid4())
    link = f'http://localhost:{SERVER_PORT}{endpoint}?window_id={internal_id}'

    logger.debug(
        f'Opening window (#{internal_id}) '
        f'url={endpoint} kwargs={kwargs}',
    )

    # Nuke any existing unique window
    if unique_key and unique_key in UNIQUE_NAME_TO_ID:
        old_window_id = UNIQUE_NAME_TO_ID.get(unique_key)
        if old_window_id:
            destroy_window(old_window_id)

    window = webview.create_window(
        'Kanmail', link,
        frameless=FRAMELESS,
        easy_drag=False,
        text_select=True,
        **kwargs,
    )

    ID_TO_WINDOW[internal_id] = window

    if unique_key:
        UNIQUE_NAME_TO_ID[unique_key] = internal_id

    return internal_id


def destroy_window(internal_id: str) -> None:
    window = ID_TO_WINDOW.pop(internal_id, None)

    if window:
        try:
            window.destroy()
        except KeyError:  # happens if the window has already been destroyed (user close)
            pass
        else:
            return

    logger.warning(f'Tried to destroy non-existant window: {internal_id}')


def minimize_window(internal_id: str) -> None:
    window = ID_TO_WINDOW.get(internal_id, None)

    if window:
        window.minimize()
        return

    logger.warning(f'Tried to minimize non-existant window: {internal_id}')


def maximize_window(internal_id: str) -> None:
    window = ID_TO_WINDOW.get(internal_id, None)

    if window:
        window.toggle_fullscreen()
        return

    logger.warning(f'Tried to maximize non-existant window: {internal_id}')


def reload_main_window() -> None:
    if IS_APP:
        window = get_main_window()
        window.evaluate_js('window.location.reload()')


def get_main_window() -> webview.Window:
    return ID_TO_WINDOW[UNIQUE_NAME_TO_ID['main']]


def destroy_main_window() -> None:
    destroy_window(UNIQUE_NAME_TO_ID['main'])


def get_main_window_size_position() -> Dict[str, int]:
    window = get_main_window()
    return {
        'left': window.x,
        'top': window.y,
        'width': window.width,
        'height': window.height,
    }
