import platform
import sys

from os import environ, path

from click import get_app_dir


APP_NAME = 'Kanmail'

SERVER_PORT = 4420

DEFAULT_WINDOW_WIDTH = 1400
DEFAULT_WINDOW_HEIGHT = 800
DEFAULT_WINDOW_LEFT = 0
DEFAULT_WINDOW_TOP = 0


# App directory/filenames
#

# "App" directory for this user - settings/logs/cache go here
APP_DIR = get_app_dir(APP_NAME)

# Cache directory
CACHE_DIR = path.join(APP_DIR, 'cache')

CONTACTS_CACHE_DB_FILE = path.join(CACHE_DIR, 'contacts.db')
FOLDER_CACHE_DB_FILE = path.join(CACHE_DIR, 'folders.db')

# Device ID cache filename
DEVICE_ID_FILE = path.join(CACHE_DIR, '.device_id')
# Window settings/position cache filename
WINDOW_CACHE_FILE = path.join(CACHE_DIR, '.window_position')

# Settings JSON filename
SETTINGS_FILE = path.join(APP_DIR, 'settings.json')

# Log filename
LOG_FILE = path.join(APP_DIR, 'Kanmail.log')


# Environment flags
#

# Flag to tell us whether we're running in debug mode
DEBUG = environ.get('KANMAIL_DEBUG') == 'on'
DEBUG_SMTP = environ.get('KANMAIL_DEBUG_SMTP') == 'on'

# Flag to tell us whether we're a frozen app (bundled)
FROZEN = getattr(sys, 'frozen', False)

# Flag to tell us whether we're running as an app (frozen or not)
IS_APP = environ.get('KANMAIL_MODE', 'app') == 'app'

# Flag to tell us whether to disable the cache
CACHE_ENABLED = environ.get('KANMAIL_CACHE', 'on') == 'on'


# Get the client root directory - if we're frozen (by pyinstaller) this is relative
# to the executable, otherwise ./client.
CLIENT_ROOT = path.abspath(path.join(path.dirname(__file__), '..', 'client'))
if FROZEN:
    CLIENT_ROOT = sys._MEIPASS


# Platform specific interface settings
PLATFORM = platform.system()
FRAMELESS = IS_APP and PLATFORM == 'Darwin'

platform_to_gui = {
    'Darwin': 'cocoa',
    'Linux': 'gtk',
    'Windows': 'winforms',
}
GUI_LIB = platform_to_gui[PLATFORM]


# Server settings
#

WEBSITE_URL = 'https://kanmail.io'
UPDATE_SERVER_URL = 'https://updates.kanmail.io'
LICENSE_SERVER_URL = 'https://license.kanmail.io'

if DEBUG:
    UPDATE_SERVER_URL = environ.get(
        'KANMAIL_UPDATE_SERVER',
        'http://localhost:5000/updates',
    )
    LICENSE_SERVER_URL = environ.get(
        'KANMAIL_LICENSE_SERVER',
        'http://localhost:5000',
    )

class PyUpdaterConfig(object):  # noqa: E302
    PUBLIC_KEY = 'c++zSv15DkOJItm9YoUvIbUBXZZaVWF8YheJlMoU0HU'
    COMPANY_NAME = 'Oxygem'
    APP_NAME = APP_NAME
    UPDATE_URLS = [UPDATE_SERVER_URL]
    MAX_DOWNLOAD_RETRIES = 3
