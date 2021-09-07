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
from kanmail.server.util import lock_class_method

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
    email = choice((fake.ascii_company_email(), fake.ascii_email(), fake.ascii_free_email()))
    mailbox, host = email.split('@', 1)
    name = choice((fake.name(), fake.name(), fake.name(), fake.company(), fake.company(), None))
    if name:
        name = name.encode()

    return Address(name, None, mailbox.encode(), host.encode())


def make_fake_addresses():
    n_addresses = choice((1, 1, 1, 1, 2, 3))

    return tuple([
        make_fake_address()
        for _ in range(n_addresses)
    ])


def make_fake_fetch_data(folder, uid):
    body_text = fake.paragraphs(choice((2, 3, 4, 5, 6, 7, 8, 9)))

    headers = ''
    if choice(range(100)) > 60:
        reply_to_folder = choice(ALIAS_FOLDERS + [folder.name])
        reply_to_uid = choice(FOLDER_NAME_TO_FAKE_FOLDER[reply_to_folder].uids)
        reply_to_message_id = f'{reply_to_folder}_{reply_to_uid}'
        headers = f'References: <{reply_to_message_id}>\r\n\r\n'.encode()

    fake_data = {
        b'FLAGS': ['\\Seen'],
        b'BODYSTRUCTURE': (b'TEXT', b'PLAIN', None, None, None, b'UTF-8', 100),
        b'BODY[1]<0>': f'{body_text[0][:500]}',
        b'BODY[1]': '\n\n'.join(body_text),
        b'BODY[HEADER.FIELDS (REFERENCES CONTENT-TRANSFER-ENCODING)]': headers,
        b'RFC822.SIZE': 100,
    }

    message_id = f'<{folder.name}_{uid}>'

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
        None,  # in reply to
        message_id,
    )

    return fake_data


UID_TO_FAKE_DATA = {}
FOLDER_NAME_TO_FAKE_FOLDER = {}


def get_fake_fetch_item(folder, uid, keys, imap_host):
    imap_uid = f'{imap_host}_{uid}'

    fake_data = UID_TO_FAKE_DATA.get(imap_uid)
    if not fake_data:
        fake_data = make_fake_fetch_data(folder, uid)
        UID_TO_FAKE_DATA[imap_uid] = fake_data

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
    def __init__(self, name, uid_offset):
        logger.debug(f'Creating fake folder: {name}')

        self.name = name
        self.uids = tuple(range(uid_offset + 1, uid_offset + 10))
        self.status = {
            b'UIDVALIDITY': 1,
        }

    def __str__(self):
        return f'FakeFolderData({self.name})'

    def add_uids(self, uids):
        new_uids = list(self.uids)
        new_uids.extend(uids)
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
    _imap_host = None

    def __init__(self, imap_host, *args, **kwargs):
        logger.debug(f'Creating fake IMAP: ({args}, {kwargs})')

        self._imap_host = imap_host

        for folder in ALIAS_FOLDERS + OTHER_FOLDERS:
            self._ensure_folder(folder)

    @lock_class_method
    def _ensure_folder(self, folder_name):
        if folder_name not in FOLDER_NAME_TO_FAKE_FOLDER:
            FOLDER_NAME_TO_FAKE_FOLDER[folder_name] = FakeFolderData(
                folder_name,
                uid_offset=len(FOLDER_NAME_TO_FAKE_FOLDER),
            )
        return FOLDER_NAME_TO_FAKE_FOLDER[folder_name]

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
            for name in FOLDER_NAME_TO_FAKE_FOLDER.keys()
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

    def unselect_folder(self):
        self._current_folder = None

    def folder_status(self, folder_name, keys):
        random_sleep()
        return self._ensure_folder(folder_name).status

    def find_special_folder(self, alias_name):
        return str(alias_name)

    def search(self, query, charset=None):
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
            responses[uid] = get_fake_fetch_item(
                self._current_folder,
                uid,
                keys,
                imap_host=self._imap_host,
            )
        return responses


def bootstrap_fake_connections():
    patch('kanmail.server.mail.connection.IMAPClient', FakeIMAPClient).start()
    patch('kanmail.server.mail.connection.SMTP', MagicMock()).start()
    patch('kanmail.server.mail.connection.SMTP_SSL', MagicMock()).start()
