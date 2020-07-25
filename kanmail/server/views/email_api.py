from os import path

from flask import jsonify, make_response, request, Response

from kanmail.server.app import app
from kanmail.server.mail import (
    append_folder_email,
    copy_folder_emails,
    get_account,
    get_all_folders,
    get_folder_email_part,
    get_folder_email_texts,
    get_folder_emails,
    move_folder_emails,
    star_folder_emails,
    sync_folder_emails,
    unstar_folder_emails,
)
from kanmail.server.mail.message import make_email_message
from kanmail.server.util import get_list_or_400, get_or_400
from kanmail.settings.constants import IS_APP
from kanmail.window import get_main_window


@app.route('/api/folders', methods=('GET',))
def api_get_folders() -> Response:
    '''
    List available folders/mailboxes for all the accounts.
    '''

    folders, meta = get_all_folders()

    return jsonify(folders=folders, folder_meta=meta)


@app.route('/api/emails/<account>/<folder>', methods=('GET',))
def api_get_account_folder_emails(account, folder) -> Response:
    '''
    Get (more) emails for a folder in a given account.
    '''

    batch_size = None

    try:
        batch_size = int(request.args.get('batch_size'))  # type: ignore
    except (TypeError, ValueError):
        pass

    emails, meta = get_folder_emails(
        account, folder,
        query=request.args.get('query'),
        reset=request.args.get('reset') == 'true',
        batch_size=batch_size,
    )

    return jsonify(emails=emails, meta=meta)


@app.route('/api/emails/<account>/<folder>/sync', methods=('GET',))
def api_sync_account_folder_emails(account, folder) -> Response:
    '''
    Sync emails within a folder for a given account.
    '''

    unread_uids = [int(uid) for uid in request.args.getlist('unread_uids')]
    uid_count = request.args.get('uid_count')
    if uid_count:
        uid_count = int(uid_count)

    new_emails, deleted_uids, read_uids, meta = sync_folder_emails(
        account, folder,
        query=request.args.get('query'),
        expected_uid_count=uid_count,
        check_unread_uids=unread_uids,
    )

    return jsonify(
        new_emails=new_emails,
        deleted_uids=deleted_uids,
        read_uids=read_uids,
        meta=meta,
    )


@app.route('/api/emails/<account>/<folder>/text', methods=('GET',))
def api_get_account_email_texts(account, folder) -> Response:
    '''
    Get a specific list of email texts by UID for a given account/folder.
    '''

    uids = get_list_or_400(request.args, 'uid', type=int)

    emails = get_folder_email_texts(account, folder, uids)

    return jsonify(emails=emails)


@app.route('/api/emails/<account>/<folder>/<int:uid>/<part_number>', methods=('GET',))
def api_get_account_email_part(account, folder, uid, part_number) -> Response:
    '''
    Return a specific part of an email by account/folder/UID.
    '''

    mime_type, data = get_folder_email_part(
        account, folder, uid, part_number,
    )

    if mime_type is None:
        response = jsonify(error=f'Could not find part: {part_number}')
        response.status_code = 404
        return response

    response = make_response(data)
    response.headers['Content-Type'] = mime_type
    return response


@app.route('/api/emails/<account>/<folder>/<int:uid>/<part_number>/download', methods=('GET',))
def api_download_account_email_part(account, folder, uid, part_number) -> Response:
    '''
    Download a specific part of an email by account/folder/UID.
    '''

    downloads_folder = path.expanduser(path.join('~', 'Downloads'))
    local_filename = path.join(downloads_folder, request.args['filename'])

    if path.exists(local_filename):
        extension = None
        if '.' in local_filename:
            local_filename, extension = local_filename.rsplit('.', 1)

        local_filename = f'{local_filename}-1'

        if extension:
            local_filename = f'{local_filename}.{extension}'

    mime_type, data = get_folder_email_part(
        account, folder, uid, part_number,
    )

    if mime_type is None:
        response = jsonify(error=f'Could not find part: {part_number}')
        response.status_code = 404
        return response

    if isinstance(data, str):
        data = data.encode()

    with open(local_filename, 'wb') as f:
        f.write(data)

    return jsonify(saved=True, filename=local_filename)


@app.route('/api/emails/<account>/<folder>/move', methods=('POST',))
def api_move_account_emails(account, folder) -> Response:
    '''
    Move emails from one folder to another within a given account.
    '''

    request_data = request.get_json()
    message_uids = get_or_400(request_data, 'message_uids')
    new_folder = get_or_400(request_data, 'new_folder')

    move_folder_emails(account, folder, message_uids, new_folder)

    return jsonify(moved=True)


@app.route('/api/emails/<account>/<folder>/copy', methods=('POST',))
def api_copy_account_emails(account, folder) -> Response:
    '''
    Copy emails from one folder to another within a given account.
    '''

    request_data = request.get_json()
    message_uids = get_or_400(request_data, 'message_uids')
    new_folder = get_or_400(request_data, 'new_folder')

    copy_folder_emails(account, folder, message_uids, new_folder)

    return jsonify(copied=True)


@app.route('/api/emails/<account>/<folder>/star', methods=('POST',))
def api_star_account_emails(account, folder) -> Response:
    '''
    Star emails in a given account/folder.
    '''

    request_data = request.get_json()
    message_uids = get_or_400(request_data, 'message_uids')

    star_folder_emails(account, folder, message_uids)

    return jsonify(starred=True)


@app.route('/api/emails/<account>/<folder>/unstar', methods=('POST',))
def api_unstar_account_emails(account, folder) -> Response:
    '''
    Unstar emails in a given account/folder.
    '''

    request_data = request.get_json()
    message_uids = get_or_400(request_data, 'message_uids')

    unstar_folder_emails(account, folder, message_uids)

    return jsonify(unstarred=True)


@app.route('/api/emails/<account>/<folder>', methods=('POST',))
def api_append_account_folder_email(account, folder) -> Response:
    '''
    Create and append a message to a folder (ie drafts).
    '''

    request_data = request.get_json()
    message = make_email_message(
        from_=request_data.pop('from', None),  # argname can't be from
        raise_for_no_recipients=False,
        **request_data,
    )

    append_folder_email(account, folder, message)

    return jsonify(saved=True)


@app.route('/api/emails/<account_key>', methods=('POST',))
def api_send_account_email(account_key) -> Response:
    '''
    Create (send) emails from one of the accounts.
    '''

    request_data = request.get_json()
    account = get_account(account_key)

    account.send_email(
        # Replying to another message
        reply_to_html=request_data.pop('replyToQuoteHtml', None),
        reply_to_message_id=request_data.pop('replyToMessageId', None),
        reply_to_message_references=request_data.pop(
            'replyToMessageReferences', None,
        ),
        from_=request_data.pop('from', None),  # argname can't be from
        **request_data,  # everything else
    )

    # Tell the main window to reload the sent folder
    if IS_APP:
        window = get_main_window()
        window.evaluate_js('window.mainEmailStore.syncFolderEmails("sent")')

    return jsonify(sent=False)
