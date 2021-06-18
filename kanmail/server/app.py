from os import environ, path
from sqlite3 import Connection as SQLite3Connection
from typing import Union

import sentry_sdk

from cheroot.wsgi import Server
from flask import abort, Flask, request
from flask.json import JSONEncoder
from flask_sqlalchemy import SQLAlchemy
from sentry_sdk.integrations.flask import FlaskIntegration
from sqlalchemy import event
from sqlalchemy.engine import Engine

from kanmail.log import logger
from kanmail.settings import get_device_id
from kanmail.settings.constants import (
    APP_NAME,
    CLIENT_ROOT,
    CONTACTS_CACHE_DB_FILE,
    DEBUG,
    DEBUG_SENTRY,
    FOLDER_CACHE_DB_FILE,
    IS_APP,
    SERVER_HOST,
    SERVER_PORT,
    SESSION_TOKEN,
)
from kanmail.settings.hidden import get_hidden_value


@event.listens_for(Engine, 'connect')
def enable_sqlite_foreign_keys(dbapi_connection, connection_record) -> None:
    if isinstance(dbapi_connection, SQLite3Connection):
        cursor = dbapi_connection.cursor()
        cursor.execute('PRAGMA foreign_keys=ON;')
        cursor.close()


class JsonEncoder(JSONEncoder):
    def default(self, obj) -> Union[str, int]:
        if isinstance(obj, bytes):
            try:
                return obj.decode()
            except UnicodeDecodeError:
                return obj.decode('utf-8', 'ignore')

        return super(JsonEncoder, self).default(obj)


if DEBUG and not DEBUG_SENTRY:
    logger.debug('Not enabling Sentry error logging in debug mode...')
else:
    sentry_sdk.init(
        dsn=get_hidden_value('SENTRY_DSN'),
        integrations=[FlaskIntegration()],
        # Don't send stack variables, potentially containing email data
        with_locals=False,
    )
    # Random identifier for this Kanmail install (no PII)
    sentry_sdk.set_user({'id': get_device_id()})

app = Flask(
    APP_NAME,
    static_folder=path.join(CLIENT_ROOT, 'static'),
    template_folder=path.join(CLIENT_ROOT, 'templates'),
)
app.json_encoder = JsonEncoder
app.config['JSON_SORT_KEYS'] = False


app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {'connect_args': {'timeout': 30}}
app.config['SQLALCHEMY_BINDS'] = {
    'contacts': f'sqlite:///{CONTACTS_CACHE_DB_FILE}',
    'folders': f'sqlite:///{FOLDER_CACHE_DB_FILE}',
}
db = SQLAlchemy(app)


class ServerWithGetPort(Server):
    def get_port(self):
        if not hasattr(self, 'socket'):
            return SERVER_PORT
        return self.socket.getsockname()[1]


server = ServerWithGetPort((SERVER_HOST, SERVER_PORT), app)


def add_route(*route_args, **route_kwargs):
    if DEBUG and not IS_APP:  # don't apply in full browser dev mode
        return add_public_route(*route_args, **route_kwargs)

    def wrapper(func):
        def inner(*args, **kwargs):
            # Accept as header (preferred) and query string (images)
            session_token = request.headers.get(
                'Kanmail-Session-Token',
                request.args.get('Kanmail-Session-Token'),
            )
            if session_token != SESSION_TOKEN:
                abort(401, 'Invalid session token provided!')

            return func(*args, **kwargs)
        route_kwargs['endpoint'] = func.__name__
        return app.route(*route_args, **route_kwargs)(inner)
    return wrapper


def add_public_route(*args, **kwargs):
    return app.route(*args, **kwargs)


def boot(prepare_server: bool = True) -> None:
    if prepare_server:
        server.prepare()

    logger.debug(f'App client root is: {CLIENT_ROOT}')
    logger.debug(f'App session token is: {SESSION_TOKEN}')
    logger.debug(f'App server port: http://{SERVER_HOST}:{server.get_port()}')

    if environ.get('KANMAIL_FAKE_IMAP') == 'on':
        logger.debug('Using fixtures, faking the IMAP client & responses!')
        from kanmail.server.mail.connection_mocks import bootstrap_fake_connections
        bootstrap_fake_connections()

    from kanmail import secrets  # noqa: F401

    from kanmail.server.views import error  # noqa: F401

    # API views
    from kanmail.server.views import (  # noqa: F401
        accounts_api,
        contacts_api,
        email_api,
        license_api,
        oauth_api,
        settings_api,
        update_api,
        window_api,
    )

    # Database models
    from kanmail.server.mail.contacts import Contact  # noqa: F401
    from kanmail.server.mail.allowed_images import AllowedImage  # noqa: F401

    db.create_all()
