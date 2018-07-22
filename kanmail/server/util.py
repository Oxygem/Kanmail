from __future__ import unicode_literals

from functools import wraps
from threading import RLock, Thread

from flask import abort
from six.moves.queue import Queue


def lock_class_method(func):
    @wraps(func)
    def wrapper(self, *args, **kwargs):
        if not hasattr(self, 'lock'):
            self.lock = RLock()

        with self.lock:
            return func(self, *args, **kwargs)

    return wrapper


def get_or_400(obj, key, **kwargs):
    data = obj.get(key, **kwargs)

    if not data:
        return abort(400)

    return data


def get_list_or_400(obj, key, **kwargs):
    data = obj.getlist(key, **kwargs)

    if not data:
        return abort(400)

    return data


def execute_threaded(func, args_list):
    queue = Queue()

    def wrapper(queue, *args):
        queue.put(func(*args))

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
    return items
