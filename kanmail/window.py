from typing import Dict, Optional, Union
from uuid import uuid4

import webview

from kanmail.log import logger
from kanmail.settings.constants import DEBUG, FRAMELESS, IS_APP, SERVER_PORT

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


def resize_window(internal_id: str, width: int, height: int) -> None:
    window = ID_TO_WINDOW[internal_id]

    if window:
        window.resize(width, height)

    logger.warning(f'Tried to resize non-existant window: {internal_id}')


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


def show_traffic_light_buttons(window):
    import AppKit

    buttons = [
        window.standardWindowButton_(AppKit.NSWindowCloseButton),
        window.standardWindowButton_(AppKit.NSWindowZoomButton),
        window.standardWindowButton_(AppKit.NSWindowMiniaturizeButton),
    ]

    for button in buttons:
        button.setHidden_(False)


def reposition_traffic_light_buttons(window):
    import AppKit

    button = window.standardWindowButton_(AppKit.NSWindowCloseButton)
    titlebar_container_view = button.superview().superview()
    titlebar_container_rect = titlebar_container_view.frame()
    titlebar_container_rect.size.height += 22
    titlebar_container_rect.origin.y -= 13
    titlebar_container_rect.size.width += 22
    titlebar_container_rect.origin.x += 13
    titlebar_container_view._.frame = AppKit.NSValue.valueWithRect_(titlebar_container_rect)


def init_window_hacks() -> None:
    try:
        from webview.platforms import cocoa
    except ImportError:
        pass
    else:
        # Normally set by webview.start but importing cocoa before breaks that
        cocoa._debug = DEBUG

        class CustomBrowserView(cocoa.BrowserView):
            def first_show(self, *args, **kwargs):
                show_traffic_light_buttons(self.window)
                reposition_traffic_light_buttons(self.window)
                super().first_show(*args, **kwargs)

        class CustomWindowDelegate(cocoa.BrowserView.WindowDelegate):
            def windowDidResize_(self, notification):
                reposition_traffic_light_buttons(notification.object())

        cocoa.BrowserView = CustomBrowserView
        cocoa.BrowserView.WindowDelegate = CustomWindowDelegate
