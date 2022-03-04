import requests

from requests import Request

from kanmail.log import logger
from kanmail.server.app import server
from kanmail.settings.constants import SESSION_TOKEN, DEACTIVATE_OAUTH

if not DEACTIVATE_OAUTH:
    from .oauth_settings import OAUTH_PROVIDERS


CURRENT_OAUTH_TOKENS = {}


def make_redirect_uri(uid):
    return (
        f'http://127.0.0.1:{server.get_port()}/api/oauth/respond'
        f'?Kanmail-Session-Token={SESSION_TOKEN}&uid={uid}'
    )


def get_oauth_settings(provider):
    settings = OAUTH_PROVIDERS.get(provider)
    if not settings:
        raise ValueError(f'Invalid oauth provider: {provider}')
    return settings


def get_oauth_request_url(provider, uid):
    oauth_settings = get_oauth_settings(provider)

    return Request(
        'GET',
        oauth_settings['auth_endpoint'],
        params={
            'client_id': oauth_settings['client_id'],
            'scope': oauth_settings['scope'],
            'response_type': 'code',
            'redirect_uri': make_redirect_uri(uid),
        },
    ).prepare().url


def get_oauth_tokens_from_code(provider, uid, auth_code):
    oauth_settings = get_oauth_settings(provider)

    response = requests.post(
        oauth_settings['token_endpoint'],
        params={
            'client_id': oauth_settings['client_id'],
            'client_secret': oauth_settings['client_secret'],
            'code': auth_code,
            'grant_type': 'authorization_code',
            'redirect_uri': make_redirect_uri(uid),
        },
    )
    response.raise_for_status()

    oauth_response = response.json()

    profile_request = requests.get(
        oauth_settings['profile_endpoint'],
        headers={
            'Authorization': f'Bearer {oauth_response["access_token"]}',
        },
    )
    profile_request.raise_for_status()

    oauth_response['email'] = profile_request.json()['email']

    return oauth_response


def get_oauth_tokens_from_refresh_token(provider, refresh_token):
    access_token = CURRENT_OAUTH_TOKENS.get(refresh_token)
    if access_token:
        return access_token

    oauth_settings = get_oauth_settings(provider)

    response = requests.post(
        oauth_settings['token_endpoint'],
        params={
            'client_id': oauth_settings['client_id'],
            'client_secret': oauth_settings['client_secret'],
            'refresh_token': refresh_token,
            'grant_type': 'refresh_token',
        },
    )
    response.raise_for_status()

    oauth_response = response.json()

    if 'refresh_token' not in oauth_response:
        oauth_response['refresh_token'] = refresh_token

    # Store the tokens against the returned response token, if this changes
    # the connection object will use this to lookup.
    CURRENT_OAUTH_TOKENS[refresh_token] = oauth_response
    return oauth_response


def invalidate_access_token(refresh_token):
    tokens = CURRENT_OAUTH_TOKENS.pop(refresh_token, None)

    if tokens is None:
        logger.warning('Invalidated non-existent refresh token')


def set_oauth_tokens(refresh_token, access_token):
    CURRENT_OAUTH_TOKENS[refresh_token] = {
        'refresh_token': refresh_token,
        'access_token': access_token,
    }
