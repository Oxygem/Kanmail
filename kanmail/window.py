import webview

from kanmail import settings


def create_window(title='Kanmail', endpoint='/', **kwargs):
    link = 'http://localhost:{0}{1}'.format(settings.SERVER_PORT, endpoint)

    return webview.create_window(
        title, link,
        debug=settings.DEBUG,
        # frameless=True,
        text_select=True,
        **kwargs,
    )
