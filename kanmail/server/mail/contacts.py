from pydash import memoize

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
def get_contacts():
    contacts = Contact.query.all()
    return set(
        (contact.name, contact.email)
        for contact in contacts
    )


def add_contact(contact):
    name, email = contact

    if 'noreply' in email:
        return

    if email.startswith('reply'):
        return

    if contact in get_contacts():
        return

    new_contact = Contact(
        name=name,
        email=email,
    )

    db.session.add(new_contact)
    db.session.commit()

    # Reset pydash.memoize's cache for get_contacts
    get_contacts.cache = {}
