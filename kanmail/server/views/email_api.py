from functools import wraps
from os import path
from urllib.parse import unquote

from flask import jsonify, make_response, request, Response

from kanmail.server.app import add_route
from kanmail.server.mail import (
    append_folder_email,
    copy_folder_emails,
    delete_folder_emails,
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
from kanmail.server.util import get_list_or_400, get_or_400, pop_or_400
from kanmail.settings.constants import IS_APP
from kanmail.window import get_main_window


@add_route('/api/folders', methods=('GET',))
def api_get_folders() -> Response:
    '''
    List available folders/mailboxes for all the accounts.
    '''

    folders, meta = get_all_folders()

    return jsonify(folders=folders, folder_meta=meta)


def _fix_flask_path_fail(func):
    '''
    Fix for nonsense from werkzeug: https://github.com/pallets/flask/issues/900
    On the frontend side we double encode the folder name as a workaround.
    '''

    @wraps(func)
    def decorated(account, folder, *args, **kwargs):
        folder = unquote(folder)
        return func(account, folder, *args, **kwargs)
    return decorated


@add_route('/api/emails/<account>/<folder>', methods=('GET',))
@_fix_flask_path_fail
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


@add_route('/api/emails/<account>/<folder>/sync', methods=('GET',))
@_fix_flask_path_fail
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


@add_route('/api/emails/<account>/<folder>/text', methods=('GET',))
@_fix_flask_path_fail
def api_get_account_email_texts(account, folder) -> Response:
    '''
    Get a specific list of email texts by UID for a given account/folder.
    '''

    uids = get_list_or_400(request.args, 'uid', type=int)

    emails = get_folder_email_texts(account, folder, uids)

    return jsonify(emails=emails)


@add_route('/api/emails/<account>/<folder>/<int:uid>/<part_number>', methods=('GET',))
@_fix_flask_path_fail
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


@add_route('/api/emails/<account>/<folder>/<int:uid>/<part_number>/download', methods=('GET',))
@_fix_flask_path_fail
def api_download_account_email_part(account, folder, uid, part_number) -> Response:
    '''
    Download a specific part of an email by account/folder/UID.
    '''

    downloads_folder = path.expanduser(path.join('~', 'Downloads'))
    local_filename = path.join(downloads_folder, path.basename(request.args['filename']))

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


@add_route('/api/emails/<account>/move', methods=('POST',))
def api_move_account_emails(account) -> Response:
    '''
    Move emails from one folder to another within a given account.
    '''

    request_data = request.get_json()
    old_folder = get_or_400(request_data, 'old_folder')
    new_folder = get_or_400(request_data, 'new_folder')
    message_uids = get_or_400(request_data, 'message_uids')

    move_folder_emails(account, old_folder, message_uids, new_folder)

    return jsonify(moved=True)


@add_route('/api/emails/<account>/copy', methods=('POST',))
def api_copy_account_emails(account) -> Response:
    '''
    Copy emails from one folder to another within a given account.
    '''

    request_data = request.get_json()
    old_folder = get_or_400(request_data, 'old_folder')
    new_folder = get_or_400(request_data, 'new_folder')
    message_uids = get_or_400(request_data, 'message_uids')

    copy_folder_emails(account, old_folder, message_uids, new_folder)

    return jsonify(copied=True)


@add_route('/api/emails/<account>/star', methods=('POST',))
def api_star_account_emails(account) -> Response:
    '''
    Star emails in a given account/folder.
    '''

    request_data = request.get_json()
    folder = get_or_400(request_data, 'folder')
    message_uids = get_or_400(request_data, 'message_uids')

    star_folder_emails(account, folder, message_uids)

    return jsonify(starred=True)


@add_route('/api/emails/<account>/unstar', methods=('POST',))
def api_unstar_account_emails(account) -> Response:
    '''
    Unstar emails in a given account/folder.
    '''

    request_data = request.get_json()
    folder = get_or_400(request_data, 'folder')
    message_uids = get_or_400(request_data, 'message_uids')

    unstar_folder_emails(account, folder, message_uids)

    return jsonify(unstarred=True)


@add_route('/api/emails/<account>/delete', methods=('POST',))
def api_delete_account_emails(account) -> Response:
    '''
    Delete emails in a given account/folder.
    '''

    request_data = request.get_json()
    folder = get_or_400(request_data, 'folder')
    message_uids = get_or_400(request_data, 'message_uids')

    delete_folder_emails(account, folder, message_uids)

    return jsonify(unstarred=True)


@add_route('/api/emails/<account>', methods=('POST',))
def api_append_account_folder_email(account) -> Response:
    '''
    Create and append a message to a folder (ie drafts).
    '''

    request_data = request.get_json()
    folder = pop_or_400(request_data, 'folder')

    message = make_email_message(
        from_=request_data.pop('from', None),  # argname can't be from
        raise_for_no_recipients=False,
        **request_data,
    )

    append_folder_email(account, folder, message)

    return jsonify(saved=True)


@add_route('/api/emails/<account>', methods=('POST',))
def api_send_account_email(account) -> Response:
    '''
    Create (send) emails from one of the accounts.
    '''

    request_data = request.get_json()
    account = get_account(account)

    account.send_email(
        from_=request_data.pop('from', None),  # argname can't be from
        **request_data,
    )

    # Tell the main window to reload the sent folder
    if IS_APP:
        window = get_main_window()
        window.evaluate_js('window.mainEmailStore.syncFolderEmails("sent")')

    return jsonify(sent=False)
