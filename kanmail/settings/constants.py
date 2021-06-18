import platform
import sys

from os import environ, path
from uuid import uuid4

from click import get_app_dir


APP_NAME = 'Kanmail'

DEFAULT_WINDOW_WIDTH = 1400
DEFAULT_WINDOW_HEIGHT = 800
DEFAULT_WINDOW_LEFT = 0
DEFAULT_WINDOW_TOP = 0

SESSION_TOKEN = str(uuid4())

ALIAS_FOLDER_NAMES = ['inbox', 'sent', 'archive', 'drafts', 'trash', 'spam']


# App directory/filenames
#

# "App" directory for this user - settings/logs/cache go here
APP_DIR = environ.get('KANMAIL_APP_DIR', get_app_dir(APP_NAME))

# Cache directory
CACHE_DIR = path.join(APP_DIR, 'cache')
ICON_CACHE_DIR = path.join(CACHE_DIR, 'icons')

CONTACTS_CACHE_DB_FILE = path.join(CACHE_DIR, 'contacts.db')
FOLDER_CACHE_DB_FILE = path.join(CACHE_DIR, 'folders.db')

# Window settings/position cache filename
WINDOW_CACHE_FILE = path.join(CACHE_DIR, 'window_position.json')

# Device ID filename
DEVICE_ID_FILE = path.join(APP_DIR, '.device_id')

# Settings JSON filename
SETTINGS_FILE = path.join(APP_DIR, 'settings.json')

# License JSON filename
LICENSE_FILE = path.join(APP_DIR, 'license.json')

# Log filename
LOG_FILE = path.join(APP_DIR, 'Kanmail.log')


# Environment flags
#

# Flag to tell us whether we're running in debug mode
DEBUG = environ.get('KANMAIL_DEBUG') == 'on'
DEBUG_SMTP = environ.get('KANMAIL_DEBUG_SMTP') == 'on'
DEBUG_LOCKS = environ.get('KANMAIL_DEBUG_LOCKS') == 'on'
DEBUG_SENTRY = environ.get('KANMAIL_DEBUG_SENTRY') == 'on'
DEBUG_POSTHOG = environ.get('KANMAIL_DEBUG_POSTHOG') == 'on'

# Flag to tell us whether we're a frozen app (bundled)
FROZEN = getattr(sys, 'frozen', False)

# Flag to tell us whether we're running as an app (frozen or not)
IS_APP = environ.get('KANMAIL_MODE', 'app') == 'app'

# Flag to tell us whether to disable the cache
CACHE_ENABLED = (
    environ.get('KANMAIL_CACHE', 'on') == 'on'
    and not environ.get('KANMAIL_FAKE_IMAP') == 'on'  # never cache fake IMAP responses
)


# Get the client root directory - if we're frozen (by pyinstaller) this is relative
# to the executable, otherwise ./client.
CLIENT_ROOT = path.abspath(path.join(path.dirname(__file__), '..', 'client'))
META_FILE_ROOT = path.abspath(path.join(path.dirname(__file__), '..', '..'))
if FROZEN:
    CLIENT_ROOT = sys._MEIPASS  # type: ignore
    META_FILE_ROOT = sys._MEIPASS  # type: ignore


# Platform specific interface settings
PLATFORM = platform.system()
FRAMELESS = IS_APP and PLATFORM == 'Darwin' and environ.get('KANMAIL_FRAMELESS', 'on') == 'on'

platform_to_gui = {
    'Darwin': 'cocoa',
    'Linux': 'gtk',
    'Windows': 'winforms',
}
GUI_LIB = platform_to_gui[PLATFORM]


# External server settings
#

WEBSITE_URL = 'https://kanmail.io'

UPDATE_SERVER_URL = 'https://updates.kanmail.io'
LICENSE_SERVER_URL = 'https://keys.oxygem.com'

# Kanmail v1 app
LICENSE_SERVER_APP_TOKEN = '9AB769CBB209428A81F102C69715DEB5'

if DEBUG:
    # Kanmail v1 testing app
    LICENSE_SERVER_APP_TOKEN = 'A7BB82CDB48546F69C0C1E6F45C28FCB'

    # Make it possible to override these in dev for local testing
    UPDATE_SERVER_URL = environ.get('KANMAIL_UPDATE_SERVER_URL', UPDATE_SERVER_URL)
    LICENSE_SERVER_URL = environ.get('KANMAIL_LICENSE_SERVER_URL', LICENSE_SERVER_URL)


class PyUpdaterConfig(object):  # noqa: E302
    PUBLIC_KEY = 'c++zSv15DkOJItm9YoUvIbUBXZZaVWF8YheJlMoU0HU'
    COMPANY_NAME = 'Oxygem'
    APP_NAME = APP_NAME
    UPDATE_URLS = [UPDATE_SERVER_URL]
    MAX_DOWNLOAD_RETRIES = 3


# Server port settings
#

SERVER_HOST = '127.0.0.1'

if IS_APP and not DEBUG:
    SERVER_PORT = 0  # pick a random available port
else:
    SERVER_PORT = 4420
