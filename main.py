import sys

from threading import Thread
from time import sleep

import requests
import webview

from kanmail.license import validate_or_remove_license
from kanmail.log import logger
from kanmail.server.app import app, boot
from kanmail.server.mail.folder_cache import (
    remove_stale_folders,
    remove_stale_headers,
    vacuum_folder_cache,
)
from kanmail.settings import get_window_settings
from kanmail.settings.constants import (
    DEBUG,
    GUI_LIB,
    SERVER_HOST,
    SERVER_PORT,
)
from kanmail.version import get_version
from kanmail.window import create_window, destroy_main_window


def run_cache_cleanup_later():
    sleep(120)  # TODO: make this more intelligent?
    remove_stale_folders()
    remove_stale_headers()
    vacuum_folder_cache()


def run_server():
    logger.debug(f'Starting server on {SERVER_HOST}:{SERVER_PORT}')

    try:
        boot()
        app.run(
            host=SERVER_HOST,
            port=SERVER_PORT,
            debug=DEBUG,
            threaded=True,
            # We can't use the reloader within a thread as it needs signal support
            use_reloader=False,
        )

    except Exception as e:
        logger.exception(f'Exception in server thread!: {e}')


def monitor_threads(*threads):
    while True:
        for thread in threads:
            if not thread.is_alive():
                logger.critical(f'Thread: {thread} died, exiting!')
                destroy_main_window()
        else:
            sleep(0.5)


def run_thread(target):
    def wrapper(thread_name):
        try:
            target()
        except Exception as e:
            logger.exception(f'Unexpected exception in thread {thread_name}!: {e}')

    thread = Thread(
        target=wrapper,
        args=(target.__name__,),
    )
    thread.daemon = True
    thread.start()


def main():
    logger.info(f'\n#\n# Booting Kanmail {get_version()}\n#')

    server_thread = Thread(name='Server', target=run_server)
    server_thread.daemon = True
    server_thread.start()

    run_thread(validate_or_remove_license)
    run_thread(run_cache_cleanup_later)

    # Ensure the webserver is up & running by polling it
    waits = 0
    while waits < 10:
        try:
            response = requests.get(f'http://{SERVER_HOST}:{SERVER_PORT}/ping')
            response.raise_for_status()
        except requests.RequestException as e:
            logger.warning(f'Waiting for main window: {e}')
            sleep(0.1 * waits)
            waits += 1
        else:
            break
    else:
        logger.critical('Webserver did not start properly!')
        sys.exit(2)

    create_window(
        unique_key='main',
        **get_window_settings(),
    )

    # Let's hope this thread doesn't fail!
    monitor_thread = Thread(
        name='Thread monitor',
        target=monitor_threads,
        args=(server_thread,),
    )
    monitor_thread.daemon = True
    monitor_thread.start()

    # Start the GUI - this will block until the main window is destroyed
    webview.start(gui=GUI_LIB, debug=DEBUG)

    # Main window closed, cleanup/exit
    sys.exit()


if __name__ == '__main__':
    main()
