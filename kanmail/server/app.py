from os import environ, path

from flask import Flask
from flask.json import JSONEncoder
from flask_sqlalchemy import SQLAlchemy

from kanmail.log import logger
from kanmail.settings import (
    CLIENT_ROOT,
    CONTACTS_CACHE_DB_FILE,
    FOLDER_CACHE_DB_FILE,
)


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

    from kanmail.server.views import accounts_api  # noqa: F401
    from kanmail.server.views import error  # noqa: F401
    from kanmail.server.views import settings_api  # noqa: F401
    from kanmail.server.views import email_api  # noqa: F401
    from kanmail.server.views import update_api  # noqa: F401

    from kanmail.server.mail.contacts import Contact  # noqa: F401

    db.create_all()
