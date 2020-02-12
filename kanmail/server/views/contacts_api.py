from kanmail.server.app import app


@app.route('/api/contacts', methods=('POST',))
def api_post_contacts():
    '''
    Create a new contact.
    '''


@app.route('/api/contacts/<int:contact_id>', methods=('PUT', 'DELETE'))
def api_put_delete_contact():
    '''
    Update or delete a single contact.
    '''
