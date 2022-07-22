from flask import request

from kanmail.notifications import send_notification, set_notification_count
from kanmail.server.app import add_route
from kanmail.server.util import get_or_400


@add_route("/api/notifications/send", methods=("POST",))
def notification_send():
    request_data = request.get_json()
    send_notification(
        title=get_or_400(request_data, "title"),
        subtitle=request_data.get("subtitle"),
        body=request_data.get("body"),
    )
    return "", 204


@add_route("/api/notifications/set-count", methods=("POST",))
def notification_set_count():
    request_data = request.get_json()
    set_notification_count(
        count=get_or_400(request_data, "count"),
    )
    return "", 204
