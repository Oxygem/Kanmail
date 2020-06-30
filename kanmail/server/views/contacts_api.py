from io import BytesIO

from flask import abort, jsonify, request, send_file
from sqlalchemy.exc import IntegrityError

from kanmail.server.app import app
from kanmail.server.mail.contacts import Contact, delete_contact, save_contact
from kanmail.server.mail.icon import get_icon_for_email
from kanmail.server.util import get_or_400


@app.route('/api/contacts', methods=('POST',))
def api_post_contacts():
    '''
    Create a new contact.
    '''

    request_data = request.get_json()

    new_contact = Contact(
        name=get_or_400(request_data, 'name'),
        email=get_or_400(request_data, 'email'),
    )

    try:
        save_contact(new_contact)
    except IntegrityError:
        abort(400, 'This contact already exists')

    return jsonify(added=True, id=new_contact.id)


@app.route('/api/contacts/<int:contact_id>', methods=('PUT',))
def api_put_contact(contact_id):
    '''
    Update a single contact.
    '''

    request_data = request.get_json()

    contact = Contact.query.get_or_404(contact_id)
    contact.name = get_or_400(request_data, 'name')
    contact.email = get_or_400(request_data, 'email')

    try:
        save_contact(contact)
    except IntegrityError:
        abort(400, 'This contact already exists')

    return jsonify(updated=True)


@app.route('/api/contacts/<int:contact_id>', methods=('DELETE',))
def api_delete_contact(contact_id):
    '''
    Delete a single contact.
    '''

    contact = Contact.query.get_or_404(contact_id)
    delete_contact(contact)

    return jsonify(deleted=True)


@app.route('/contact-icon/<email>', methods=('GET',))
def api_get_contact_image(email):
    data, mimetype = get_icon_for_email(email)
    return send_file(BytesIO(data), mimetype=mimetype)
