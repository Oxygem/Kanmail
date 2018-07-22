import pickle

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


class FolderCache(object):
    def __init__(self, folder):
        self.folder = folder

        name = '{0}-{1}'.format(
            self.folder.account.name,
            self.folder.name,
        )

        self.name = name
        self.make_cache_dir('headers')

    def make_cache_dir(self, cache_type):
        cache_dir = self.make_cache_dirname(cache_type)

        with MAKE_DIRS:
            if not path.exists(cache_dir):
                makedirs(cache_dir)

        logger.debug('Starting cache in directory: {0}'.format(cache_dir))

    def make_cache_dirname(self, cache_type):
        return path.join(
            SETTINGS_DIR, 'cache', cache_type,
            _hash_key(self.name),
        )

    def make_cache_filename(self, cache_type, uid):
        cache_dir = self.make_cache_dirname(cache_type)
        uid = _hash_key(_make_uid_key(uid))
        return path.join(cache_dir, uid)

    def set_uid_validity(self, uid_validity):
        self.set_headers('_uid_validity', uid_validity)
        logger.debug('[Cache/{0}] Set cache validity to: {1}'.format(self.name, uid_validity))

    def get_uid_validity(self):
        '''
        Get the UID validity currently stored for this cache.
        '''

        return self.get_headers('_uid_validity')

    def bust(self):
        '''
        Bust the cache by dropping all the JSON docs within it.
        '''

        logger.warning('[Cache/{0}] Busting cache'.format(self.name))

        rmtree(self.make_cache_dirname('headers'))
        self.make_cache_dir('headers')

    def delete_headers(self, uid):
        filename = self.make_cache_filename('headers', uid)
        remove(filename)

    def set_headers(self, uid, headers):
        filename = self.make_cache_filename('headers', uid)

        logger.debug('[Cache/{0}] Setting headers for: {1}'.format(self.name, uid))

        with open(filename, 'wb') as f:
            f.write(pickle.dumps(headers))

    def get_headers(self, uid):
        filename = self.make_cache_filename('headers', uid)

        if not path.exists(filename):
            return None

        with open(filename, 'rb') as f:
            return pickle.loads(f.read())

    def get_parts(self, uid):
        return self.get_headers(uid)['parts']
