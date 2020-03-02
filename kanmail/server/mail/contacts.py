from pydash import memoize

from kanmail.log import logger
from kanmail.server.app import db


class Contact(db.Model):
    __bind_key__ = 'contacts'
    __tablename__ = 'contacts'
    __table_args__ = (
        db.UniqueConstraint('email', 'name'),
    )

    id = db.Column(db.Integer, primary_key=True)

    name = db.Column(db.String(300))
    email = db.Column(db.String(300))


@memoize
def get_contacts(with_id=False):
    contacts = Contact.query.all()

    if with_id:
        def make_contact(c):
            return (c.id, c.name, c.email)
    else:
        def make_contact(c):
            return (c.name, c.email)

    return set(make_contact(contact) for contact in contacts)


def save_contact(contact):
    logger.debug(f'Saving contact: {contact}')

    db.session.add(contact)
    db.session.commit()

    # Reset pydash.memoize's cache for get_contacts
    get_contacts.cache = {}


def delete_contact(contact):
    logger.debug(f'Deleting contact: {contact}')

    db.session.delete(contact)
    db.session.commit()

    # Reset pydash.memoize's cache for get_contacts
    get_contacts.cache = {}


def is_valid_contact(name, email):
    # TODO: improve detection of auto-generated/invalid emails

    if not name:
        return False

    if any(s in email for s in (
        'noreply', 'no-reply', 'donotreply',
    )):
        return False

    if email.startswith('reply'):
        return False

    if email.startswith('bounce'):
        return False

    return True


def add_contacts(contacts):
    for name, email in contacts:
        if not is_valid_contact(name, email):
            logger.debug(f'Not saving invalid contact: ({name} {email})')
            return

        if (name, email) in get_contacts():
            return

        new_contact = Contact(
            name=name,
            email=email,
        )
        save_contact(new_contact)
