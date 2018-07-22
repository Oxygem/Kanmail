from datetime import datetime
from unittest.mock import patch

from imapclient.response_types import Address, Envelope

from kanmail.log import logger

FAKE_IMAPCLIENT_UIDS = list(range(1, 1001))

FAKE_IMAPCLIENT_FOLDER_STATUS = {
    b'UIDVALIDITY': 0,
}

FAKE_ADDRESS = Address(b'Nick Fizzadar', None, b'nick', b'gmail.com')

FAKE_IMAPCLIENT_FETCH = {
    b'FLAGS': ['\\Seen'],
    b'BODYSTRUCTURE': (b'TEXT', b'PLAIN', None, None, None, b'UTF-8', 100),
    b'BODY[1]<0>': 'This is some text',
    b'BODY[HEADER.FIELDS (REFERENCES CONTENT-TRANSFER-ENCODING)]': '',
    b'RFC822.SIZE': 100,
}


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
        responses = {}

        for uid in uids:
            fake_data = FAKE_IMAPCLIENT_FETCH.copy()
            fake_data[b'SEQ'] = uid
            fake_data[b'ENVELOPE'] = Envelope(
                datetime.utcnow(),
                'This is a subject',
                (FAKE_ADDRESS,),
                (FAKE_ADDRESS,),
                (FAKE_ADDRESS,),
                None,
                None,
                None,
                'abc',
                # TODO: make this better so messages in a non-standard folder
                # also appear in one or more standard, so the columns can be
                # tested properly!
                '{0}_{1}'.format(self._current_folder, uid),
            )

            responses[uid] = fake_data

        return responses


def bootstrap_fake_imap():
    imap_client_patch = patch(
        'kanmail.server.mail.connection.IMAPClient',
        FakeIMAPClient,
    )
    imap_client_patch.start()
