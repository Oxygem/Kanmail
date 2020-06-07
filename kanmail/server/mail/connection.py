import ssl

from contextlib import contextmanager
from queue import LifoQueue
from smtplib import SMTP, SMTP_SSL
from socket import error as socket_error
from time import time

from imapclient import IMAPClient
from imapclient.exceptions import IMAPClientAbortError, IMAPClientError, LoginError

from kanmail.log import logger
from kanmail.secrets import get_password
from kanmail.settings.constants import DEBUG_SMTP

DEFAULT_ATTEMPTS = 3
DEFAULT_CONNECTIONS = 10
DEFAULT_TIMEOUT = 10


class ConnectionSettingsError(ValueError):
    account = None

    def __init__(self, account, *args, **kwargs):
        self.account = account
        super().__init__(*args, **kwargs)


class ImapConnectionError(OSError):
    account = None

    def __init__(self, account, *args, **kwargs):
        self.account = account
        super().__init__(*args, **kwargs)


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

            while True:
                try:
                    ret = func(*args, **kwargs)

                    took = (time() - start) * 1000
                    self.config.log('debug', (
                        f'Completed IMAP action: '
                        f'{key}({args}, {kwargs}) in {took}ms'
                    ))

                    return ret

                # Network issues/IMAP aborts - should fixed by reconnect
                except (
                    IMAPClientError,
                    IMAPClientAbortError,
                    LoginError,
                    socket_error,
                ) as e:
                    if attempts >= self.config.max_attempts:
                        raise ImapConnectionError(self.config.account, *e.args)

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
            raise ImapConnectionError(self.config.account, *e.args)

    def make_imap(self):
        server_string = (
            f'{self.config.username}@{self.config.host}:{self.config.port} '
            f'(ssl={self.config.ssl})'
        )
        self.config.log('debug', f'Connecting to IMAP server: {server_string}')

        ssl_context = ssl.create_default_context()
        if self.config.ssl_verify_hostname is False:
            self.config.log('warning', 'Disabling SSL hostname verification!')
            ssl_context.check_hostname = False

        imap = IMAPClient(
            self.config.host,
            port=self.config.port,
            ssl=self.config.ssl,
            ssl_context=ssl_context,
            timeout=self.config.timeout,
            use_uid=True,
        )
        imap.normalise_times = False

        username = self.config.username.encode('utf-8')
        password = self.config.password.encode('utf-8')
        imap.login(username, password)

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

        self.unselect_folder()
        self._selected_folder = None


class ImapConnectionPool(object):
    def __init__(
        self, account,
        host, port, username,
        password=None,
        ssl=True,
        ssl_verify_hostname=True,
        timeout=DEFAULT_TIMEOUT,
        max_connections=DEFAULT_CONNECTIONS,
        max_attempts=DEFAULT_ATTEMPTS,
    ):
        self.account = account
        self.host = host
        self.port = port
        self.username = username
        self.password = password
        self.ssl = ssl
        self.ssl_verify_hostname = ssl_verify_hostname
        self.timeout = timeout
        self.max_attempts = max_attempts

        self.pool = LifoQueue()

        # Push/start all the connections
        for _ in range(max_connections):
            self.pool.put(ImapConnectionWrapper(self))

    def log(self, method, message):
        func = getattr(logger, method)
        func(f'[IMAP Account: {self.account}]: {message}')

    @contextmanager
    def get_connection(self, selected_folder=None):
        if not self.password:
            self.password = get_password('account', self.host, self.username)

        if not self.password:
            raise ConnectionSettingsError(
                self.account,
                'Missing IMAP password! Please re-enter your password in settings.',
            )

        connection = self.pool.get()
        self.log('debug', f'Got connection from pool: {self.pool.qsize()} (-1)')

        try:
            if selected_folder:
                connection.set_selected_folder(selected_folder)

            yield connection

        finally:
            try:
                if selected_folder:
                    connection.unset_selected_folder()
            except Exception:
                self.log('warning', 'Failed to unselect folder!')

            self.pool.put(connection)
            self.log('debug', f'Returned connection to pool: {self.pool.qsize()} (+1)')


class SmtpConnection(object):
    def __init__(
        self, account,
        host, port, username,
        password=None,
        ssl=True,
        ssl_verify_hostname=True,
        tls=False,
    ):
        self.account = account
        self.host = host
        self.port = port
        self.username = username
        self.password = password
        self.ssl = ssl
        self.ssl_verify_hostname = ssl_verify_hostname
        self.tls = tls

    def __str__(self):
        return f'{self.host}:{self.port}'

    def log(self, method, message):
        func = getattr(logger, method)
        func(f'[SMTP Account: {self.account}]: {message}')

    @contextmanager
    def get_connection(self):
        if not self.password:
            self.password = get_password('account', self.host, self.username)

        if not self.password:
            raise ConnectionSettingsError(
                self.account,
                'Missing SMTP password! Please re-enter your password in settings.',
            )

        server_string = (
            f'{self.username}@{self.host}:{self.port} (ssl={self.ssl}, tls={self.tls})'
        )
        self.log('debug', f'Connecting to SMTP server: {server_string}')

        if self.ssl:
            ssl_context = ssl.create_default_context()
            if self.ssl_verify_hostname is False:
                self.log('warning', 'Disabling SSL hostname verification!')
                ssl_context.check_hostname = False

            smtp = SMTP_SSL(self.host, self.port, context=ssl_context)
        else:
            smtp = SMTP(self.host, self.port)

        if DEBUG_SMTP:
            smtp.set_debuglevel(1)

        smtp.connect(self.host, self.port)

        if self.tls:
            smtp.starttls()

        smtp.login(self.username, self.password)

        yield smtp

        smtp.quit()
