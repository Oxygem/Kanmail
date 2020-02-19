import json
import pickle
import platform
import sys

from os import environ, makedirs, path
from typing import Optional, Union

from click import get_app_dir
from pydash import memoize

from kanmail.log import logger, setup_logging

from .model import get_default_settings, validate_settings


APP_NAME = 'Kanmail'

SERVER_PORT = 4420


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


# Bootstrap logging before we use logging!
#

for needed_dir in (APP_DIR, CACHE_DIR):
    if not path.exists(needed_dir):
        makedirs(needed_dir)

setup_logging(debug=DEBUG, log_file=LOG_FILE)

logger.debug(f'App dir set to: {APP_DIR}')


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
    logger.debug(f'Loaded window settings: {data}')
    for k, v in data.items():
        locals()[k] = v


# Server settings
#

UPDATE_SERVER = 'https://updates.kanmail.io'
LICENSE_SERVER = 'https://license.kanmail.io'

if DEBUG:
    UPDATE_SERVER = environ.get(
        'KANMAIL_UPDATE_SERVER',
        'http://localhost:5000/updates',
    )
    LICENSE_SERVER = environ.get(
        'KANMAIL_LICENSE_SERVER',
        'http://localhost:5000',
    )

class PyUpdaterConfig(object):  # noqa: E302
    PUBLIC_KEY = 'c++zSv15DkOJItm9YoUvIbUBXZZaVWF8YheJlMoU0HU'
    COMPANY_NAME = 'Oxygem'
    APP_NAME = APP_NAME
    UPDATE_URLS = [UPDATE_SERVER]
    MAX_DOWNLOAD_RETRIES = 3


# "App"/user settings
#

def _merge_settings(base_config: dict, new_config: dict, key_prefix: str = None) -> list:
    changed_keys = []

    for key, value in new_config.items():
        # If this key is a dict in the old config, merge those
        if key in base_config and isinstance(value, dict):
            changed_keys.extend(_merge_settings(
                base_config[key], new_config[key],
                key_prefix=key,
            ))
        else:
            if base_config.get(key) != new_config[key]:
                base_config[key] = new_config[key]
                if key_prefix:
                    changed_keys.append(f'{key_prefix}.{key}')
                else:
                    changed_keys.append(key)

    return changed_keys


@memoize
def get_settings() -> dict:
    settings = get_default_settings()

    if path.exists(SETTINGS_FILE):
        with open(SETTINGS_FILE, 'r') as file:
            data = file.read()

        user_settings = json.loads(data)
        logger.debug(f'Loaded settings: {user_settings}')

        # Merge the user settings ontop of the defaults
        _merge_settings(settings, user_settings)

    return settings


def get_system_setting(key: str, default: Optional[dict] = None) -> Union[None, str, int]:
    return get_settings()['system'].get(key, default)


def get_style_setting(key: str, default: Optional[dict] = None) -> Union[None, str, int]:
    return get_settings()['style'].get(key, default)


def overwrite_settings(settings: dict) -> list:
    # "Merge" the settings to get the changed key list
    current_settings = get_settings()
    changed_keys = _merge_settings(current_settings, settings)

    # Now just save the un-merged original
    set_settings(settings)
    return changed_keys


def update_settings(settings_updates: dict) -> list:
    settings = get_settings()
    changed_keys = _merge_settings(settings, settings_updates)
    set_settings(settings)
    return changed_keys


def set_settings(new_settings: dict) -> None:
    validate_settings(new_settings)

    logger.debug(f'Writing new settings: {new_settings}')
    json_data = json.dumps(new_settings, indent=4)

    with open(SETTINGS_FILE, 'w') as file:
        file.write(json_data)

    # Reset pydash.memoize's cache for next call to `get_settings`
    get_settings.cache = {}


def set_cached_window_settings(width: int, height: int, left: int, top: int) -> None:
    window_settings = {
        'WINDOW_WIDTH': width,
        'WINDOW_HEIGHT': height,
        'WINDOW_LEFT': left,
        'WINDOW_TOP': top,
    }

    logger.debug(f'Writing window settings: {window_settings}')

    with open(WINDOW_CACHE_FILE, 'wb') as f:
        f.write(pickle.dumps(window_settings))
