from threading import Thread
from time import sleep

import webview

from kanmail import settings
from kanmail.device import register_or_ping_device
from kanmail.log import logger
from kanmail.server.app import app, boot
from kanmail.version import get_version
from kanmail.window import create_window


def run_server():
    try:
        boot()
        app.run(
            port=settings.SERVER_PORT,
            debug=settings.DEBUG,
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
                webview.destroy_window()
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

    # Let's hope this thread doesn't fail!
    monitor_thread = Thread(
        name='Thread monitor',
        target=monitor_threads,
        args=(server_thread,),
    )
    monitor_thread.daemon = True
    monitor_thread.start()

    # Register/ping immediately - without caring if it fails
    run_thread(register_or_ping_device)

    # First/main call to webview, blocking - when this is quit the threads will
    # all be killed off (daemon=True).
    create_window(
        width=settings.WINDOW_WIDTH,
        height=settings.WINDOW_HEIGHT,
    )


if __name__ == '__main__':
    main()
