from os import environ, path
from sqlite3 import Connection as SQLite3Connection

from flask import abort, Flask, request
from flask.json import JSONEncoder
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import event
from sqlalchemy.engine import Engine

from kanmail.log import logger
from kanmail.settings.constants import (
    APP_NAME,
    CLIENT_ROOT,
    CONTACTS_CACHE_DB_FILE,
    DEBUG,
    FOLDER_CACHE_DB_FILE,
    IS_APP,
    SERVER_HOST,
    SERVER_PORT,
    SESSION_TOKEN,
)


@event.listens_for(Engine, 'connect')
def enable_sqlite_foreign_keys(dbapi_connection, connection_record):
    if isinstance(dbapi_connection, SQLite3Connection):
        cursor = dbapi_connection.cursor()
        cursor.execute('PRAGMA foreign_keys=ON;')
        cursor.close()


class JsonEncoder(JSONEncoder):
    def default(self, obj):
        if isinstance(obj, bytes):
            try:
                return obj.decode()
            except UnicodeDecodeError:
                return obj.decode('utf-8', 'ignore')

        return super(JsonEncoder, self).default(obj)


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


@app.before_request
def validate_session_token():
    if DEBUG and not IS_APP:  # don't apply in full dev mode
        return

    if request.path.startswith('/api'):
        session_token = request.headers.get('Kanmail-Session-Token')
        if session_token != SESSION_TOKEN:
            abort(401, 'Invalid session token provided!')


def boot() -> None:
    logger.debug(f'App client root is: {CLIENT_ROOT}')
    logger.debug(f'App session token is: {SESSION_TOKEN}')
    logger.debug(f'App server port: http://{SERVER_HOST}:{SERVER_PORT}')

    if environ.get('KANMAIL_FAKE_IMAP') == 'on':
        logger.debug('Using fixtures, faking the IMAP client & responses!')
        from kanmail.server.mail.fake_imap import bootstrap_fake_imap
        bootstrap_fake_imap()

    from kanmail import secrets  # noqa: F401

    from kanmail.server.views import error  # noqa: F401

    # API views
    from kanmail.server.views import (  # noqa: F401
        accounts_api,
        contacts_api,
        email_api,
        license_api,
        settings_api,
        update_api,
        window_api,
    )

    # Database models
    from kanmail.server.mail.contacts import Contact  # noqa: F401

    db.create_all()
