from threading import Thread
from time import sleep

import webview

from kanmail import settings
from kanmail.log import logger
from kanmail.server.app import app, boot, open_window_process_queue


def open_windows_thread():
    try:
        while True:
            open_window_target = open_window_process_queue.get()
            name, target, kwargs = open_window_target

            webview.create_window(name, target, frameless=True, **kwargs)

    except Exception as e:
        logger.critical('Exception in window thread!: {0}'.format(e))


def run_server_thread():
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
        logger.critical('Exception in server thread!: {0}'.format(e))


def monitor_threads(*threads):
    while True:
        for thread in threads:
            if not thread.is_alive():
                logger.critical('Thread: {0} died, exiting!'.format(thread))
                webview.destroy_window()
        else:
            sleep(0.5)


def main():
    server_thread = Thread(name='Server', target=run_server_thread)
    server_thread.daemon = True
    server_thread.start()

    open_thread = Thread(name='Window opener', target=open_windows_thread)
    open_thread.daemon = True
    open_thread.start()

    monitor_thread = Thread(
        name='Thread monitor',
        target=monitor_threads,
        args=(server_thread, open_thread),
    )
    monitor_thread.daemon = True
    monitor_thread.start()

    # First/main call to webview, blocking - when this is quit the threads will
    # all be killed off (daemon=True).
    webview.create_window(
        'Kanmail',
        'http://localhost:{0}'.format(settings.SERVER_PORT),
        debug=settings.DEBUG,
        width=settings.WINDOW_WIDTH,
        height=settings.WINDOW_HEIGHT,
        # frameless=True,
    )


if __name__ == '__main__':
    main()
