import json

from os import path

from pydash import memoize

from kanmail.settings import CLIENT_ROOT, FROZEN


@memoize
def get_version():
    if not FROZEN:
        return 'dev'

    version_filename = path.join(CLIENT_ROOT, 'static', 'dist', 'version.json')

    with open(version_filename, 'r') as f:
        version_data = f.read()

    version = json.loads(version_data)
    return version['version']
