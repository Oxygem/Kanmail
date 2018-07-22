import json
import sys

from os import path

from click import get_app_dir
from pydash import memoize

from kanmail.log import logger, setup_logging

DEBUG = True

setup_logging(debug=DEBUG)


FROZEN = getattr(sys, 'frozen', False)

SERVER_PORT = 4420

SETTINGS = None
SETTINGS_DIR = get_app_dir('kanmail')
SETTINGS_FILE = path.join(SETTINGS_DIR, 'settings.json')


# Window settings
#

WINDOW_CACHE_FILE = path.join(SETTINGS_DIR, 'cache', '.window_position')
WINDOW_WIDTH = 1400
WINDOW_HEIGHT = 800
WINDOW_LEFT = 0
WINDOW_TOP = 0

# Get any cached window settings
if path.exists(WINDOW_CACHE_FILE):
    with open(WINDOW_CACHE_FILE) as f:
        data = json.loads(f.read())
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

        # Number of days of emails to sync everywhere
        # 'days_to_sync': 90,
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
    logger.debug('Writing settings: {0}'.format(new_settings))
    json_data = json.dumps(new_settings, indent=4)

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

    with open(WINDOW_CACHE_FILE, 'w') as f:
        f.write(json.dumps(window_settings))
