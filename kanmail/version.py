import json

from os import path
from typing import Dict

from pydash import memoize

from kanmail.settings import CLIENT_ROOT


@memoize
def get_version_data() -> Dict[str, str]:
    version_filename = path.join(CLIENT_ROOT, 'static', 'dist', 'version.json')

    if not path.exists(version_filename):
        return {
            'version': 'dev',
            'channel': 'alpha',
        }

    with open(version_filename, 'r') as f:
        version_data = f.read()

    return json.loads(version_data)


def get_version() -> str:
    version_data = get_version_data()
    return version_data['version']
