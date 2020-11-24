from functools import lru_cache

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

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'email': self.email,
        }


@lru_cache(maxsize=1)
def get_contacts():
    contacts = list(Contact.query.all())
    for contact in contacts:
        db.session.expunge(contact)  # detach from session (request)
    return contacts


def get_contact_dicts():
    return [contact.to_dict() for contact in Contact.query.all()]


def get_contact_tuple_to_contact():
    return {
        (contact.name, contact.email): contact
        for contact in get_contacts()
    }


def save_contact(contact):
    logger.debug(f'Saving contact: {contact}')

    db.session.add(contact)
    db.session.commit()

    get_contacts.cache_clear()


def save_contacts(*contacts):
    logger.debug(f'Saving {len(contacts)} contacts')

    for contact in contacts:
        db.session.add(contact)
    db.session.commit()

    get_contacts.cache_clear()


def delete_contact(contact):
    logger.debug(f'Deleting contact: {contact}')

    db.session.delete(contact)
    db.session.commit()

    get_contacts.cache_clear()


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

    if ' via ' in name:
        return False

    return True


def add_contacts(contacts):
    existing_contacts = get_contact_tuple_to_contact()
    contacts_to_save = []

    for name, email in contacts:
        if not is_valid_contact(name, email):
            logger.debug(f'Not saving invalid contact: ({name} {email})')
            return

        if (name, email) in existing_contacts:
            return

        new_contact = Contact(name=name, email=email)
        contacts_to_save.append(new_contact)

    save_contacts(*contacts_to_save)
