'''
Handle "device" licenses and updates. In this instance a device is basically
a single install of Kanmail on whatever hardware.
'''

from os import path

import requests

from pydash import memoize
from pyupdater.client import Client as PyUpdaterClient
from requests.exceptions import ConnectionError, HTTPError

from kanmail.log import logger
from kanmail.settings import (
    APP_NAME,
    DEVICE_ID_FILE,
    FROZEN,
    LICENSE_SERVER,
    PyUpdaterConfig,
)
from kanmail.version import get_version, get_version_data


@memoize
def get_pyupdater_client():
    return PyUpdaterClient(PyUpdaterConfig())


def get_device_id():
    if not path.exists(DEVICE_ID_FILE):
        return

    with open(DEVICE_ID_FILE) as f:
        return f.read()


def register_or_ping_device():
    '''
    Registers or pings (updates) this device on the license server.
    '''

    existing_device_id = get_device_id()

    try:
        if existing_device_id:
            response = requests.post(f'{LICENSE_SERVER}/api/v1/ping', data={
                'device_id': existing_device_id,
                'version': get_version(),
            })
        else:
            response = requests.post(f'{LICENSE_SERVER}/api/v1/register')
    except ConnectionError as e:
        logger.warning(f'Could not connect to license server: {e}')
        return

    try:
        response.raise_for_status()
    except HTTPError:
        logger.warning(f'Failed to ping or register device ID: {response.content}')
        return

    if existing_device_id:
        logger.debug(f'Pinged with device ID: {existing_device_id}')
        return

    data = response.json()
    device_id = data['new_device_id']
    logger.debug(f'Setting initial device ID: {device_id}')
    with open(DEVICE_ID_FILE, 'w') as f:
        f.write(device_id)


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


def update_device(update):
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

    logger.debug(f'Download complete, extracting & overwriting')
    update.extract_overwrite()
