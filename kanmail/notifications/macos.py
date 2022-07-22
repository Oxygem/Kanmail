from __future__ import annotations

from functools import lru_cache
from uuid import uuid4

import UserNotifications

from kanmail.log import logger


def _notif_callback(err):
    if err:
        logger.error(f"Error in notification callback: {err}")


def _auth_callback(granted, err):
    if not granted:
        logger.error(f"Error in authorization request: {err}")


@lru_cache(maxsize=1)
def _get_notification_center():
    notification_center = UserNotifications.UNUserNotificationCenter.currentNotificationCenter()
    notification_center.requestAuthorizationWithOptions_completionHandler_(
        UserNotifications.UNAuthorizationOptionBadge,
        _auth_callback,
    )
    return notification_center


def init():
    # Send an empty notification with 0 count to load the notification center
    # and reset any previous count.
    _send_notification(count=0)


def _send_notification(
    title: str | None = None,
    subtitle: str | None = None,
    body: str | None = None,
    count: int | None = None,
):
    content = UserNotifications.UNMutableNotificationContent.alloc().init()

    if title:
        content.setTitle_(title)

    if subtitle:
        content.setSubtitle_(subtitle)

    if body:
        content.setBody_(body)

    if count is not None:
        content.setBadge_(count)

    request = UserNotifications.UNNotificationRequest.requestWithIdentifier_content_trigger_(
        str(uuid4()),
        content,
        None,
    )

    _get_notification_center().addNotificationRequest_withCompletionHandler_(
        request,
        _notif_callback,
    )


def send_notification(
    title: str,
    subtitle: str | None = None,
    body: str | None = None,
):
    logger.debug(f"Sending notification title={title}")
    return _send_notification(title=title, subtitle=subtitle, body=body)


def set_notification_count(count: int):
    logger.debug(f"Setting notification count to {count}")
    return _send_notification(count=count)
