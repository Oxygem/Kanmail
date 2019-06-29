'''
Kanmail cache.

Namespace/key/value based. The cache folder looks like so:

- /cache
    - /<namespace>
        - /<folder-hash>
            - <key>

The cache keeps track of namespaces it's part of so it can bust itself. Data is
serialized using pickle.
'''

from functools import wraps
from hashlib import sha1
from os import makedirs, path, remove
from pickle import (
    dumps as pickle_dumps,
    loads as pickle_loads,
    UnpicklingError,
)
from shutil import rmtree
from threading import Lock

from kanmail.log import logger
from kanmail.settings import CACHE_DIR, CACHE_ENABLED

MAKE_DIRS_LOCK = Lock()

UID_VALIDITY_NAMESPACE = 'uidvalidity'  # uid validity flags
UIDS_NAMESPACE = 'uids'  # uid lists
HEADERS_NAMESPACE = 'headers'  # email headers


def bust_all_caches(caches=(UID_VALIDITY_NAMESPACE, UIDS_NAMESPACE, HEADERS_NAMESPACE)):
    logger.warning(f'Busting entire caches: {caches}!')

    with MAKE_DIRS_LOCK:
        for folder in (caches):
            rmtree(path.join(CACHE_DIR, folder))


def _make_uid_key(uid):
    return f'{uid}'


def _hash_key(data):
    if isinstance(data, str):
        data = data.encode()

    hasher = sha1()
    hasher.update(data)
    return hasher.hexdigest()


def _trim(value):
    value = f'{value}'
    if len(value) > 80:
        return f'{value[:77]}...'
    return value


class FolderCache(object):
    def __init__(self, folder):
        self.folder = folder

        name = f'{self.folder.account.name}-{self.folder.name}'

        self.name = name
        self.namespaces = set()

    def log(self, method, message):
        func = getattr(logger, method)
        func(f'[Folder cache: {self.name}]: {message}')

    # Cache implementation
    #

    def make_cache_dirname(self, namespace):
        return path.join(CACHE_DIR, namespace, _hash_key(self.name))

    def make_cache_filename(self, namespace, uid):
        cache_dir = self.make_cache_dirname(namespace)
        uid = _hash_key(_make_uid_key(uid))
        return path.join(cache_dir, uid)

    def ensure_cache_dir(self, namespace):
        cache_dir = self.make_cache_dirname(namespace)

        with MAKE_DIRS_LOCK:
            if not path.exists(cache_dir):
                self.log('debug', f'create namespace: {namespace}')
                makedirs(cache_dir)

    def populate_namespaces(func):
        @wraps(func)
        def decorated(self, namespace, *args, **kwargs):
            # We *always* cache UID validity or it means we refetch emails every
            # sync. Realistically the cache is only disabled in dev.
            if not CACHE_ENABLED and namespace != UID_VALIDITY_NAMESPACE:
                return
            self.namespaces.add(namespace)
            return func(self, namespace, *args, **kwargs)
        return decorated

    @populate_namespaces
    def delete(self, namespace, key):

        filename = self.make_cache_filename(namespace, key)
        if path.exists(filename):
            self.log('debug', f'delete: {namespace}/{key}')
            remove(filename)

    @populate_namespaces
    def set(self, namespace, key, value):
        self.ensure_cache_dir(namespace)

        filename = self.make_cache_filename(namespace, key)

        self.log('debug', f'write {namespace}/{key}={_trim(value)}')

        with open(filename, 'wb') as f:
            f.write(pickle_dumps(value))

    @populate_namespaces
    def get(self, namespace, key):
        filename = self.make_cache_filename(namespace, key)

        if not path.exists(filename):
            return None

        try:
            with open(filename, 'rb') as f:
                pickle_data = f.read()
            data = pickle_loads(pickle_data)

        except (EOFError, UnpicklingError) as e:
            self.log(
                'warning',
                f'{e.__class__.__name__} raised reading {namespace}/{key}: {e}',
            )
            return

        return data

    def bust(self):
        if not CACHE_ENABLED:
            return

        self.log('warning', 'busting the cache!')

        for namespace in self.namespaces:
            folder_name = self.make_cache_dirname(namespace)
            if path.exists(folder_name):
                self.log('debug', f'delete namespace: {namespace}')
                rmtree(folder_name)

    # Get/set shortcuts
    #

    def set_uid_validity(self, uid_validity):
        self.set(UID_VALIDITY_NAMESPACE, 'uid_validity', uid_validity)

    def get_uid_validity(self):
        return self.get(UID_VALIDITY_NAMESPACE, 'uid_validity')

    def set_uids(self, uids):
        return self.set(UIDS_NAMESPACE, 'uids', uids)

    def get_uids(self):
        return self.get(UIDS_NAMESPACE, 'uids')

    def set_headers(self, uid, headers):
        return self.set(HEADERS_NAMESPACE, uid, headers)

    def get_headers(self, uid):
        return self.get(HEADERS_NAMESPACE, uid)

    def delete_headers(self, uid):
        return self.delete(HEADERS_NAMESPACE, uid)

    def get_parts(self, uid):
        headers = self.get(HEADERS_NAMESPACE, uid)
        if headers:
            return headers['parts']
