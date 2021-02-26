import json

from base64 import b64decode, b64encode
from hashlib import md5
from os import path

import requests

from kanmail.settings.constants import ICON_CACHE_DIR

# This is a transparent 1x1px gif
DEFAULT_ICON_DATA = b64decode('R0lGODlhAQABAIAAAP///////yH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==')
DEFAULT_ICON_MIMETYPE = 'image/gif'


def get_icon_for_email(email):
    email = email.lower().strip()

    hasher = md5()
    hasher.update(email.encode())
    email_hash = hasher.hexdigest()

    cached_icon_filename = path.join(ICON_CACHE_DIR, f'{email_hash}.json')
    if path.exists(cached_icon_filename):
        with open(cached_icon_filename, 'r') as f:
            base64_data, mimetype = json.load(f)
            return b64decode(base64_data), mimetype

    requests_to_attempt = [
        (f'https://www.gravatar.com/avatar/{email_hash}', {'d': '404'}),
    ]

    if '@' in email:
        email_domain = email.rsplit('@', 1)[1]
        email_domain_parts = list(reversed(email_domain.split('.')))
        email_domains = [
            '.'.join(reversed(email_domain_parts[:i + 1]))
            for i in range(len(email_domain_parts))
        ]
        for domain in reversed(email_domains[1:]):
            requests_to_attempt.append(f'https://icons.duckduckgo.com/ip3/{domain}.ico')

    for url in requests_to_attempt:
        params = None
        if isinstance(url, tuple):
            url, params = url

        response = requests.get(url, params=params)
        if response.status_code == 200:
            data, mimetype = response.content, response.headers.get('Content-Type')
            with open(cached_icon_filename, 'w') as f:
                json.dump([b64encode(data).decode(), mimetype], f)
            return data, mimetype

    return DEFAULT_ICON_DATA, DEFAULT_ICON_MIMETYPE
