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
                    logger.debug('Completed IMAP action: {0}({1}, {2}) in {3}ms'.format(
                        key, args, kwargs, took,
                    ))

                    return ret

                # Network issues/IMAP aborts - both should fixed by reconnect
                except (IMAPClientAbortError, socket_error) as e:
                    attempts += 1
                    logger.critical('IMAP error ({0}/{1}: {2}'.format(
                        attempts, MAX_ATTEMPTS, e,
                    ))
                    self.make_imap()
                    func = getattr(self._imap, key)

        return wrapper

    def make_imap(self):
        logger.debug('Connecting to server: {0}:{1}@{2}'.format(
            self.username, self.password, self.host,
        ))

        imap = IMAPClient(self.host, ssl=self.ssl, use_uid=True)
        imap.login(self.username, self.password)
        imap.normalise_times = False

        self._imap = imap

        logger.info('Connected to server: {0}:{1}@{2}'.format(
            self.username, self.password, self.host,
        ))


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
        logger.debug('Got connection from pool: {0} (-1)'.format(
            self.pool.qsize(),
        ))

        try:
            yield connection

        finally:
            self.pool.put(connection)
            logger.debug('Returned connection to pool: {0} (+1)'.format(
                self.pool.qsize(),
            ))
