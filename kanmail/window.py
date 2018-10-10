import webview

from kanmail.settings import DEBUG, SERVER_PORT


def create_window(title='Kanmail', endpoint='/', **kwargs):
    link = f'http://localhost:{SERVER_PORT}{endpoint}'

    return webview.create_window(
        title, link,
        debug=DEBUG,
        # frameless=True,
        text_select=True,
        **kwargs,
    )
