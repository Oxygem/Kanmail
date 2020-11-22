import json

from functools import lru_cache
from os import path
from typing import Dict

from kanmail.settings.constants import CLIENT_ROOT


@lru_cache(maxsize=1)
def get_version_data() -> Dict[str, str]:
    version_filename = path.join(CLIENT_ROOT, 'static', 'dist', 'version.json')

    if not path.exists(version_filename):
        return {
            'version': '0.0.0dev',
            'channel': 'alpha',
        }

    with open(version_filename, 'r') as f:
        version_data = f.read()

    return json.loads(version_data)


def get_version() -> str:
    version_data = get_version_data()
    return version_data['version']
