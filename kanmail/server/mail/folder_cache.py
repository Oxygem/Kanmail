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

import pickle

from functools import wraps
from hashlib import sha1
from os import makedirs, path, remove
from shutil import rmtree
from threading import Lock

from kanmail.log import logger
from kanmail.settings import SETTINGS_DIR

MAKE_DIRS = Lock()


def _make_uid_key(uid):
    return '{0}'.format(uid)


def _hash_key(data):
    if isinstance(data, str):
        data = data.encode()

    hasher = sha1()
    hasher.update(data)
    return hasher.hexdigest()


def _trim(value):
    value = '{0}'.format(value)
    if len(value) > 80:
        return '{0}...'.format(value[:77])
    return value


class FolderCache(object):
    def __init__(self, folder):
        self.folder = folder

        name = '{0}-{1}'.format(
            self.folder.account.name,
            self.folder.name,
        )

        self.name = name
        self.namespaces = set()

    def log(self, method, message):
        func = getattr(logger, method)
        func('[Folder cache: {0}]: {1}'.format(
            self.name, message,
        ))

    # Cache implementation
    #

    def make_cache_dirname(self, namespace):
        return path.join(
            SETTINGS_DIR, 'cache', namespace,
            _hash_key(self.name),
        )

    def make_cache_filename(self, namespace, uid):
        cache_dir = self.make_cache_dirname(namespace)
        uid = _hash_key(_make_uid_key(uid))
        return path.join(cache_dir, uid)

    def ensure_cache_dir(self, namespace):
        cache_dir = self.make_cache_dirname(namespace)

        with MAKE_DIRS:
            if not path.exists(cache_dir):
                self.log('debug', 'create namespace {0}'.format(namespace))
                makedirs(cache_dir)

    def populate_namespaces(func):
        @wraps(func)
        def decorated(self, namespace, *args, **kwargs):
            self.namespaces.add(namespace)
            return func(self, namespace, *args, **kwargs)
        return decorated

    @populate_namespaces
    def delete(self, namespace, key):
        filename = self.make_cache_filename(namespace, key)
        if path.exists(filename):
            self.log('debug', 'delete {0}/{1}'.format(namespace, key))
            remove(filename)

    @populate_namespaces
    def set(self, namespace, key, value):
        self.ensure_cache_dir(namespace)

        filename = self.make_cache_filename(namespace, key)

        self.log('debug', 'write {0}/{1}={2}'.format(namespace, key, _trim(value)))

        with open(filename, 'wb') as f:
            f.write(pickle.dumps(value))

    @populate_namespaces
    def get(self, namespace, key):
        filename = self.make_cache_filename(namespace, key)

        if not path.exists(filename):
            return None

        with open(filename, 'rb') as f:
            pickle_data = f.read()

        data = pickle.loads(pickle_data)
        self.log('debug', 'read {0}/{1}=({2}, {3})'.format(
            namespace, key, type(data), _trim(data),
        ))
        return data

    def bust(self):
        self.log('warning', 'busting the cache!')

        for namespace in self.namespaces:
            self.log('debug', 'delete namespace {0}'.format(namespace))
            rmtree(self.make_cache_dirname(namespace))

    # Get/set shortcuts
    #

    def set_uid_validity(self, uid_validity):
        self.set('meta', 'uid_validity', uid_validity)

    def get_uid_validity(self):
        return self.get('meta', 'uid_validity')

    def set_uids(self, uids):
        return self.set('meta', 'uids', uids)

    def get_uids(self):
        return self.get('meta', 'uids')

    def set_headers(self, uid, headers):
        return self.set('headers', uid, headers)

    def get_headers(self, uid):
        return self.get('headers', uid)

    def delete_headers(self, uid):
        return self.delete('headers', uid)

    def get_parts(self, uid):
        return self.get('headers', uid)['parts']
