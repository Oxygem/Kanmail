'''
A horrible hacky fake IMAP client - useful for dev on planes :)
'''

import re

from datetime import datetime
from os import environ
from random import choice
from time import sleep
from unittest.mock import patch

from faker import Faker
from imapclient.response_types import Address, Envelope

from kanmail.log import logger

ALIAS_FOLDERS = ['inbox', 'archive']

FAKE_IMAPCLIENT_UIDS = tuple(range(1, 10))

FAKE_IMAPCLIENT_FOLDER_STATUS = {
    b'UIDVALIDITY': choice(FAKE_IMAPCLIENT_UIDS),
}


fake = Faker()


def random_sleep():
    if environ.get('KANMAIL_FAKE_SLEEP') == 'on':
        sleep(choice((1, 2)))


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
    body_text = fake.paragraphs(choice((1, 2, 3)))

    fake_data = {
        b'FLAGS': ['\\Seen'],
        b'BODYSTRUCTURE': (b'TEXT', b'PLAIN', None, None, None, b'UTF-8', 100),
        b'BODY[1]<0>': f'{body_text[0][:500]}',
        b'BODY[1]': '\n'.join(body_text),
        b'BODY[HEADER.FIELDS (REFERENCES CONTENT-TRANSFER-ENCODING)]': '',
        b'RFC822.SIZE': 100,
    }

    message_id_folder = choice(ALIAS_FOLDERS + [folder])
    message_id = f'{message_id_folder}_{uid}'

    from_addresses = make_fake_addresses()
    subject = fake.text()

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


class FakeIMAPClient(object):
    _current_folder = None
    _has_searched = False

    def __init__(self, *args, **kwargs):
        logger.debug(f'Creating fake IMAP: ({args}, {kwargs})')

    def capabilities(self):
        return []

    def login(self, username, password):
        random_sleep()

    def folder_exists(self, folder_name):
        return True

    def select_folder(self, folder_name):
        self._current_folder = folder_name

    def folder_status(self, folder_name, keys):
        return FAKE_IMAPCLIENT_FOLDER_STATUS

    def search(self, query):
        random_sleep()
        if not self._has_searched:
            return FAKE_IMAPCLIENT_UIDS
        return []

    def fetch(self, uids, keys):
        random_sleep()
        keys.append('SEQ')  # TODO: more crap!
        keys = [make_key(key) for key in keys]
        responses = {}

        for uid in uids:
            responses[uid] = make_fake_fetch_item(
                self._current_folder, uid, keys,
            )

        return responses

    def copy(self, uids, new_folder):
        pass

    def delete_messages(self, uids):
        pass


def bootstrap_fake_imap():
    imap_client_patch = patch(
        'kanmail.server.mail.connection.IMAPClient',
        FakeIMAPClient,
    )
    imap_client_patch.start()
