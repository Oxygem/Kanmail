from os import environ, path
from sqlite3 import Connection as SQLite3Connection

from flask import Flask
from flask.json import JSONEncoder
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import event
from sqlalchemy.engine import Engine

from kanmail.log import logger
from kanmail.settings import (
    CLIENT_ROOT,
    CONTACTS_CACHE_DB_FILE,
    FOLDER_CACHE_DB_FILE,
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
    'kanmail',
    static_folder=path.join(CLIENT_ROOT, 'static'),
    template_folder=path.join(CLIENT_ROOT, 'templates'),
)
app.json_encoder = JsonEncoder
app.config['JSON_SORT_KEYS'] = False


app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SQLALCHEMY_BINDS'] = {
    'contacts': f'sqlite:///{CONTACTS_CACHE_DB_FILE}',
    'folders': f'sqlite:///{FOLDER_CACHE_DB_FILE}',
}
db = SQLAlchemy(app)


def boot() -> None:
    logger.debug(f'App client root is: {CLIENT_ROOT}')

    if environ.get('KANMAIL_FAKE_IMAP') == 'on':
        logger.debug('Using fixtures, faking the IMAP client & responses!')
        from kanmail.server.mail.fake_imap import bootstrap_fake_imap
        bootstrap_fake_imap()

    from kanmail.server.views import error  # noqa: F401

    # API views
    from kanmail.server.views import accounts_api  # noqa: F401
    from kanmail.server.views import contacts_api  # noqa: F401
    from kanmail.server.views import email_api  # noqa: F401
    from kanmail.server.views import settings_api  # noqa: F401
    from kanmail.server.views import update_api  # noqa: F401

    # Database models
    from kanmail.server.mail.contacts import Contact  # noqa: F401

    db.create_all()
