from functools import lru_cache

from pyupdater.client import Client as PyUpdaterClient

from kanmail.log import logger
from kanmail.settings.constants import (
    APP_NAME,
    FROZEN,
    PyUpdaterConfig,
)
from kanmail.version import get_version_data


@lru_cache(maxsize=1)
def get_pyupdater_client() -> PyUpdaterClient:
    return PyUpdaterClient(PyUpdaterConfig())


def check_device_update():
    version_data = get_version_data()
    client = get_pyupdater_client()

    logger.info((
        f'Checking for updates (channel={version_data["channel"]}, '
        f'currentVersion={version_data["version"]})...'
    ))
    client.refresh()

    update = client.update_check(
        APP_NAME, version_data['version'],
        channel=version_data['channel'],
    )

    if not update:
        logger.info('No update found')
        return

    logger.info(f'Update found: {update.version}')
    return update


def update_device(update) -> None:
    '''
    Checks for and downloads any updates for Kanmail - after this it tells the
    frontend to render a restart icon.
    '''

    update = update or check_device_update()

    if not update:
        return

    if not FROZEN:
        logger.warning('App not frozen, not fetching update')
        return

    logger.debug(f'Downloading update: {update.version}')
    update.download()

    logger.debug('Download complete, extracting & overwriting')
    update.extract_overwrite()
