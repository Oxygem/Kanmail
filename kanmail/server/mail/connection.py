from __future__ import unicode_literals

from contextlib import contextmanager
from socket import error as socket_error
from time import time

from imapclient import IMAPClient
from imapclient.exceptions import IMAPClientAbortError
from six.moves.queue import LifoQueue

from kanmail.log import logger

MAX_ATTEMPTS = 10
MAX_CONNECTIONS = 10


class ConnectionWrapper(object):
    _imap = None

    def __init__(self, host, username, password, ssl=True):
        self.host = host
        self.username = username
        self.password = password
        self.ssl = ssl

    def __getattr__(self, key):
        if self._imap is None:
            self.make_imap()

        attr = getattr(self._imap, key)

        if not callable(attr):
            return attr

        def wrapper(*args, **kwargs):
            func = attr
            start = time()

            attempts = 0

            while attempts < MAX_ATTEMPTS:
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
                    logger.critical(f'IMAP error {attempts}/{MAX_ATTEMPTS}: {e}')
                    self.make_imap()
                    func = getattr(self._imap, key)

        return wrapper

    def make_imap(self):
        server_string = f'{self.username}:{self.password}@{self.host}'
        logger.debug(f'Connecting to server: {server_string}')

        imap = IMAPClient(self.host, ssl=self.ssl, use_uid=True)
        imap.login(self.username, self.password)
        imap.normalise_times = False

        self._imap = imap
        logger.info(f'Connected to server: {server_string}')


class ConnectionPool(object):
    def __init__(
        self, host, username, password,
        ssl=True,
        max_connections=MAX_CONNECTIONS,
    ):
        self.host = host
        self.username = username
        self.password = password
        self.ssl = ssl

        self.pool = LifoQueue()

        # Push/start all the connections
        for _ in range(max_connections):
            self.pool.put(self.create_connection())

    def create_connection(self):
        connection = ConnectionWrapper(
            self.host, self.username, self.password,
            ssl=self.ssl,
        )

        return connection

    @contextmanager
    def get_connection(self):
        connection = self.pool.get()
        logger.debug(f'Got connection from pool: {self.pool.qsize()} (-1)')

        try:
            yield connection

        finally:
            self.pool.put(connection)
            logger.debug(f'Returned connection to pool: {self.pool.qsize()} (+1)')
