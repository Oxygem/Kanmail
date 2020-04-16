from pickle import (
    dumps as pickle_dumps,
    loads as pickle_loads,
)

from sqlalchemy.orm.exc import NoResultFound

from kanmail.log import logger
from kanmail.server.app import db
from kanmail.server.util import lock_class_method
from kanmail.settings.constants import CACHE_ENABLED


# Database models
# Folder -> Folderheader -> FolderHeaderPart
#

class FolderCacheItem(db.Model):
    '''
    Store folder UID list and validity.
    '''

    __bind_key__ = 'folders'
    __tablename__ = 'folder_cache_item'
    __table_args__ = (
        db.UniqueConstraint('account_name', 'folder_name'),
    )

    id = db.Column(db.Integer, primary_key=True)

    account_name = db.Column(db.String(300), nullable=False)
    folder_name = db.Column(db.String(300), nullable=False)

    uid_validity = db.Column(db.String(300))
    uids = db.Column(db.Text)


class FolderHeaderCacheItem(db.Model):
    '''
    Email header data, attached to the relevant folder.
    '''

    __bind_key__ = 'folders'
    __tablename__ = 'folder_header_cache_item'
    __table_args__ = (
        db.UniqueConstraint('uid', 'folder_id'),
    )

    id = db.Column(db.Integer, primary_key=True)

    uid = db.Column(db.Integer, nullable=False, index=True)
    data = db.Column(db.Text, nullable=False)

    folder_id = db.Column(
        db.Integer,
        db.ForeignKey('folder_cache_item.id', ondelete='CASCADE'),
        nullable=False,
    )


# class FolderHeaderPartCacheItem(db.Model):
#     '''
#     Email part (data) cache items, attached to the relevant email header.
#     '''

#     __bind_key__ = 'folders'
#     __tablename__ = 'folder_header_part_cache_item'
#     __table_args__ = (
#         db.UniqueConstraint('part_number', 'header_uid'),
#     )

#     id = db.Column(db.Integer, primary_key=True)

#     part_number = db.Column(db.Integer, nullable=False)
#     data = db.Column(db.Text, nullable=False)

#     header_id = db.Column(
#         db.Integer,
#         db.ForeignKey('folder_header_cache_item.id', ondelete='CASCADE'),
#         nullable=False,
#     )


def bust_all_caches():
    if CACHE_ENABLED:
        logger.warning('Busting all cache items!')
        FolderCacheItem.query.delete()
        db.session.commit()


def save_cache_items(*items):
    for item in items:
        db.session.add(item)
    db.session.commit()


def delete_cache_item(*items):
    for item in items:
        db.session.delete(item)
    db.session.commit()


class FolderCache(object):
    def __init__(self, folder):
        self.folder = folder
        self.name = f'{self.folder.account.name}/{self.folder.name}'

        # Use user@host for the cache key, so we invalidate when accounts are changed
        # TODO: cache cleanup
        imap_settings = self.folder.account.settings['imap_connection']
        self.cache_key = f'{imap_settings["username"]}@{imap_settings["host"]}'

    @lock_class_method
    def get_folder_cache_item(self):
        try:
            folder_cache_item = FolderCacheItem.query.filter_by(
                account_name=self.cache_key,
                folder_name=self.folder.name,
            ).one()
        except NoResultFound:
            folder_cache_item = FolderCacheItem(
                account_name=self.cache_key,
                folder_name=self.folder.name,
            )
            save_cache_items(folder_cache_item)

        return folder_cache_item

    def log(self, method, message):
        func = getattr(logger, method)
        func(f'[Folder cache: {self.name}]: {message}')

    def bust(self):
        if not CACHE_ENABLED:
            return

        self.log('warning', 'busting the cache!')
        delete_cache_item(self.get_folder_cache_item())

    # Single operations
    #

    def set_uid_validity(self, uid_validity):
        self.log('debug', f'Save UID validity: {uid_validity}')
        folder_cache_item = self.get_folder_cache_item()
        folder_cache_item.uid_validity = uid_validity
        save_cache_items(folder_cache_item)

    def get_uid_validity(self):
        uid_validity = self.get_folder_cache_item().uid_validity
        if uid_validity:
            return int(uid_validity)

    def set_uids(self, uids):
        self.log('debug', f'Saving {len(uids)} UIDs')
        folder_cache_item = self.get_folder_cache_item()
        folder_cache_item.uids = pickle_dumps(uids)
        save_cache_items(folder_cache_item)

    def get_uids(self):
        uids = self.get_folder_cache_item().uids
        if uids:
            return pickle_loads(uids)

    def set_headers(self, uid, headers):
        self.log('debug', f'Set headers for UID {uid}: {headers}')

        headers_data = pickle_dumps(headers)

        headers = self.get_header_cache_item(uid)
        if headers:
            headers.data = headers_data
        else:
            headers = FolderHeaderCacheItem(
                folder_id=self.get_folder_cache_item().id,
                uid=uid,
                data=headers_data,
            )

        save_cache_items(headers)

    def get_header_cache_item(self, uid):
        try:
            return FolderHeaderCacheItem.query.filter_by(
                folder_id=self.get_folder_cache_item().id,
                uid=uid,
            ).one()
        except NoResultFound:
            pass

    def delete_headers(self, uid):
        headers = self.get_header_cache_item(uid)
        if headers:
            delete_cache_item(headers)

    def get_headers(self, uid):
        headers = self.get_header_cache_item(uid)
        if headers:
            return pickle_loads(headers.data)

    def get_parts(self, uid):
        headers = self.get_headers(uid)
        if headers:
            return headers['parts']

    # Batch operations
    #

    def batch_get_header_items(self, uids):
        matched_headers = (
            FolderHeaderCacheItem.query
            .filter_by(folder_id=self.get_folder_cache_item().id)
            .filter(FolderHeaderCacheItem.uid.in_(uids))
        )

        return {
            header.uid: header
            for header in matched_headers
        }

    def batch_get_headers(self, uids):
        self.log('debug', f'Batch get {len(uids)} headers')

        return {
            uid: pickle_loads(header.data)
            for uid, header in self.batch_get_header_items(uids).items()
        }

    def batch_set_headers(self, uid_to_headers):
        self.log('debug', f'Batch set {len(uid_to_headers)} headers')

        existing_headers = self.batch_get_header_items(uid_to_headers.keys())
        items_to_save = []

        for uid, headers in uid_to_headers.items():
            headers_data = pickle_dumps(headers)

            existing_header = existing_headers.get(uid)
            if existing_header:
                existing_header.data = headers_data
                items_to_save.append(existing_header)
            else:
                items_to_save.append(FolderHeaderCacheItem(
                    folder_id=self.get_folder_cache_item().id,
                    uid=uid,
                    data=headers_data,
                ))

        save_cache_items(*items_to_save)
