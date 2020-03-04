import uuid

from typing import Optional

from keyring import set_password


KEY = uuid.uuid4().hex

CONNECTION_DEFAULTS = {
    'username': str,
    'password': str,
    'host': str,
    'port': int,
    'ssl': bool,
}

MODEL = {
    'columns': [str],
    'contacts': [
        [str, str],
    ],
    'system': {
        'batch_size': (int, 50),
        'initial_batches': (int, 3),
        'sync_days': (int, 0),
        'sync_interval': (int, 60000),
        'undo_ms': (int, 5000),
    },
    'style': {
        'header_background': str,
        'sidebar_folders': [str],
    },
    'accounts': [
        {
            'name': str,
            'imap_connection': {
                **CONNECTION_DEFAULTS,
            },
            'smtp_connection': {
                'tls': bool,
                **CONNECTION_DEFAULTS,
            },
            'folders': {
                KEY: str,
                'save_sent_copies': bool,
            },
            'contacts': [
                [str, str],
            ],
        },
    ],
}


def get_default_settings(spec: dict = MODEL, defaults: dict = None) -> dict:
    defaults = defaults or {}

    for key, value in spec.items():
        if key is KEY:
            continue

        if isinstance(value, dict):
            defaults[key] = get_default_settings(value)
        elif isinstance(value, list):
            defaults[key] = []
        elif isinstance(value, tuple):
            defaults[key] = value[1]

    return defaults


def _make_type_error(value, spec, path):
    path = '.'.join(path)
    return TypeError((
        f'Incorrect type for {path} '
        f'(got={value}, gotType={type(value)}, wantedType={spec})'
    ))


def _validate_key(value, spec, path):
    if isinstance(spec, list):
        if not isinstance(value, list):
            raise _make_type_error(value, spec, path)
        for i, s in enumerate(spec):
            _validate_key(value[i], s, path)
            return

    if isinstance(spec, tuple):
        spec = spec[0]

    if not isinstance(value, spec):
        raise _make_type_error(value, spec, path)


def validate_settings(
    settings: dict = None,
    spec: dict = MODEL,
    path: Optional[list] = None,
) -> None:
    if not isinstance(settings, dict):
        return _validate_key(settings, spec, path)

    accounts = settings.get('accounts')
    if accounts:
        account_names = set()
        for account in accounts:
            account_name = account['name']
            if account_name in account_names:
                raise ValueError('Cannot have duplicate account names!')
            account_names.add(account_name)

    path = path or []
    any_key = KEY in spec

    for key, value in settings.items():
        if key in spec:
            target_spec = spec[key]
        elif any_key:
            target_spec = spec[KEY]
        else:
            raise ValueError(f'Missing key: {key}')

        target_path = path[:]
        target_path.append(key)

        if isinstance(value, dict):
            if not isinstance(target_spec, dict):
                raise _make_type_error(value, target_spec, path)
            validate_settings(value, target_spec, target_path)

        elif isinstance(value, list):
            if not isinstance(target_spec, list):
                raise _make_type_error(value, target_spec, path)
            for v in value:
                validate_settings(v, target_spec[0], target_path)

        else:
            _validate_key(value, target_spec, target_path)


def fix_any_old_setings(settings: dict):
    has_changed = False

    style_settings = settings.get('style')
    if style_settings:
        # Fix for settings.style.sidebar_folders changing from str -> list
        # pre v1.2002191933
        sidebar_folders = style_settings.get('sidebar_folders')
        if isinstance(sidebar_folders, str):
            style_settings['sidebar_folders'] = [sidebar_folders]
            has_changed = True

    # "Fix" for settings.accounts used to be a dict, now  a list for ordering
    # pre v1.2002211810
    accounts = settings.get('accounts')
    if isinstance(accounts, dict):
        settings['accounts'] = [
            {'name': account_key, **account}
            for account_key, account in accounts.items()
        ]
        has_changed = True

    for account_settings in settings.get('accounts', []):
        # Fix for settings.accounts.<name>.imap_connection.port changing from str -> int
        # pre v1.2002191933
        imap_settings = account_settings.get('imap_connection')
        if imap_settings:
            imap_port = imap_settings.get('port')
            if isinstance(imap_port, str):
                imap_settings['port'] = int(imap_port)
                has_changed = True

            # Fix for removing passwords from on-disk settings
            # pre v1.2002211810
            password = imap_settings.pop('password', None)
            if password:
                set_password(imap_settings['host'], imap_settings['username'], password)
                has_changed = True

        # Fix for settings.accounts.<name>.smtp_connection.port changing from str -> int
        # pre v1.2002191933
        smtp_settings = account_settings.get('smtp_connection')
        if smtp_settings:
            smtp_port = smtp_settings.get('port')
            if isinstance(smtp_port, str):
                smtp_settings['port'] = int(smtp_port)
                has_changed = True

            # Fix for removing passwords from on-disk settings
            # pre v1.2002211810
            password = smtp_settings.pop('password', None)
            if password:
                set_password(smtp_settings['host'], smtp_settings['username'], password)
                has_changed = True

    return has_changed
