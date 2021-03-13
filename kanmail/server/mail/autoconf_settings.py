'''
Hardcoded settings for the most common providers.
'''

COMMON_ISPDB_DOMAINS = {
    'gmail.com': {
        'imap_connection': {
            'host': 'imap.gmail.com',
            'port': 993,
            'ssl': True,
        },
        'smtp_connection': {
            'host': 'smtp.gmail.com',
            'port': 465,
            'tls': False,
            'ssl': True,
        },
    },

    'icloud.com': {
        'imap_connection': {
            'host': 'imap.mail.me.com',
            'port': 993,
            'ssl': True,
        },
        'smtp_connection': {
            'host': 'smtp.mail.me.com',
            'port': 587,
            'tls': True,
            'ssl': False,
        },
    },

    'outlook.com': {
        'imap_connection': {
            'host': 'outlook.office365.com',
            'port': 993,
            'ssl': True,
        },
        'smtp_connection': {
            'host': 'smtp.office365.com',
            'port': 587,
            'tls': True,
            'ssl': False,
        },
    },

    'yahoo.com': {
        'imap_connection': {
            'host': 'imap.mail.yahoo.com',
            'port': 993,
            'ssl': True,
        },
        'smtp_connection': {
            'host': 'smtp.mail.yahoo.com',
            'port': 465,
            'tls': False,
            'ssl': True,
        },
    },
}
