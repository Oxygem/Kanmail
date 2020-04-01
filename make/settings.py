from os import environ, path


MAJOR_VERSION = 1

ROOT_DIRNAME = path.normpath(path.join(path.abspath(path.dirname(__file__)), '..'))
DIST_DIRNAME = path.join(ROOT_DIRNAME, 'dist')
MAKE_DIRNAME = path.join(ROOT_DIRNAME, 'make')

NEW_BUILDS_DIRNAME = path.join(ROOT_DIRNAME, 'pyu-data', 'new')

TEMP_VERSION_LOCK_FILENAME = path.join(DIST_DIRNAME, '.release_version_lock')
TEMP_SPEC_FILENAME = path.join(DIST_DIRNAME, '.spec')
TEMP_CHANGELOG_FILENAME = path.join(DIST_DIRNAME, '.changelog')

VERSION_DATA_FILENAME = path.join(DIST_DIRNAME, 'version.json')

DOCKER_NAME = 'fizzadar/kanmail'

CODESIGN_KEY_NAME = environ.get('CODESIGN_KEY_NAME')
NOTARIZE_PASSWORD_KEYCHAIN_NAME = environ.get('NOTARIZE_PASSWORD_KEYCHAIN_NAME')

GITHUB_API_TOKEN = environ.get('GITHUB_API_TOKEN')
