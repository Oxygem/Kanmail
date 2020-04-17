from os import path

import keyring

from kanmail.settings.constants import CACHE_DIR, PLATFORM


if PLATFORM == 'Windows':
    from keyring.backends.Windows import WinVaultKeyring as KeyringClass
elif PLATFORM == 'Darwin':
    from keyring.backends.OS_X import Keyring as KeyringClass
else:
    from keyrings.alt.file import PlaintextKeyring

    class KeyringClass(PlaintextKeyring):
        file_path = path.join(CACHE_DIR, '.secrets')


keyring.set_keyring(KeyringClass())


def _make_password_name(section, host):
    return f'Kanmail {section}: {host}'


def set_password(section, host, username, password):
    name = _make_password_name(section, host)
    return keyring.set_password(name, username, password)


def delete_password(section, host, username):
    name = _make_password_name(section, host)
    return keyring.delete_password(name, username)


def get_password(section, host, username):
    name = _make_password_name(section, host)
    password = keyring.get_password(name, username)
    if password:
        return password

    legacy_password = keyring.get_password(host, username)
    if legacy_password:
        set_password(section, host, username, legacy_password)
        keyring.delete_password(host, username)
        return legacy_password
