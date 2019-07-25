from __future__ import unicode_literals

from contextlib import contextmanager
from smtplib import SMTP, SMTP_SSL
from socket import error as socket_error
from time import time

from imapclient import IMAPClient
from imapclient.exceptions import IMAPClientAbortError
from six.moves.queue import LifoQueue

from kanmail.log import logger

DEFAULT_ATTEMPTS = 10
DEFAULT_CONNECTIONS = 10
DEFAULT_TIMEOUT = 10


class ImapConnectionError(OSError):
    pass


class ImapConnectionWrapper(object):
    _imap = None
    _selected_folder = None

    def __init__(
        self, host, port, username, password,
        ssl=True,
        timeout=DEFAULT_TIMEOUT,
        max_attempts=DEFAULT_ATTEMPTS,
    ):
        self.host = host
        self.port = port
        self.username = username
        self.password = password
        self.ssl = ssl
        self.timeout = timeout
        self.max_attempts = max_attempts

    def __getattr__(self, key):
        if self._imap is None:
            self.try_make_imap()

        attr = getattr(self._imap, key)

        if not callable(attr):
            return attr

        def wrapper(*args, **kwargs):
            func = attr
            start = time()

            attempts = 0

            while attempts < self.max_attempts:
                try:
                    ret = func(*args, **kwargs)

                    took = (time() - start) * 1000
                    logger.debug((
                        f'Completed IMAP action: '
                        f'{key}({args}, {kwargs}) in {took}ms'
                    ))

                    return ret

                # Network issues/IMAP aborts - both should fixed by reconnect
                except (IMAPClientAbortError, socket_error) as e:
                    attempts += 1
                    logger.critical(f'IMAP error {attempts}/{self.max_attempts}: {e}')
                    self.try_make_imap()
                    func = getattr(self._imap, key)

        return wrapper

    def try_make_imap(self):
        try:
            self.make_imap()
        except OSError as e:
            raise ImapConnectionError(*e.args)

    def make_imap(self):
        server_string = (
            f'{self.username}@{self.host}:{self.port} (ssl={self.ssl})'
        )
        logger.debug(f'Connecting to IMAP server: {server_string}')

        imap = IMAPClient(
            self.host,
            port=self.port, ssl=self.ssl, timeout=self.timeout,
            use_uid=True,
        )
        imap.login(self.username, self.password)
        imap.normalise_times = False

        if self._selected_folder:
            imap.select_folder(self._selected_folder)

        self._imap = imap
        logger.info(f'Connected to IMAP server: {server_string}')

    def set_selected_folder(self, selected_folder):
        self._selected_folder = selected_folder
        self.select_folder(selected_folder)

    def unset_selected_folder(self):
        self._selected_folder = None
        self.unselect_folder()


class ImapConnectionPool(object):
    def __init__(
        self, host, port, username, password,
        ssl=True, timeout=DEFAULT_TIMEOUT,
        max_connections=DEFAULT_CONNECTIONS,
        max_attempts=DEFAULT_ATTEMPTS,
    ):
        self.host = host
        self.port = port
        self.username = username
        self.password = password
        self.ssl = ssl
        self.timeout = timeout
        self.max_attempts = max_attempts

        self.pool = LifoQueue()

        # Push/start all the connections
        for _ in range(max_connections):
            self.pool.put(self.create_connection())

    def create_connection(self):
        connection = ImapConnectionWrapper(
            self.host, self.port, self.username, self.password,
            ssl=self.ssl, timeout=self.timeout, max_attempts=self.max_attempts,
        )

        return connection

    @contextmanager
    def get_connection(self, selected_folder=None):
        connection = self.pool.get()
        logger.debug(f'Got connection from pool: {self.pool.qsize()} (-1)')

        try:
            if selected_folder:
                connection.set_selected_folder(selected_folder)

            yield connection

            if selected_folder:
                connection.unset_selected_folder()

        finally:
            self.pool.put(connection)
            logger.debug(f'Returned connection to pool: {self.pool.qsize()} (+1)')


class SmtpConnection(object):
    def __init__(self, host, port, username, password, ssl=True, tls=False):
        self.host = host
        self.port = port
        self.username = username
        self.password = password
        self.ssl = ssl
        self.tls = tls

    def __str__(self):
        return f'{self.host}:{self.port}'

    @contextmanager
    def get_connection(self):
        server_string = (
            f'{self.username}@{self.host}:{self.port} (ssl={self.ssl}, tls={self.tls})'
        )
        logger.debug(f'Connecting to SMTP server: {server_string}')

        cls = SMTP_SSL if self.ssl else SMTP

        smtp = cls(self.host, self.port)
        # smtp.set_debuglevel(1)
        smtp.connect(self.host, self.port)

        if self.tls:
            smtp.starttls()

        smtp.login(self.username, self.password)

        yield smtp

        smtp.quit()
