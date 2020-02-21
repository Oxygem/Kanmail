import uuid

from typing import Optional


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
    'accounts': {
        KEY: {
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
    },
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

        raise _make_type_error(value, spec, path)


def validate_settings(
    settings: dict = None,
    spec: dict = MODEL,
    path: Optional[list] = None,
) -> None:
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
                _validate_key(v, target_spec[0], target_path)

        else:
            _validate_key(value, target_spec, target_path)
