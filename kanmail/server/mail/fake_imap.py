'''
A horrible hacky fake IMAP client - useful for dev on planes :)
'''

from datetime import datetime
from random import choice
from unittest.mock import patch

from imapclient.response_types import Address, Envelope

from kanmail.log import logger

ALIAS_FOLDERS = ['inbox', 'archive']

FAKE_IMAPCLIENT_UIDS = tuple(range(1, 10))

FAKE_IMAPCLIENT_FOLDER_STATUS = {
    b'UIDVALIDITY': choice(FAKE_IMAPCLIENT_UIDS),
}

FAKE_ADDRESSES = (
    Address(b'Nick Fizzadar', None, b'nick', b'gmail.com'),
    Address(b'Laughing Robot', None, b'robot', b'oxygem.com'),
    Address(b'pyinfra Docs', None, b'pyinfra', b'pyinfra.readthedocs.io'),
    Address(b'Hello Oxygem', None, b'hello', b'oxygem.com'),
    Address(b'Nick', None, b'nick', b'oxygem.com'),
    Address(b'Fizzadar', None, b'fizzadar', b'github.com'),
)


def make_fake_addresses():
    n_addresses = choice((1, 1, 1, 1, 2, 3))

    return tuple([
        choice(FAKE_ADDRESSES)
        for _ in range(n_addresses)
    ])


def make_fake_fetch_item(folder, uid, keys):
    fake_data = {
        b'FLAGS': ['\\Seen'],
        b'BODYSTRUCTURE': (b'TEXT', b'PLAIN', None, None, None, b'UTF-8', 100),
        b'BODY[1]<0>': 'This is some text',
        b'BODY[1]': 'This is some text in the full email body',
        b'BODY[HEADER.FIELDS (REFERENCES CONTENT-TRANSFER-ENCODING)]': '',
        b'RFC822.SIZE': 100,
    }

    message_id_folder = choice(ALIAS_FOLDERS + [folder])
    message_id = '{0}_{1}'.format(message_id_folder, uid)

    from_addresses = make_fake_addresses()

    fake_data[b'SEQ'] = uid
    fake_data[b'ENVELOPE'] = Envelope(
        datetime.utcnow(),
        'This is a subject (uid={0})'.format(uid),
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
    if key.startswith('BODY.PEEK'):
        key = key.replace('BODY.PEEK', 'BODY')

    # TODO: remove this crap!
    if key.endswith('<0.500>'):
        key = key.replace('<0.500>', '<0>')

    return key.encode()


class FakeIMAPClient(object):
    _current_folder = None

    def __init__(self, *args, **kwargs):
        logger.debug('Creating fake IMAP: ({0}, {1})'.format(args, kwargs))

    def login(self, username, password):
        pass

    def select_folder(self, folder_name):
        self._current_folder = folder_name

    def search(self, query):
        return FAKE_IMAPCLIENT_UIDS

    def folder_status(self, folder_name, keys):
        return FAKE_IMAPCLIENT_FOLDER_STATUS

    def fetch(self, uids, keys):
        keys.append('SEQ')  # TODO: more crap!
        keys = [make_key(key) for key in keys]
        responses = {}

        for uid in uids:
            responses[uid] = make_fake_fetch_item(
                self._current_folder, uid, keys,
            )

        return responses


def bootstrap_fake_imap():
    imap_client_patch = patch(
        'kanmail.server.mail.connection.IMAPClient',
        FakeIMAPClient,
    )
    imap_client_patch.start()
