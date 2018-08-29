import pickle

from os import path

from pydash import memoize

from kanmail.settings import CONTACTS_CACHE_FILE


@memoize
def get_contacts():
    if not path.exists(CONTACTS_CACHE_FILE):
        return {}

    with open(CONTACTS_CACHE_FILE, 'rb') as f:
        return pickle.loads(f.read())


def set_contacts(contacts):
    data = pickle.dumps(contacts)
    with open(CONTACTS_CACHE_FILE, 'wb') as f:
        f.write(data)

    # Set the pydash.memoize's cache on get_contacts
    get_contacts.cache = {
        None: contacts,
    }


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
