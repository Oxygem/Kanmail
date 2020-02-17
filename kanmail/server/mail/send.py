from email.headerregistry import Address
from email.message import EmailMessage
from mimetypes import guess_type
from os import path

from kanmail.log import logger
from kanmail.version import get_version

from .util import markdownify


def _make_address(obj):
    name = ''
    email = obj

    if isinstance(obj, (tuple, list)):
        name, email = obj
        name = name or ''

    username, domain = email.rsplit('@', 1)
    return Address(name, username, domain)


def _ensure_multiple(item):
    if item is None:
        return ()

    if not isinstance(item, (tuple, list)):
        return (item,)

    return item


def send_email(
    smtp_connection,
    from_,
    to=None, cc=None, bcc=None,
    subject=None, text=None, html=None,
    attachments=None,
    # If replying to another message
    reply_to_message_id=None,
    reply_to_message_references=None,
    reply_to_html=None,
):
    text = text or ''

    to = _ensure_multiple(to)
    cc = _ensure_multiple(cc)
    bcc = _ensure_multiple(bcc)

    message = EmailMessage()

    message['X-Mailer'] = f'Kanmail v{get_version()}'

    message['From'] = _make_address(from_)
    message['To'] = tuple(_make_address(a) for a in to)

    if cc:
        message['Cc'] = tuple(_make_address(a) for a in cc)

    if bcc:
        message['Bcc'] = tuple(_make_address(a) for a in bcc)

    if subject:
        message['Subject'] = subject

    if reply_to_message_id:
        message['In-Reply-To'] = reply_to_message_id

        references = reply_to_message_references or []
        references.append(reply_to_message_id)
        message['References'] = ' '.join(references)

    # Attach the text part (simples!)
    message.set_content(text)

    # Make/attach the HTML part, including any quote
    if not html:
        html = markdownify(text)

    if reply_to_html:
        html = f'{html}<blockquote>{reply_to_html}</blockquote>'

    message.add_alternative(html, subtype='html')

    # Handle attached files
    if attachments:
        for attachment in attachments:
            mimetype = guess_type(attachment)[0]
            maintype, subtype = mimetype.split('/')

            with open(attachment, 'rb') as file:
                message.add_attachment(
                    file.read(),
                    maintype=maintype,
                    subtype=subtype,
                    filename=path.basename(attachment),
                )

    # Send the email!
    with smtp_connection.get_connection() as smtp:
        logger.debug((
            f'Send email via SMTP/{smtp_connection}: '
            f'{subject}, from {message["From"]} => {message["To"]}'
        ))
        smtp.send_message(message)
