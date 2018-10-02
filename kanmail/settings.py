import json
import pickle
import sys

from os import environ, path

from click import get_app_dir
from pydash import memoize

from kanmail.log import logger, setup_logging

APP_NAME = 'Kanmail'
APP_VERSION = '0.0.1'

SERVER_PORT = 4420


# App directory/filenames
#

# "App" directory for this user - settings/logs/cache go here
APP_DIR = get_app_dir(APP_NAME)

# Cache directory
CACHE_DIR = path.join(APP_DIR, 'cache')

# Contacts cache filename
CONTACTS_CACHE_FILE = path.join(CACHE_DIR, '.contacts')
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

# Flag to tell us whether we're a frozen app (bundled)
FROZEN = getattr(sys, 'frozen', False)

# Flag to tell us whether we're running as an app (frozen or not)
IS_APP = environ.get('KANMAIL_MODE', 'app') == 'app'

# Flag to tell us whether to disable the cache
CACHE_ENABLED = environ.get('KANMAIL_CACHE', 'on') == 'on'


# Bootstrap logging before we use logging!
#

setup_logging(debug=DEBUG, log_file=LOG_FILE)


# Window settings
#

WINDOW_WIDTH = 1400
WINDOW_HEIGHT = 800
WINDOW_LEFT = 0
WINDOW_TOP = 0

# Get any cached window settings
if path.exists(WINDOW_CACHE_FILE):
    with open(WINDOW_CACHE_FILE, 'rb') as f:
        data = pickle.loads(f.read())
    logger.debug('Loaded window settings: {0}'.format(data))
    for k, v in data.items():
        locals()[k] = v


# "App"/user settings
#

DEFAULT_SETTINGS = {
    # Account key -> account details
    'accounts': {},
    # Columns (IMAP folders) to show in the UI
    'columns': [],
    # System/sync settings
    'system': {
        # Number of emails to download at once for non-inbox/columns
        'batch_size': 50,
        # Number of batches to sync initially, per column
        'initial_batches': 3,

        # Number of ms to hold archive/trash actions before executing them - during
        # which you can undo them.
        'undo_ms': 2000,
    },
}


def _merge_settings(base_config, new_config):
    for key, value in new_config.items():
        # If this key is a dict in the old config, merge those
        if key in base_config and isinstance(value, dict):
            _merge_settings(base_config[key], new_config[key])
        else:
            base_config[key] = new_config[key]


@memoize
def get_settings():
    settings = DEFAULT_SETTINGS

    if path.exists(SETTINGS_FILE):
        with open(SETTINGS_FILE, 'r') as file:
            data = file.read()

        user_settings = json.loads(data)
        logger.debug('Loaded settings: {0}'.format(user_settings))

        # Merge the user settings ontop of the defaults
        _merge_settings(settings, user_settings)

    return settings


def update_settings(new_settings):
    settings = get_settings()
    _merge_settings(settings, new_settings)

    logger.debug('Writing settings: {0}'.format(settings))
    json_data = json.dumps(settings, indent=4)

    with open(SETTINGS_FILE, 'w') as file:
        file.write(json_data)

    # Reset pydash.memoize's cache for next call to `get_settings`
    get_settings.cache = {}


def set_cached_window_settings(width, height, left, top):
    window_settings = {
        'WINDOW_WIDTH': width,
        'WINDOW_HEIGHT': height,
        'WINDOW_LEFT': left,
        'WINDOW_TOP': top,
    }

    logger.debug('Writing window settings: {0}'.format(window_settings))

    with open(WINDOW_CACHE_FILE, 'wb') as f:
        f.write(pickle.dumps(window_settings))
