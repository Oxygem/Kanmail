'''
Fake IMAP + SMTP connections for rapid development, even w/o internet.

Useful for building/testing basic email functionality quickly - BUT essential
to always test with real email services as well, because they all have weird
qwirks and behaviours to deal with.

Also used for "demo mode" to create marketing materials.
'''

import re

from datetime import datetime
from os import environ
from random import choice
from time import sleep
from unittest.mock import MagicMock, patch

from faker import Faker
from imapclient.response_types import Address, Envelope

from kanmail.log import logger

ALIAS_FOLDERS = ['inbox', 'archive', 'sent', 'drafts', 'trash', 'spam']
OTHER_FOLDERS = [
    'Invoices',
    'Feedback',
    'Kanmail Bugs',
    'Another Folder',
    'Waiting',
    'Needs Reply',
]

fake = Faker()


def random_sleep():
    if environ.get('KANMAIL_FAKE_SLEEP') == 'on':
        sleep(choice((1, 1, 1, 2)))


def make_fake_address():
    name = fake.name()
    bits = name.split()
    first_name = bits[0]
    last_name = bits[1] if len(bits) > 1 else bits[0]

    return Address(name.encode(), None, first_name.encode(), last_name.encode())


def make_fake_addresses():
    n_addresses = choice((1, 1, 1, 1, 2, 3))

    return tuple([
        make_fake_address()
        for _ in range(n_addresses)
    ])


def make_fake_fetch_item(folder, uid, keys):
    body_text = fake.paragraphs(choice((2, 3, 4, 5, 6, 7, 8, 9)))

    fake_data = {
        b'FLAGS': ['\\Seen'],
        b'BODYSTRUCTURE': (b'TEXT', b'PLAIN', None, None, None, b'UTF-8', 100),
        b'BODY[1]<0>': f'{body_text[0][:500]}',
        b'BODY[1]': '\n'.join(body_text),
        b'BODY[HEADER.FIELDS (REFERENCES CONTENT-TRANSFER-ENCODING)]': '',
        b'RFC822.SIZE': 100,
    }

    # message_id_folder = choice(ALIAS_FOLDERS + [folder])
    message_id_folder = folder
    message_id = f'{message_id_folder}_{uid}'

    from_addresses = make_fake_addresses()
    subject = fake.sentence(choice((3, 4, 5, 6, 7, 8)))

    fake_data[b'SEQ'] = uid
    fake_data[b'ENVELOPE'] = Envelope(
        datetime.utcnow(),
        subject,
        from_addresses,  # from
        from_addresses,  # sender
        from_addresses,  # reply to
        None,  # to
        None,  # cc
        None,  # bcc
        'abc',  # in reply to
        message_id,
    )

    return {
        key: value
        for key, value in fake_data.items()
        if key in keys
    }


def make_key(key):
    key = key.replace('BODY.PEEK', 'BODY')
    key = re.sub(r'<0\.[0-9]+>', '<0>', key)
    return key.encode()


class FakeFolderData(object):
    def __init__(self, name):
        logger.debug(f'Creating fake folder: {name}')

        self.name = name
        self.uids = tuple(range(1, 10))
        self.status = {
            b'UIDVALIDITY': choice(self.uids),
        }

    def __str__(self):
        return f'FakeFolderData({self.name})'

    def add_uids(self, uids):
        new_uids = list(self.uids)
        for uid in uids:
            new_uids.append(len(new_uids) + 1)
        self.uids = new_uids
        logger.debug(f'Added {len(uids)} UIDs: {self.uids}')

    def remove_uids(self, uids):
        self.uids = [
            uid for uid in self.uids
            if uid not in uids
        ]
        logger.debug(f'Removed {len(uids)} UIDs: {self.uids}')


class FakeIMAPClient(object):
    _current_folder = None
    _folders = {}

    def __init__(self, *args, **kwargs):
        logger.debug(f'Creating fake IMAP: ({args}, {kwargs})')

        for folder in ALIAS_FOLDERS + OTHER_FOLDERS:
            self._ensure_folder(folder)

    def _ensure_folder(self, folder_name):
        if folder_name not in self._folders:
            self._folders[folder_name] = FakeFolderData(folder_name)
        return self._folders[folder_name]

    def expunge(self, uids):
        random_sleep()

    def noop(self):
        random_sleep()

    def capabilities(self):
        random_sleep()
        return []

    def list_folders(self):
        return [
            ([], None, name)
            for name in self._folders.keys()
            if name not in ALIAS_FOLDERS
        ]

    def login(self, username, password):
        random_sleep()

    def folder_exists(self, folder_name):
        random_sleep()
        return True

    def select_folder(self, folder_name):
        random_sleep()
        self._current_folder = self._ensure_folder(folder_name)

    def folder_status(self, folder_name, keys):
        random_sleep()
        return self._current_folder.status

    def find_special_folder(self, alias_name):
        return alias_name

    def search(self, query):
        random_sleep()
        return self._current_folder.uids

    def copy(self, uids, new_folder):
        random_sleep()
        folder = self._ensure_folder(new_folder)
        folder.add_uids(uids)

    def delete_messages(self, uids):
        random_sleep()
        folder = self._current_folder
        folder.remove_uids(uids)

    def fetch(self, uids, keys):
        random_sleep()
        keys.append('SEQ')  # TODO: more crap!
        keys = [make_key(key) for key in keys]
        responses = {}
        for uid in uids:
            responses[uid] = make_fake_fetch_item(self._current_folder, uid, keys)
        return responses


def bootstrap_fake_connections():
    patch('kanmail.server.mail.connection.IMAPClient', FakeIMAPClient).start()
    patch('kanmail.server.mail.connection.SMTP', MagicMock()).start()
    patch('kanmail.server.mail.connection.SMTP_SSL', MagicMock()).start()
