from functools import wraps
from queue import Queue
from threading import RLock, Thread
from typing import Optional, Union

from flask import abort
from werkzeug.datastructures import ImmutableMultiDict

from kanmail.log import logger
from kanmail.settings.constants import DEBUG_LOCKS


def lock_class_method(func):
    @wraps(func)
    def wrapper(self, *args, **kwargs):
        if not hasattr(self, 'lock'):
            self.lock = RLock()

        if DEBUG_LOCKS:
            logger.debug(f'Acquire lock for {self}')
        with self.lock:
            return_value = func(self, *args, **kwargs)
        if DEBUG_LOCKS:
            logger.debug(f'Release lock for {self}')
        return return_value

    return wrapper


def get_or_400(obj: ImmutableMultiDict, key: str) -> Union[None, str, dict]:
    data = obj.get(key)

    if not data:
        abort(400, f'missing data: {key}')

    return data


def get_list_or_400(obj: ImmutableMultiDict, key: str, **kwargs) -> Optional[list]:
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
