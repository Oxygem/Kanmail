from functools import wraps
from pickle import dumps as pickle_dumps, loads as pickle_loads

from sqlalchemy.orm.exc import NoResultFound

from kanmail.log import logger
from kanmail.server.app import db
from kanmail.server.util import lock_class_method
from kanmail.settings import get_settings
from kanmail.settings.constants import CACHE_ENABLED


def execute_if_enabled(func):
    @wraps(func)
    def decorator(*args, **kwargs):
        if CACHE_ENABLED:
            return func(*args, **kwargs)

    return decorator


# Database models
# Folder -> Folderheader -> FolderHeaderPart
#


class FolderCacheItem(db.Model):
    """
    Store folder UID list and validity.
    """

    __bind_key__ = "folders"
    __tablename__ = "folder_cache_item"
    __table_args__ = (db.UniqueConstraint("account_name", "folder_name"),)

    id = db.Column(db.Integer, primary_key=True)

    account_name = db.Column(db.String(300), nullable=False)
    folder_name = db.Column(db.String(300), nullable=False)

    uid_validity = db.Column(db.String(300))
    uids = db.Column(db.Text)

    def __str__(self):
        return f"{self.account_name}/{self.folder_name}"


class FolderHeaderCacheItem(db.Model):
    """
    Email header data, attached to the relevant folder.
    """

    __bind_key__ = "folders"
    __tablename__ = "folder_header_cache_item"
    __table_args__ = (db.UniqueConstraint("uid", "folder_id"),)

    id = db.Column(db.Integer, primary_key=True)

    uid = db.Column(db.Integer, nullable=False, index=True)
    data = db.Column(db.Text, nullable=False)

    folder_id = db.Column(
        db.Integer,
        db.ForeignKey("folder_cache_item.id", ondelete="CASCADE"),
        nullable=False,
    )
    folder = db.relationship("FolderCacheItem")

    def __str__(self):
        return f"{self.folder}/{self.uid}"


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


def _make_account_key(settings):
    imap_settings = settings["imap_connection"]
    return f'{imap_settings["username"]}@{imap_settings["host"]}'


def remove_stale_folders():
    settings = get_settings()
    accounts = settings["accounts"]
    account_names = set()
    for account in accounts:
        account_names.add(_make_account_key(account))

    deleted = 0
    all_folders = FolderCacheItem.query.all()

    for folder in all_folders:
        if folder.account_name not in account_names:
            logger.info(f"Deleting stale cache folder: {folder}")
            delete_cache_items(folder)
            deleted += 1

    logger.info(f"Deleted {deleted}/{len(all_folders)} cache folders")


def remove_stale_headers():
    folder_id_to_uids = {}

    for folder in FolderCacheItem.query.all():
        if folder.uids:
            folder_id_to_uids[folder.id] = pickle_loads(folder.uids)

    all_headers = FolderHeaderCacheItem.query.all()
    headers_to_delete = []

    for header in all_headers:
        if header.uid not in folder_id_to_uids.get(header.folder_id, set()):
            logger.info(f"Deleting stale cache header: {header}")
            headers_to_delete.append(header)

    if headers_to_delete:
        delete_cache_items(*headers_to_delete)

    logger.info(f"Deleted {len(headers_to_delete)}/{len(all_headers)} cache headers")


def vacuum_folder_cache():
    with db.get_engine(bind="folders").begin() as conn:
        conn.execute("VACUUM")

    logger.info("Folder cache DB vacuumed")


@execute_if_enabled
def bust_all_caches():
    logger.warning("Busting all cache items!")
    FolderCacheItem.query.delete()
    db.session.commit()


def save_cache_items(*items):
    for item in items:
        db.session.add(item)
    db.session.commit()


def delete_cache_items(*items):
    for item in items:
        db.session.delete(item)
    db.session.commit()


class FolderCache(object):
    def __init__(self, folder):
        self.folder = folder
        self.name = f"{self.folder.account.name}/{self.folder.name}"

        # Use user@host for the cache key, so we invalidate when accounts are changed
        # TODO: cache cleanup
        self.cache_key = _make_account_key(self.folder.account.settings)

    def __str__(self):
        return f"FolderCache({self.name})"

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
        func(f"[{self}]: {message}")

    @execute_if_enabled
    def bust(self):
        self.log("warning", "busting the cache!")
        delete_cache_items(self.get_folder_cache_item())

    # Single operations
    #

    def set_uid_validity(self, uid_validity):
        self.log("debug", f"Save UID validity: {uid_validity}")
        folder_cache_item = self.get_folder_cache_item()
        folder_cache_item.uid_validity = uid_validity
        save_cache_items(folder_cache_item)

    def get_uid_validity(self):
        uid_validity = self.get_folder_cache_item().uid_validity
        if uid_validity:
            return int(uid_validity)

    def set_uids(self, uids):
        self.log("debug", f"Saving {len(uids)} UIDs")
        folder_cache_item = self.get_folder_cache_item()
        folder_cache_item.uids = pickle_dumps(uids)
        save_cache_items(folder_cache_item)

    def get_uids(self):
        uids = self.get_folder_cache_item().uids
        if uids:
            return pickle_loads(uids)

    @execute_if_enabled
    def set_headers(self, uid, headers):
        self.log("debug", f"Set headers for UID {uid}: {headers}")

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

    @execute_if_enabled
    def get_header_cache_item(self, uid):
        try:
            return FolderHeaderCacheItem.query.filter_by(
                folder_id=self.get_folder_cache_item().id,
                uid=uid,
            ).one()
        except NoResultFound:
            pass

    @execute_if_enabled
    def delete_headers(self, uid):
        headers = self.get_header_cache_item(uid)
        if headers:
            delete_cache_items(headers)

    @execute_if_enabled
    def get_headers(self, uid):
        headers = self.get_header_cache_item(uid)
        if headers:
            return pickle_loads(headers.data)

    @execute_if_enabled
    def get_parts(self, uid):
        headers = self.get_headers(uid)
        if headers:
            return headers["parts"]

    # Batch operations
    #

    def batch_get_header_items(self, uids):
        if not CACHE_ENABLED:
            return {}

        matched_headers = FolderHeaderCacheItem.query.filter_by(
            folder_id=self.get_folder_cache_item().id
        ).filter(FolderHeaderCacheItem.uid.in_(uids))

        return {header.uid: header for header in matched_headers}

    def batch_get_headers(self, uids):
        if not CACHE_ENABLED:
            return {}

        self.log("debug", f"Batch get {len(uids)} headers")

        return {
            uid: pickle_loads(header.data)
            for uid, header in self.batch_get_header_items(uids).items()
        }

    @execute_if_enabled
    def batch_set_headers(self, uid_to_headers):
        self.log("debug", f"Batch set {len(uid_to_headers)} headers")

        existing_headers = self.batch_get_header_items(uid_to_headers.keys())
        items_to_save = []

        for uid, headers in uid_to_headers.items():
            headers_data = pickle_dumps(headers)

            existing_header = existing_headers.get(uid)
            if existing_header:
                existing_header.data = headers_data
                items_to_save.append(existing_header)
            else:
                items_to_save.append(
                    FolderHeaderCacheItem(
                        folder_id=self.get_folder_cache_item().id,
                        uid=uid,
                        data=headers_data,
                    )
                )

        save_cache_items(*items_to_save)
