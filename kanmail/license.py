import json

from os import path
from typing import Optional

import requests

from requests.exceptions import ConnectionError, HTTPError

from kanmail.log import logger
from kanmail.secrets import delete_password, get_password, set_password
from kanmail.settings.constants import (
    LICENSE_FILE,
    LICENSE_SERVER_APP_TOKEN,
    LICENSE_SERVER_URL,
)


class LicenseActivationError(Exception):
    pass


def read_license_file_data() -> dict:
    if not path.exists(LICENSE_FILE):
        return {}

    try:
        with open(LICENSE_FILE, 'r+') as f:  # license file must be writeable
            return json.load(f)
    except Exception as e:
        logger.warning(f'Could not load license file: {e}')

    return {}


def write_license_file_data(data: dict) -> None:
    with open(LICENSE_FILE, 'w') as f:
        json.dump(data, f)


def add_email_to_license_file(email: str) -> None:
    license_data = read_license_file_data()
    license_data[LICENSE_SERVER_APP_TOKEN] = email
    write_license_file_data(license_data)


def remove_email_from_license_file() -> None:
    license_data = read_license_file_data()
    license_data.pop(LICENSE_SERVER_APP_TOKEN, None)
    write_license_file_data(license_data)


def get_email_from_license_file() -> str:
    try:
        with open(LICENSE_FILE, 'r+') as f:  # license file must be writeable
            license_data = json.load(f)
    except Exception:
        return

    return license_data.get(LICENSE_SERVER_APP_TOKEN)


def activate_license(email: str, token: str) -> bool:
    try:
        response = requests.post(
            f'{LICENSE_SERVER_URL}/api/activate',
            json={
                'app_token': LICENSE_SERVER_APP_TOKEN,
                'memo': email,
                'token': token,
            },
        )
    except ConnectionError:
        raise LicenseActivationError('Could not connect to license server, please try again later!')

    try:
        response.raise_for_status()
    except HTTPError:
        try:
            error = response.json()['error']
        except Exception:
            error = response.content
        raise LicenseActivationError(error)

    data = response.json()
    device_token = data['deviceToken']

    add_email_to_license_file(email)

    combined_token = f'{token}:{device_token}'
    set_password('license', LICENSE_SERVER_APP_TOKEN, email, combined_token)

    return True


def check_get_license_email() -> Optional[str]:
    '''
    A "soft" check for the presence of a license file and associated keyring item.

    Note: this *does not* check the license against the key server.
    '''

    license_email = get_email_from_license_file()
    if not license_email:
        return

    combined_token = get_password('license', LICENSE_SERVER_APP_TOKEN, license_email)

    if combined_token:
        return license_email


def remove_license():
    license_email = check_get_license_email()
    delete_password('license', LICENSE_SERVER_APP_TOKEN, license_email)
    remove_email_from_license_file()


def validate_or_remove_license() -> None:
    '''
    A "hard" check for the presence and validity of a license key. Will also remove
    any invalid license file/keyring item.

    This function is executed in a separate thread on app start.
    '''

    license_email = check_get_license_email()
    if not license_email:
        return

    logger.debug(f'Validating license for {license_email}...')

    combined_token = get_password('license', LICENSE_SERVER_APP_TOKEN, license_email)
    token, device_token = combined_token.split(':')

    try:
        response = requests.get(
            f'{LICENSE_SERVER_URL}/api/check',
            json={
                'app_token': LICENSE_SERVER_APP_TOKEN,
                'memo': license_email,
                'token': token,
                'device_token': device_token,
            },
        )
    except ConnectionError:
        logger.warning('Could not connect to license server, please try again later!')
        return

    if response.status_code == 404:
        logger.warning('Valid license NOT found, removing!')
        remove_license()
        return

    if response.status_code == 201:
        logger.debug('Licence validated!')
        return

    try:
        response.raise_for_status()
    except HTTPError as e:
        logger.warning(f'Unexpected status from license server: {e} ({response.content})')
