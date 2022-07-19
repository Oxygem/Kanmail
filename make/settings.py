import platform
from os import environ, path

MAJOR_VERSION = 1

ROOT_DIRNAME = path.normpath(path.join(path.abspath(path.dirname(__file__)), ".."))
DIST_DIRNAME = path.join(ROOT_DIRNAME, "dist")
MAKE_DIRNAME = path.join(ROOT_DIRNAME, "make")

NEW_BUILDS_DIRNAME = path.join(ROOT_DIRNAME, "pyu-data", "new")

TEMP_SPEC_FILENAME = path.join(DIST_DIRNAME, ".spec")
TEMP_CHANGELOG_NAME = path.join(DIST_DIRNAME, ".changelog")

VERSION_DATA_FILENAME = path.join(DIST_DIRNAME, "version.json")
HIDDEN_DATA_FILENAME = path.join(DIST_DIRNAME, "hidden.json")

DOCKER_NAME = "fizzadar/kanmail"

GITHUB_API_TOKEN = environ.get("GITHUB_API_TOKEN")


# MacOS build settings
#

CODESIGN_KEY_NAME = environ.get("CODESIGN_KEY_NAME")

NOTARIZE_TEAM_ID = environ.get("NOTARIZE_TEAM_ID")
NOTARIZE_PASSWORD_KEYCHAIN_NAME = environ.get("NOTARIZE_PASSWORD_KEYCHAIN_NAME")

MACOSX_DEPLOYMENT_TARGET = "10.9"


# Requirements management
#

REQUIREMENTS_DIRNAME = path.join(ROOT_DIRNAME, "requirements")

platform = platform.system().lower()
if platform == "darwin":
    platform = "macos"

REQUIREMENTS_FILENAME = path.join(REQUIREMENTS_DIRNAME, f"{platform}.txt")
DEVELOPMENT_REQUIREMENTS_FILENAME = path.join(REQUIREMENTS_DIRNAME, f"{platform}-development.txt")

BASE_REQUIREMENTS_FILENAME = path.join(REQUIREMENTS_DIRNAME, "base.in")
BASE_DEVELOPMENT_REQUIREMENTS_FILENAME = path.join(REQUIREMENTS_DIRNAME, "base-development.in")
