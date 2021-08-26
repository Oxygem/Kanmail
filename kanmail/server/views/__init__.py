from os import path
from uuid import uuid4

from flask import (
    abort,
    jsonify,
    redirect,
    render_template,
    request,
    send_from_directory,
    url_for,
)

from kanmail.license import check_get_license_email
from kanmail.log import logger
from kanmail.server.app import add_public_route, add_route
from kanmail.server.mail.contacts import get_contact_dicts
from kanmail.server.mail.util import markdownify
from kanmail.server.util import get_or_400
from kanmail.settings import get_device_id, get_system_setting
from kanmail.settings.constants import (
    CLIENT_ROOT,
    DEBUG,
    DEBUG_POSTHOG,
    DEBUG_SENTRY,
    FRAMELESS,
    FROZEN,
    IS_APP,
    META_FILE_ROOT,
    PLATFORM,
    SESSION_TOKEN,
    WEBSITE_URL,
)
from kanmail.settings.hidden import get_hidden_value
from kanmail.version import get_version


SEND_WINDOW_DATA = {}


if FROZEN:
    # This view redirects non-versioned static requests (webpack public path is static)
    # to the versioned one when running as a frozen app.
    @add_public_route('/static/dist/<filename>')
    def get_dev_static_file(filename):
        return redirect(url_for('static', filename=f'dist/{get_version()}/{filename}'))
elif DEBUG:
    # Thie view redirects local development static requests to webpack dev server
    @add_public_route('/static/dist/<filename>')
    def get_dev_static_file(filename):
        return redirect(f'http://localhost:4421/static/dist/{filename}')


@add_public_route('/favicon.ico')
def favicon():
    return send_from_directory(CLIENT_ROOT, 'icon.png', mimetype='image/png')


@add_public_route('/ping', methods=('GET',))
def ping():
    return jsonify(ping='pong')


def _get_render_data():
    return {
        'version': get_version(),
        'license_email': check_get_license_email(),
        'debug': DEBUG,
        'debug_sentry': DEBUG_SENTRY,
        'debug_posthog': DEBUG_POSTHOG,
        'frameless': FRAMELESS,
        'frozen': FROZEN,
        'is_app': IS_APP,
        'platform': PLATFORM,
        'session_token': SESSION_TOKEN,
        'website_url': WEBSITE_URL,
        'device_id': get_device_id(),
        'sentry_dsn': get_hidden_value('SENTRY_DSN'),
        'posthog_api_key': get_hidden_value('POSTHOG_API_KEY'),
        'disable_error_logging': get_system_setting('disable_error_logging'),
        'disable_analytics': get_system_setting('disable_analytics'),
    }


@add_route('/', methods=('GET',))
def get_emails():
    return render_template(
        'emails.html',
        **_get_render_data(),
    )


@add_route('/meta', methods=('GET',))
def get_meta():
    return render_template(
        'meta.html',
        **_get_render_data(),
    )


@add_route('/license', methods=('GET',))
def get_license():
    return render_template(
        'license.html',
        **_get_render_data(),
    )


@add_route('/settings', methods=('GET',))
def get_settings():
    return render_template(
        'settings.html',
        **_get_render_data(),
    )


@add_route('/meta-file/<filename>', methods=('GET',))
def get_meta_file(filename):
    file_path = path.join(META_FILE_ROOT, filename)
    if not path.exists(file_path):
        abort(404, 'This file does not exist!')

    with open(file_path, 'r') as f:
        file_data = f.read()

    file_data = markdownify(file_data, linkify=False)
    file_title = filename.replace('.md', '').title()

    return render_template(
        'meta_file.html',
        filename=filename,
        file_data=file_data,
        file_title=file_title,
        **_get_render_data(),
    )


@add_route('/contacts', methods=('GET',))
def get_contacts_page():
    contacts = get_contact_dicts()
    contacts = sorted(contacts, key=lambda c: c.get('email', ''))

    return render_template(
        'contacts.html',
        contacts=contacts,
        **_get_render_data(),
    )


@add_route('/send', methods=('GET',))
def get_send():
    return render_template(
        'send.html',
        contacts=get_contact_dicts(),
        **_get_render_data(),
    )


@add_route('/send/<uid>', methods=('GET',))
def get_send_reply(uid):
    if DEBUG:
        reply = SEND_WINDOW_DATA.get(uid)
    else:
        reply = SEND_WINDOW_DATA.pop(uid, None)

    if not reply:
        abort(404, 'Reply message not found!')

    return render_template(
        'send.html',
        reply=reply,
        contacts=get_contact_dicts(),
        **_get_render_data(),
    )


@add_route('/create-send', methods=('POST',))
def create_send():
    data = request.get_json()
    message_data = get_or_400(data, 'message')
    message_data['reply_all'] = data.get('reply_all', False)
    message_data['forward'] = data.get('forward', False)
    message_data['edit'] = data.get('edit', False)

    uid = str(uuid4())
    SEND_WINDOW_DATA[uid] = message_data
    logger.debug(f'Created send data with UID={uid}')

    endpoint = f'/send/{uid}'
    return jsonify(endpoint=endpoint)
