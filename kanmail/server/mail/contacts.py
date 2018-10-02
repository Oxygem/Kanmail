import pickle

from os import path
from threading import Lock

from pydash import memoize

from kanmail.settings import CONTACTS_CACHE_FILE

CONTACTS_CACHE_LOCK = Lock()


@memoize
def get_contacts():
    if not path.exists(CONTACTS_CACHE_FILE):
        return {}

    with CONTACTS_CACHE_LOCK:
        with open(CONTACTS_CACHE_FILE, 'rb') as f:
            return pickle.loads(f.read())


def set_contacts(contacts):
    data = pickle.dumps(contacts)

    with CONTACTS_CACHE_LOCK:
        with open(CONTACTS_CACHE_FILE, 'wb') as f:
            f.write(data)

    # Reset pydash.memoize's cache for next call to get_contacts
    get_contacts.cache = {}


def add_contact(contact):
    contacts = get_contacts()

    name, email = contact

    if (
        email not in contacts
        # If no cached name and name is provided
        or contacts[email] is None and name is not None
    ):
        contacts[email] = name
        set_contacts(contacts)
