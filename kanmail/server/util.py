from __future__ import unicode_literals

from functools import wraps
from queue import Queue
from threading import Lock, Thread

from flask import abort
from werkzeug import ImmutableMultiDict


def lock_class_method(func):
    @wraps(func)
    def wrapper(self, *args, **kwargs):
        if not hasattr(self, 'lock'):
            self.lock = Lock()

        with self.lock:
            return func(self, *args, **kwargs)

    return wrapper


def get_or_400(obj: ImmutableMultiDict, key: str) -> dict:
    data = obj.get(key)

    if not data:
        abort(400)

    return data


def get_list_or_400(obj: ImmutableMultiDict, key: str, **kwargs) -> dict:
    data = obj.getlist(key, **kwargs)

    if not data:
        abort(400)

    return data


def execute_threaded(func, args_list):
    queue = Queue()

    def wrapper(queue, *args):
        try:
            output = func(*args)
        except Exception as e:
            output = e
        queue.put(output)

    threads = []

    for args in args_list:
        args = (queue,) + args
        thread = Thread(target=wrapper, args=args)
        threads.append(thread)
        thread.start()

    for thread in threads:
        thread.join()

    # Grab the queue - not thread safe but after threads :)
    items = list(queue.queue)

    # Raise any exceptions (will only raise first)
    for item in items:
        if isinstance(item, Exception):
            raise item

    return items
