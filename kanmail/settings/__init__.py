import json

from copy import deepcopy
from functools import lru_cache
from os import makedirs, path
from typing import Optional, Union

from kanmail.log import logger, setup_logging

from .constants import (
    APP_DIR,
    CACHE_DIR,
    DEBUG,
    DEFAULT_WINDOW_HEIGHT,
    DEFAULT_WINDOW_LEFT,
    DEFAULT_WINDOW_TOP,
    DEFAULT_WINDOW_WIDTH,
    ICON_CACHE_DIR,
    LOG_FILE,
    SETTINGS_FILE,
    WINDOW_CACHE_FILE,
)
from .model import fix_any_old_setings, get_default_settings, validate_settings


# Bootstrap logging before we use logging!
#

for needed_dir in (APP_DIR, CACHE_DIR, ICON_CACHE_DIR):
    if not path.exists(needed_dir):
        makedirs(needed_dir)

setup_logging(debug=DEBUG, log_file=LOG_FILE)

logger.debug(f'App dir set to: {APP_DIR}')


# "App"/user settings
#

def _merge_settings(
    base_config: dict,
    new_config: dict,
    key_prefix: str = None,
) -> list:
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


@lru_cache(maxsize=1)
def get_settings() -> dict:
    settings = get_default_settings()

    if path.exists(SETTINGS_FILE):
        with open(SETTINGS_FILE, 'r') as file:
            data = file.read()

        user_settings = json.loads(data)
        has_changed = fix_any_old_setings(user_settings)
        if has_changed:
            set_settings(user_settings)

        logger.debug(f'Loaded settings: {user_settings}')

        # Merge the user settings ontop of the defaults
        _merge_settings(settings, user_settings)

    return settings


def get_system_setting(
    key: str,
    default: Optional[dict] = None,
) -> Union[None, str, int]:
    return get_settings()['system'].get(key, default)


def get_style_setting(
    key: str,
    default: Optional[dict] = None,
) -> Union[None, str, int]:
    return get_settings()['style'].get(key, default)


def get_settings_copy():
    return deepcopy(get_settings())


def overwrite_settings(settings: dict) -> list:
    # "Merge" the settings to get the changed key list
    current_settings = get_settings_copy()
    changed_keys = _merge_settings(current_settings, settings)

    # Now just save the un-merged original
    set_settings(settings)
    return changed_keys


def update_settings(settings_updates: dict) -> list:
    settings = get_settings_copy()
    changed_keys = _merge_settings(settings, settings_updates)
    set_settings(settings)
    return changed_keys


def set_settings(new_settings: dict) -> None:
    validate_settings(new_settings)

    logger.debug(f'Writing new settings: {new_settings}')
    json_data = json.dumps(new_settings, indent=4)

    with open(SETTINGS_FILE, 'w') as file:
        file.write(json_data)

    get_settings.cache_clear()


def get_window_settings() -> dict:
    settings = {
        'width': DEFAULT_WINDOW_WIDTH,
        'height': DEFAULT_WINDOW_HEIGHT,
        'x': DEFAULT_WINDOW_LEFT,
        'y': DEFAULT_WINDOW_TOP,
    }

    if path.exists(WINDOW_CACHE_FILE):
        with open(WINDOW_CACHE_FILE, 'r') as f:
            data = json.load(f)

        logger.debug(f'Loaded window settings: {data}')

        for key, value in data.items():
            if key.startswith('WINDOW_'):  # COMPAT w/old style
                key = key.split('_')[1].lower()
                logger.warning(f'Updated old window setting: WINDOW_{key} -> {key}')

            if key in settings:
                settings[key] = value

    return settings


def set_window_settings(width: int, height: int, left: int, top: int) -> None:
    window_settings = {
        'width': width,
        'height': height,
        'x': left,
        'y': top,
    }

    logger.debug(f'Writing window settings: {window_settings}')

    with open(WINDOW_CACHE_FILE, 'w') as f:
        f.write(json.dumps(window_settings))
