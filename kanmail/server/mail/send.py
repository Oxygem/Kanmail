from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from smtplib import SMTP

from kanmail.log import logger

from .contacts import get_contacts
from .util import markdownify


def make_address(obj):
    if isinstance(obj, (tuple, list)):
        return '{0} <{1}>'.format(*obj)
    else:
        contacts = get_contacts()
        if obj in contacts:
            return make_address((contacts[obj], obj))
    return obj


def send_email(
    host, username, password, ssl,
    from_, to,
    cc=None, bcc=None,
    subject=None, text=None, html=None,
    # If replying to another message
    reply_to_message_id=None,
    reply_to_message_references=None,
    reply_to_html=None,
):
    text = text or ''

    if not isinstance(to, (tuple, list)):
        to = (to,)

    if cc and not isinstance(cc, (tuple, list)):
        cc = (cc,)

    if bcc and not isinstance(bcc, (tuple, list)):
        bcc = (bcc,)

    message = MIMEMultipart('alternative')

    message['From'] = make_address(from_)
    message['To'] = ', '.join(make_address(a) for a in to)

    if cc:
        message['Cc'] = ', '.join(make_address(a) for a in cc)

    if bcc:
        message['Bcc'] = ', '.join(make_address(a) for a in bcc)

    if subject:
        message['Subject'] = subject

    if reply_to_message_id:
        message['In-Reply-To'] = reply_to_message_id

        references = reply_to_message_references or []
        references.append(reply_to_message_id)
        message['References'] = ' '.join(references)

    # Attach the text part (simples!)
    text_part = MIMEText(text, 'plain')
    message.attach(text_part)

    # Make/attach the HTML part, including any quote
    if not html:
        html = markdownify(text)

    if reply_to_html:
        html = '{0}<blockquote>{1}</blockquote>'.format(html, reply_to_html)

    html_part = MIMEText(html, 'html')
    message.attach(html_part)

    # Send the email!
    logger.debug('Connecting to SMTP: {0}'.format(host))
    smtp = SMTP(host, 587)
    # smtp.set_debuglevel(1)
    smtp.connect(host, 587)

    if ssl:
        smtp.starttls()

    logger.debug('Logging into SMTP/{0} with {1}:{2}'.format(
        host, username, password,
    ))
    smtp.login(username, password)

    logger.debug('Send email via SMTP/{0}: {1}'.format(host, subject))
    smtp.sendmail(from_, to, message.as_string())
    smtp.quit()
