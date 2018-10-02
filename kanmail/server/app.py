import sys

from os import environ, path

from flask import Flask
from flask.json import JSONEncoder

from kanmail import settings
from kanmail.log import logger


# Get the root directory - if we're frozen (by pyinstaller) this is relative
# to the executable, otherwise ../client.
ROOT = path.abspath(path.join(path.dirname(__file__), '..', 'client'))
if settings.FROZEN:
    ROOT = sys._MEIPASS


class JsonEncoder(JSONEncoder):
    def default(self, obj):
        if isinstance(obj, bytes):
            return obj.decode()

        return super(JsonEncoder, self).default(obj)


app = Flask(
    'kanmail',
    static_folder=path.join(ROOT, 'static'),
    template_folder=path.join(ROOT, 'templates'),
)
app.json_encoder = JsonEncoder
app.config['JSON_SORT_KEYS'] = False


def boot():
    logger.debug('App root is: {0}'.format(ROOT))

    if environ.get('KANMAIL_FAKE_IMAP') == 'on':
        logger.debug('Using fixtures, faking the IMAP client & responses!')
        from kanmail.server.mail.fake_imap import bootstrap_fake_imap
        bootstrap_fake_imap()

    from kanmail.server.views import error  # noqa: F401
    from kanmail.server.views import settings_api  # noqa: F401
    from kanmail.server.views import email_api  # noqa: F401
