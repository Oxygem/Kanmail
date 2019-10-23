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

    def __init__(self, config):
        self.config = config

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

            while attempts < self.config.max_attempts:
                try:
                    ret = func(*args, **kwargs)

                    took = (time() - start) * 1000
                    self.config.log('debug', (
                        f'Completed IMAP action: '
                        f'{key}({args}, {kwargs}) in {took}ms'
                    ))

                    return ret

                # Network issues/IMAP aborts - both should fixed by reconnect
                except (IMAPClientAbortError, socket_error) as e:
                    attempts += 1
                    self.config.log(
                        'critical',
                        f'IMAP error {attempts}/{self.config.max_attempts}: {e}',
                    )
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
            f'{self.config.username}@{self.config.host}:{self.config.port} '
            f'(ssl={self.config.ssl})'
        )
        self.config.log('debug', f'Connecting to IMAP server: {server_string}')

        imap = IMAPClient(
            self.config.host,
            port=self.config.port,
            ssl=self.config.ssl,
            timeout=self.config.timeout,
            use_uid=True,
        )
        imap.login(self.config.username, self.config.password)
        imap.normalise_times = False

        if self._selected_folder:
            imap.select_folder(self._selected_folder)

        self._imap = imap
        self.config.log('info', f'Connected to IMAP server: {server_string}')

    def set_selected_folder(self, selected_folder):
        self.select_folder(selected_folder)
        self._selected_folder = selected_folder

    def unset_selected_folder(self):
        if self._selected_folder is None:
            return

        self._selected_folder = None
        self.unselect_folder()


class ImapConnectionPool(object):
    def __init__(
        self, account, host, port, username, password,
        ssl=True, timeout=DEFAULT_TIMEOUT,
        max_connections=DEFAULT_CONNECTIONS,
        max_attempts=DEFAULT_ATTEMPTS,
    ):
        self.account = account
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

    def log(self, method, message):
        func = getattr(logger, method)
        func(f'[Account: {self.account.name}]: {message}')

    def create_connection(self):
        return ImapConnectionWrapper(self)

    @contextmanager
    def get_connection(self, selected_folder=None):
        connection = self.pool.get()
        self.log('debug', f'Got connection from pool: {self.pool.qsize()} (-1)')

        try:
            if selected_folder:
                connection.set_selected_folder(selected_folder)

            yield connection

            if selected_folder:
                connection.unset_selected_folder()

        finally:
            self.pool.put(connection)
            self.log('debug', f'Returned connection to pool: {self.pool.qsize()} (+1)')


class SmtpConnection(object):
    def __init__(self, account, host, port, username, password, ssl=True, tls=False):
        self.account = account
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
