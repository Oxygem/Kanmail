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
