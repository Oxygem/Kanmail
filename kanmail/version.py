import json

from os import path

from pydash import memoize

from kanmail.settings import CLIENT_ROOT, FROZEN


@memoize
def get_version_data():
    if not FROZEN:
        return {
            'version': '0.0.0dev',
            'channel': 'alpha',
        }

    version_filename = path.join(CLIENT_ROOT, 'static', 'dist', 'version.json')

    with open(version_filename, 'r') as f:
        version_data = f.read()

    return json.loads(version_data)


def get_version():
    if not FROZEN:
        return '0.0.0dev'

    version_data = get_version_data()
    return version_data['version']
