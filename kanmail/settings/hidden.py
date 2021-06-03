import pickle

from base64 import b64decode
from functools import lru_cache
from os import environ, path
from typing import Dict

from .constants import CLIENT_ROOT


VALID_HIDDEN_KEYS = (
    'SENTRY_DSN',
    'GOOGLE_OAUTH_CLIENT_ID',
    'GOOGLE_OAUTH_CLIENT_SECRET',
)


@lru_cache(maxsize=1)
def get_hidden_data() -> Dict[str, str]:
    hidden_data_filename = path.join(CLIENT_ROOT, 'static', 'dist', 'hidden.json')

    if not path.exists(hidden_data_filename):
        return {}

    with open(hidden_data_filename, 'r') as f:
        hidden_data = f.read()

    return pickle.loads(b64decode(hidden_data['data']))


def get_hidden_value(key: str) -> str:
    if key not in VALID_HIDDEN_KEYS:
        raise KeyError(f'Invalid hidden value key: {key}')

    data = get_hidden_data()
    value = environ.get(key, data.get(key))

    if value:
        return value

    raise KeyError(f'No hidden value available for key: {key}')
