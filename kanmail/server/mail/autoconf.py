import requests

from defusedxml.ElementTree import fromstring as parse_xml
from dns import resolver
from tld import get_fld

ISPDB_URL = 'https://autoconfig.thunderbird.net/v1.1/'


def get_ispdb_confg(domain):
    response = requests.get(f'{ISPDB_URL}/{domain}')
    if response.status_code == 200:
        imap_settings = {}
        smtp_settings = {}

        # Parse the XML
        et = parse_xml(response.content)
        provider = et.find('emailProvider')

        for incoming in provider.findall('incomingServer'):
            if incoming.get('type') != 'imap':
                continue

            imap_settings['host'] = incoming.find('hostname').text
            imap_settings['port'] = incoming.find('port').text

            if incoming.find('socketType').text == 'SSL':
                imap_settings['ssl'] = True
            break

        for outgoing in provider.findall('outgoingServer'):
            if outgoing.get('type') != 'smtp':
                continue

            smtp_settings['host'] = outgoing.find('hostname').text
            smtp_settings['port'] = outgoing.find('port').text

            socket_type = outgoing.find('socketType').text
            if socket_type == 'SSL':
                smtp_settings['ssl'] = True
            elif socket_type == 'STARTTLS':
                smtp_settings['tls'] = True

            break

        return imap_settings, smtp_settings


def get_mx_record_domain(domain):
    answers = sorted([
        (answer.preference, f'{answer.exchange}'.rstrip('.'))
        for answer in resolver.query(domain, 'MX')
    ])

    return set(
        get_fld(answer[1], fix_protocol=True)
        for answer in answers
        if answer[1]
    )


def get_autoconf_settings(username, password):
    settings = {
        'imap_connection': {
            'username': username,
            'password': password,
        },
        'smtp_connection': {
            'username': username,
            'password': password,
        },
    }

    did_autoconf = False
    domain = username.rsplit('@', 1)[-1]
    config = get_ispdb_confg(domain)

    if not config:
        mx_domains = get_mx_record_domain(domain)
        for mx_domain in mx_domains:
            config = get_ispdb_confg(mx_domain)
            if config:
                break

    if config:
        imap, smtp = config
        settings['imap_connection'].update(imap)
        settings['smtp_connection'].update(smtp)
        did_autoconf = True

    return did_autoconf, settings
