from kanmail.log import logger
from kanmail.settings.constants import IS_APP


def import_macos():
    try:
        from kanmail.notifications import macos

        return macos
    except ImportError:
        pass


class Dummy:
    def init():
        pass

    def send_notification(*args, **kwargs):
        logger.debug(f"Sending dummy notification args={args} kwargs={kwargs}")

    def set_notification_count(*args, **kwargs):
        logger.debug(f"Setting dummy notification count args={args} kwargs={kwargs}")


if IS_APP:
    for loader in (import_macos,):
        module = loader()
        if module:
            break
    else:
        module = Dummy
else:
    module = Dummy


module.init()


def send_notification(*args, **kwargs):
    return module.send_notification(*args, **kwargs)


def set_notification_count(*args, **kwargs):
    return module.set_notification_count(*args, **kwargs)
