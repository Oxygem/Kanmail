from threading import Thread
from time import sleep

import webview

from kanmail import settings
from kanmail.device import register_or_ping_device, update_device
from kanmail.log import logger
from kanmail.server.app import app, boot
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
        logger.exception('Exception in server thread!: {0}'.format(e))


def monitor_threads(*threads):
    while True:
        for thread in threads:
            if not thread.is_alive():
                logger.critical('Thread: {0} died, exiting!'.format(thread))
                webview.destroy_window()
        else:
            sleep(0.5)


def register_and_update_device():
    try:
        register_or_ping_device()
        update_device()
    except Exception as e:
        logger.exception('Exception in register & update thread!: {0}'.format(e))


def main():
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

    # Register & attempt update immediately - we don't kill the whole app if
    # this fails as it's non-essential stuff.
    register_update_thread = Thread(
        name='Register & check for updates',
        target=register_and_update_device,
    )
    register_update_thread.daemon = True
    register_update_thread.start()

    # First/main call to webview, blocking - when this is quit the threads will
    # all be killed off (daemon=True).
    create_window(
        width=settings.WINDOW_WIDTH,
        height=settings.WINDOW_HEIGHT,
    )


if __name__ == '__main__':
    main()
