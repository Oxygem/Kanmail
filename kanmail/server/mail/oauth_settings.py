from os import environ


OAUTH_PROVIDERS = {
    'gmail': {
        'auth_endpoint': 'https://accounts.google.com/o/oauth2/auth',
        'token_endpoint': 'https://accounts.google.com/o/oauth2/token',
        'profile_endpoint': 'https://www.googleapis.com/userinfo/v2/me',
        'scope': 'https://mail.google.com https://www.googleapis.com/auth/userinfo.email',
        'client_id': environ['GOOGLE_OAUTH_CLIENT_ID'],
        'client_secret': environ['GOOGLE_OAUTH_CLIENT_SECRET'],
    },
}
