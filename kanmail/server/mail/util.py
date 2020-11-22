import email.header
import quopri
import re

from base64 import b64decode
from binascii import Error as BinasciiError

from markdown import markdown
from mdx_linkify.mdx_linkify import LinkifyExtension

from kanmail.log import logger

from .contacts import add_contacts


def markdownify(text, linkify=True):
    extensions = [
        'markdown.extensions.extra',
        'markdown.extensions.nl2br',  # turn newlines into breaks
        'markdown.extensions.sane_lists',
    ]

    if linkify:
        extensions.append(LinkifyExtension())

    return markdown(text, extensions)


def format_address(address):
    bits = []

    if address.mailbox:
        bits.append(decode_string(address.mailbox))

    if address.host:
        bits.append(decode_string(address.host))

    return '@'.join(bits)


def make_contact_tuple(address):
    name = decode_header(address.name) if address.name else None
    email = format_address(address)
    return (name, email)


def make_contact_tuples(addresses):
    if not addresses:
        return []

    return [make_contact_tuple(address) for address in addresses]


def make_email_headers(account, folder, uid, data, parts, save_contacts=True):
    # Parse references header into list of reference message IDs
    headers = extract_headers(
        data[b'BODY[HEADER.FIELDS (REFERENCES CONTENT-TRANSFER-ENCODING)]'],
    )

    references = headers.get('References')
    if references:
        references = references.split()

        # This is a fix for some badly build email clients that join message ID
        # references by comma, rather than the standard space *rolls eyes*.
        if len(references) == 1 and '>,<' in references[0]:
            references = references[0].split(',')

    body_meta = None

    if '1' in parts:
        body_meta = parts['1']
    elif '1.1' in parts:
        body_meta = parts['1.1']

    if not body_meta:
        content_transfer_encoding = headers.get('Content-Transfer-Encoding')
        if content_transfer_encoding:
            body_meta = {
                'encoding': content_transfer_encoding,
            }

    encoding = body_meta.get('encoding') if body_meta else None

    # Attempt to extract an excerpt
    excerpt = extract_excerpt(
        data[b'BODY[1]<0>'],
        body_meta,
    )

    # Make the summary dict!
    envelope = data[b'ENVELOPE']
    subject = decode_header(envelope.subject)

    date = None
    if envelope.date:
        date = envelope.date.isoformat()

    from_ = make_contact_tuples(envelope.from_)
    to = make_contact_tuples(envelope.to)
    send = make_contact_tuples(envelope.sender)
    cc = make_contact_tuples(envelope.cc)
    bcc = make_contact_tuples(envelope.bcc)
    reply_to = make_contact_tuples(envelope.reply_to)

    if save_contacts:
        all_contacts = set((*from_, *to, *send, *cc, *bcc, *reply_to))
        add_contacts(all_contacts)

    return {
        'uid': uid,
        'seq': data[b'SEQ'],
        'flags': data[b'FLAGS'],
        'size': data[b'RFC822.SIZE'],
        'excerpt': excerpt,
        'content_encoding': encoding,
        'parts': parts,

        # Internal meta
        'account_name': account.name,
        'server_folder_name': folder.name,
        'folder_name': folder.alias_name,

        # Envelope data
        'date': date,
        'subject': subject,

        # Address data
        'from': from_,
        'to': to,
        'send': send,
        'cc': cc,
        'bcc': bcc,
        'reply_to': reply_to,

        # Threading
        'in_reply_to': envelope.in_reply_to,
        'message_id': envelope.message_id,
        'references': references,
    }


def decode_header(subject):
    if subject is None:
        return ''

    bits = []

    if isinstance(subject, bytes):
        subject = decode_string(subject)

    for output, encoding in email.header.decode_header(subject):
        if encoding:
            output = output.decode(encoding)
        elif isinstance(output, bytes):
            output = decode_string(output)

        bits.append(output)

    return ''.join(bits)


def decode_string(string, string_meta=None, as_str=True):
    encoding = None
    charset = None

    if string_meta:
        # Encoding *must* be provided
        encoding = string_meta['encoding'].lower()

        if 'charset' in string_meta:
            charset = string_meta['charset'].lower()

    # Remove any quoted printable stuff
    if encoding == 'quoted-printable':
        string = quopri.decodestring(string)

    if encoding == 'base64':
        try:
            string = b64decode(string)

        # Handle incomplete payloads (we only fetch the first 1024 bytes of a
        # message). Split into lines and attempt to decode.
        except BinasciiError:
            string_bits = string.split()
            valid_bits = []

            for bit in string_bits:
                try:
                    valid_bits.append(b64decode(bit))
                except Exception:
                    pass

            if not valid_bits:
                raise

            string = b'\n'.join(valid_bits)

    if charset:
        string = string.decode(charset, 'replace')

    if as_str and isinstance(string, bytes):
        string = string.decode('utf-8', 'replace')

    return string


def _extract_excerpt(raw_body, raw_body_meta):
    # Decode the body first
    raw_body = decode_string(raw_body, raw_body_meta)

    # Remove any style tags *and* content
    raw_body = re.sub(r'<style.*>.*(?:</style>)?', '', raw_body, flags=re.DOTALL)

    # Remove any other tags
    raw_body = re.sub(r'<.*?>', '', raw_body)

    # Remove any tag starts (ie <thing ... with no end due to cutoff)
    raw_body = re.sub(r'<[^>]*', '', raw_body)

    lines = []

    for line in raw_body.splitlines():
        line = line.strip()

        if not line:
            continue

        if line[0] in ('#', '-'):
            continue

        if re.match(r'^Content-[A-Za-z\-]+:', line):
            continue

        if line in lines:  # remove duplicates (ie text+html versions)
            continue

        lines.append(line)

    if not lines:
        return

    body = '\n'.join(lines)
    return body


def extract_excerpt(raw_body, raw_body_meta):
    try:
        return _extract_excerpt(
            raw_body,
            raw_body_meta,
        )

    except Exception as e:
        logger.warning((
            'Could not extract excerpt: '
            f'{e} (data={raw_body}, meta={raw_body_meta})'
        ))


def extract_headers(raw_message):
    message = decode_string(raw_message)
    parser = email.parser.HeaderParser()

    return {
        key: decode_header(header)
        for key, header in parser.parsestr(message).items()
    }


def _parse_bodystructure_list(items):
    '''
    Given a list of items ('KEY', 'value', 'OTHER_KEY', 'other_value'), returns
    a dict representation. Handles nested lists.
    '''

    data = {}

    for i in range(0, len(items), 2):
        key = items[i]

        if not isinstance(key, (str, bytes)):
            continue

        value = items[i + 1]

        if isinstance(value, tuple):
            value = _parse_bodystructure_list(value)

        data[key.upper()] = value

    return data


def _parse_bodystructure(bodystructure, item_number=None):
    items = {}

    type_or_bodies = bodystructure[0]

    if isinstance(type_or_bodies, list):
        for i, body in enumerate(type_or_bodies, 1):
            if item_number:
                nested_item_number = f'{item_number}.{i}'
            else:
                nested_item_number = f'{i}'

            items.update(_parse_bodystructure(
                body,
                item_number=nested_item_number,
            ))

    else:
        subtype = decode_string(bodystructure[1])
        encoding = decode_string(bodystructure[5])
        size = bodystructure[6]

        content_id = bodystructure[3]
        if content_id:
            content_id = decode_string(content_id)
            content_id = content_id.strip('<>')

        data = {
            'type': decode_string(type_or_bodies),
            'subtype': subtype,
            'encoding': encoding,
            'content_id': content_id,
            'size': size,
        }

        extra_data = {}

        if bodystructure[2]:
            extra_data.update(_parse_bodystructure_list(bodystructure[2]))

        for bit in bodystructure[7:]:
            if isinstance(bit, tuple) and len(bit) > 1:
                extra_data.update(_parse_bodystructure_list(bit))

        if b'CHARSET' in extra_data:
            data['charset'] = decode_string(extra_data[b'CHARSET'])

        if b'NAME' in extra_data:
            data['name'] = decode_string(extra_data[b'NAME'])

        any_attachment_data = extra_data.get(b'ATTACHMENT') or extra_data.get(b'INLINE')
        if any_attachment_data:
            if b'FILENAME' in any_attachment_data:
                data['name'] = decode_string(any_attachment_data[b'FILENAME'])

        item_number = item_number or 1
        items[item_number] = data

    return items


def parse_bodystructure(bodystructure):
    try:
        items = _parse_bodystructure(bodystructure)
    except Exception as e:
        logger.warning(f'Could not parse bodystructure: {e} (struct={bodystructure})')

        raise

    # Attach shortcuts -> part IDs
    items['attachments'] = []

    for number, part in list(items.items()):
        if number == 'attachments':
            continue

        if part['type'].upper() == 'TEXT':
            subtype = part['subtype'].upper()

            if 'html' not in items and subtype == 'HTML':
                items['html'] = number
                continue

            if 'plain' not in items and subtype == 'PLAIN':
                items['plain'] = number
                continue

        items['attachments'].append(number)

    return items
