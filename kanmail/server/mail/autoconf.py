import requests

from defusedxml.ElementTree import fromstring as parse_xml
from dns import resolver
from tld import get_fld

from kanmail.log import logger

from .autoconf_settings import COMMON_ISPDB_DOMAINS

ISPDB_URL = 'https://autoconfig.thunderbird.net/v1.1/'


def get_ispdb_confg(domain: str) -> [dict, dict]:
    if domain in COMMON_ISPDB_DOMAINS:
        logger.debug(f'Got hardcoded autoconfig for {domain}')
        return (
            COMMON_ISPDB_DOMAINS[domain]['imap_connection'],
            COMMON_ISPDB_DOMAINS[domain]['smtp_connection'],
        )

    logger.debug(f'Looking up thunderbird autoconfig for {domain}')

    response = requests.get(f'{ISPDB_URL}/{domain}')
    try:
        response = requests.get(f'{ISPDB_URL}/{domain}')
    except requests.RequestException as e:
        logger.warning(f'Failed to fetch ISPDB settings for domain: {domain}: {e}')
        return

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
            imap_settings['port'] = int(incoming.find('port').text)
            imap_settings['ssl'] = incoming.find('socketType').text == 'SSL'
            break

        for outgoing in provider.findall('outgoingServer'):
            if outgoing.get('type') != 'smtp':
                continue

            smtp_settings['host'] = outgoing.find('hostname').text
            smtp_settings['port'] = int(outgoing.find('port').text)

            socket_type = outgoing.find('socketType').text
            smtp_settings['ssl'] = socket_type == 'SSL'
            smtp_settings['tls'] = socket_type == 'STARTTLS'
            break

        logger.debug((
            f'Autoconf settings for {domain}: '
            f'imap={imap_settings}, smtp={smtp_settings}'
        ))
        return imap_settings, smtp_settings


def get_mx_record_domain(domain: str) -> list:
    logger.debug(f'Fetching MX records for {domain}')

    name_to_preference = {}
    names = set()

    try:
        for answer in resolver.query(domain, 'MX'):
            name = get_fld(f'{answer.exchange}'.rstrip('.'), fix_protocol=True)
            name_to_preference[name] = answer.preference
            names.add(name)
    except (resolver.NoAnswer, resolver.NXDOMAIN):
        return []

    return sorted(
        list(names),
        key=lambda name: name_to_preference[name],
    )


def get_autoconf_settings(username: str, domain: str = None) -> [bool, dict]:
    settings = {
        'imap_connection': {
            'username': username,
            'ssl': True,
            'ssl_verify_hostname': True,
        },
        'smtp_connection': {
            'username': username,
            'ssl': True,
            'ssl_verify_hostname': True,
        },
    }

    did_autoconf = False

    if not domain:
        domain = username.rsplit('@', 1)[-1]

    config = get_ispdb_confg(domain)

    if not config:
        mx_domains = get_mx_record_domain(domain)
        for mx_domain in mx_domains:
            if mx_domain == domain:  # don't re-attempt the original domain
                continue
            config = get_ispdb_confg(mx_domain)
            if config:
                break

    if config:
        imap, smtp = config
        settings['imap_connection'].update(imap)
        settings['smtp_connection'].update(smtp)
        did_autoconf = True

    return did_autoconf, settings
