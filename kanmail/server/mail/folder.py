from contextlib import contextmanager
from datetime import date, timedelta

from imapclient.exceptions import IMAPClientError

from kanmail.log import logger
from kanmail.server.util import lock_class_method
from kanmail.settings import get_system_setting

from .connection import ImapConnectionError
from .fixes import fix_email_uids, fix_missing_uids
from .folder_cache import FolderCache
from .util import decode_string, make_email_headers, parse_bodystructure

SEEN_FLAG = b'\\Seen'


class Folder(object):
    '''
    Object representing a IMAP folder/mailbox. Once initilised this will keep
    an in-memory cache of the email IDs in the folder.

    The object also keeps track of which emails have been fetched via the API,
    such that subsequent calls paginate without the frontend having to know the
    from of each individual account. This is important because the frontend
    fetches for each folder not account, and doesn't want to keep a scroll
    position for each account/folder combination.
    '''

    # Whether this folder exists on the server
    exists = None

    def __init__(self, name, alias_name, account, query=None):
        self.name = name
        self.alias_name = alias_name
        self.account = account

        self.query = query

        # If we're a query folder - use the non query folder for caching message
        # headers/structs/parts, so we don't duplicate the same data.
        if query:
            base_folder = account.get_folder(name)
            self.cache = base_folder.cache
        else:
            self.cache = FolderCache(self)

        # If we don't exist, our UID list is empty
        self.email_uids = set()
        # Set of UIDs we've "seen" - ie ones not to return again
        self.seen_email_uids = set()

        if self.check_exists():
            try:
                self.get_and_set_email_uids()
            except (ImapConnectionError, IMAPClientError):
                pass

    def check_exists(self):
        '''
        Check whether this folder exists on the server.
        '''

        with self.account.get_imap_connection() as connection:
            exists = connection.folder_exists(self.name)

        self.exists = exists
        return exists

    def __len__(self):
        if self.exists:
            return len(self.email_uids)
        return 0

    def log(self, method, message):
        func = getattr(logger, method)
        func(f'[Folder: {self.account.name}/{self.name}]: {message}')

    @contextmanager
    def get_connection(self):
        '''
        Shortcut to getting a connection and selecting our folder with it.
        '''

        with self.account.get_imap_connection(selected_folder=self.name) as connection:
            yield connection

    def add_cache_flags(self, uid, new_flag):
        headers = self.cache.get_headers(uid)

        if headers and new_flag not in headers['flags']:
            flags = list(headers['flags'])
            flags.append(new_flag)
            headers['flags'] = tuple(flags)
            self.cache.set_headers(uid, headers)

    def remove_cache_flags(self, uid, remove_flag):
        headers = self.cache.get_headers(uid)

        if headers and remove_flag in headers['flags']:
            flags = list(headers['flags'])
            flags.remove(remove_flag)
            headers['flags'] = tuple(flags)
            self.cache.set_headers(uid, headers)

    def get_email_parts(self, email_uids, part, retry=0):
        '''
        Fetch actual email body parts, where the part is the same for each email.
        '''

        self.log('debug', f'Fetching {len(email_uids)} message parts ({part})')

        body_keyname = f'BODY[{part}]'

        with self.get_connection() as connection:
            email_parts = connection.fetch(email_uids, [body_keyname])

        # Fix any dodgy UIDs
        email_parts = fix_email_uids(email_uids, email_parts)

        self.log('debug', f'Fetched {len(email_uids)} email parts ({part})')

        emails = {}
        failed_email_uids = []
        body_keyname = body_keyname.encode()  # returned as bytes via IMAP

        for uid, data in email_parts.items():
            parts = self.get_email_header_parts(uid)
            data_meta = parts.get(part)

            if not data_meta:
                raise Exception('MISSING PART', uid, part, parts)

            if body_keyname not in data:
                if retry > connection.config.max_attempts:
                    raise Exception(f'Missing data for UID/part {uid}/{part}')

                failed_email_uids.append(uid)
                continue

            data = data[body_keyname]
            data = decode_string(data, data_meta)

            emails[uid] = data

            self.add_cache_flags(uid, SEEN_FLAG)

        if failed_email_uids:
            self.log(
                'warning',
                f'Missing {len(failed_email_uids)} parts (part={part}, retry={retry})',
            )
            emails.update(self.get_email_parts(
                failed_email_uids, part,
                retry=retry + 1,
            ))
        return emails

    def get_email_headers(self, email_uids):
        '''
        Fetch email headers/meta information (to display in a folder list).
        '''

        emails = []

        # First get/remove any cached headers before fetching
        uids_to_get = []
        uid_to_cached_headers = self.cache.batch_get_headers(email_uids)

        for uid in email_uids:
            cached_headers = uid_to_cached_headers.get(uid)
            if cached_headers:
                emails.append(cached_headers)
            else:
                uids_to_get.append(uid)

        self.log(
            'debug',
            f'Fetching {len(uids_to_get)} message headers (+{len(emails)} from cached)',
        )

        if not uids_to_get:
            return emails

        with self.get_connection() as connection:
            email_headers = connection.fetch(
                uids_to_get,
                [
                    'FLAGS',
                    'ENVELOPE',
                    'RFC822.SIZE',
                    'BODYSTRUCTURE',
                    # Best-effort excerpt
                    'BODY.PEEK[1]<0.1024>',
                    # References header for threading
                    # TODO: remove the peek from here?
                    'BODY.PEEK[HEADER.FIELDS (REFERENCES CONTENT-TRANSFER-ENCODING)]',
                ],
            )

        # Fix any dodgy UIDs
        email_headers = fix_email_uids(uids_to_get, email_headers)
        uid_to_headers = {}

        for uid, data in email_headers.items():
            parts = parse_bodystructure(data[b'BODYSTRUCTURE'])
            headers = make_email_headers(
                self.account, self, uid, data, parts,
                save_contacts=self.alias_name not in ('spam', 'trash'),
            )
            emails.append(headers)
            uid_to_headers[uid] = headers

        self.cache.batch_set_headers(uid_to_headers)

        return emails

    def check_update_unread_emails(self, email_uids):
        self.log(
            'debug',
            f'Fetching flags for {len(email_uids)} emails',
        )

        with self.get_connection() as connection:
            email_flags = connection.fetch(email_uids, ['FLAGS'])

        read_uids = []
        for uid, data in email_flags.items():
            # For any seen emails, update cache and add to the list
            if SEEN_FLAG in data[b'FLAGS']:
                read_uids.append(uid)
                self.add_cache_flags(uid, SEEN_FLAG)

        return read_uids

    def get_email_header_parts(self, uid):
        emails = self.get_email_headers([uid])
        if not emails:
            return
        return emails[0]['parts']

    # UID handling
    #

    def cache_uids(self):
        # If we're a query folder don't save the UIDs as we use the base, non-query
        # cache object to share header/part cache, but the UID lists differ.
        if not self.query:
            self.cache.set_uids(self.email_uids)

    def get_email_uids(self, use_cache=True):
        # If we're not a query folder we can try for cached UIDs
        if use_cache and not self.query:
            cached_uids = self.cache.get_uids()
            if cached_uids:
                self.log(
                    'debug',
                    f'Loaded {len(cached_uids)} cached message IDs',
                )
                return cached_uids

        # Searching
        if isinstance(self.query, (bytes, str)):
            # Use Gmails X-GM-RAW search extension if available - supports full
            # Gmail style search queries.
            if b'X-GM-EXT-1' in self.account.get_capabilities():
                search_query = ['X-GM-RAW', self.query]
            else:
                # IMAP uses polish notation (operator on the left)
                search_query = ['OR', 'SUBJECT', self.query, 'BODY', self.query]

        # Syncing
        else:
            sync_days = get_system_setting('sync_days')
            if sync_days and sync_days > 0:
                days_ago = date.today() - timedelta(days=sync_days)
                search_query = ['SINCE', days_ago]
            else:
                search_query = ['ALL']

        self.log('debug', 'Fetching message IDs')

        with self.get_connection() as connection:
            message_uids = connection.search(search_query)

        self.log('debug', f'Fetched {len(message_uids)} message UIDs')

        uids = set(message_uids)
        return uids

    def check_cache_validity(self):
        '''
        Checks if our cached UID validity matches the server.
        '''

        # Note we don't use self.get_connection because we don't want to actually
        # *select* the folder.
        with self.account.get_imap_connection() as connection:
            status = connection.folder_status(self.name, [b'UIDVALIDITY'])

        uid_validity = status[b'UIDVALIDITY']
        cache_validity = self.cache.get_uid_validity()

        if uid_validity != cache_validity:
            if cache_validity:
                self.log('warning', (
                    'Found invalid UIDVALIDITY '
                    f'(local={cache_validity}, remote={uid_validity})',
                ))
                self.cache.bust()
            self.cache.set_uid_validity(uid_validity)
            return False
        return True

    # Bits that fiddle with self.email_uids & self.seen_email_uids
    #

    @lock_class_method
    def get_and_set_email_uids(self):
        self.email_uids = self.get_email_uids()

    @lock_class_method
    def sync_emails(self, expected_uid_count=None, check_unread_uids=None):
        '''
        Get new and deleted emails for this folder.
        '''

        # If we don't exist, try again or we have nothing
        if not self.exists:
            if not self.check_exists():
                return [], [], []

        message_uids = self.get_email_uids(use_cache=False)

        # Check the folder UIDVALIDITY (busts the cache if needed)
        uids_valid = self.check_cache_validity()
        uids_changed = False

        if uids_valid:
            # Remove existing from new to get anything new
            new_message_uids = message_uids - self.email_uids
            # Remove new from existing to get deleted
            deleted_message_uids = self.email_uids - message_uids

            uids_changed = (
                len(new_message_uids) > 0
                or len(deleted_message_uids) > 0
            )
        else:
            uids_changed = True

            # All old uids invalid, so set all old to deleted
            deleted_message_uids = self.email_uids

            batch_size = get_system_setting('batch_size')
            sorted_message_uids = sorted(message_uids, reverse=True)
            new_message_uids = sorted_message_uids[:batch_size]

        self.email_uids = message_uids

        if uids_changed:
            self.cache_uids()

        for uid in deleted_message_uids:
            self.cache.delete_headers(uid)

        if expected_uid_count:
            new_message_uids = fix_missing_uids(
                expected_uid_count, new_message_uids,
            )

        self.log('debug', (
            f'Fetched {len(new_message_uids)} new'
            f'/{len(deleted_message_uids)} deleted message IDs'
        ))

        new_emails = {}

        if new_message_uids:
            # Now actually fetch & return those emails
            new_emails = self.get_email_headers(new_message_uids)
            self.seen_email_uids.update(new_message_uids)

        read_uids = []
        if check_unread_uids:
            check_unread_uids = [  # remove any deleted UIDs
                uid for uid in check_unread_uids
                if uid in message_uids
            ]
            read_uids = self.check_update_unread_emails(check_unread_uids)

        # Return the enw emails & any deleted uids
        return new_emails, list(deleted_message_uids), read_uids

    @lock_class_method
    def get_emails(self, reset=False, batch_size=None):
        '''
        Get slices of emails from our email list, fetching more if needed.
        '''

        # If we don't exist, we have nothing
        if not self.exists:
            return []

        if reset:
            self.log('debug', 'Resetting folder')
            self.seen_email_uids = set()

        if not batch_size:
            batch_size = get_system_setting('batch_size')

        unseen_email_uids = self.email_uids - self.seen_email_uids
        sorted_unseen_email_uids = sorted(unseen_email_uids, reverse=True)

        # Select the slice of UIDs
        email_uids = sorted_unseen_email_uids[:batch_size]

        # Nothing to fetch? Shortcut!
        if not email_uids:
            return []

        # Actually fetch the emails
        emails = self.get_email_headers(email_uids)
        self.seen_email_uids.update(email_uids)

        return emails

    # Functions that affect emails, but not any of the class internals
    #

    def append_email_message(self, email_message):
        with self.account.get_imap_connection() as connection:
            connection.append(self.name, email_message, flags=(SEEN_FLAG,))

    def move_emails(self, email_uids, new_folder):
        '''
        Move (copy + delete) emails (by UID) from this folder to another.

        Note this method does not update the internal UID list, this is to be
        handled by the `sync_emails` method.
        '''

        # Ensure the new folder exists and update any alias
        new_folder = self.account.ensure_folder_exists(new_folder)

        self.log(
            'debug',
            f'Moving {len(email_uids)} ({email_uids}) emails to -> {new_folder}',
        )

        with self.get_connection() as connection:
            connection.copy(email_uids, new_folder)
            connection.delete_messages(email_uids)

    def copy_emails(self, email_uids, new_folder):
        '''
        Copy emails (by UID) from this folder to another.
        '''

        # Ensure the new folder exists and update any alias
        new_folder = self.account.ensure_folder_exists(new_folder)

        self.log(
            'debug',
            f'Copying {len(email_uids)} ({email_uids}) emails to -> {new_folder}',
        )

        with self.get_connection() as connection:
            connection.copy(email_uids, new_folder)

    def star_emails(self, email_uids):
        '''
        Star/flag emails (by UID) in this folder.
        '''

        self.log('debug', f'Starring {len(email_uids)} ({email_uids}) emails')

        with self.get_connection() as connection:
            connection.add_flags(email_uids, [b'\\Flagged'])

        for uid in email_uids:
            self.add_cache_flags(uid, b'\\Flagged')

    def unstar_emails(self, email_uids):
        '''
        Unstar/unflag emails (by UID) in this folder.
        '''

        self.log('debug', f'Unstarring {len(email_uids)} ({email_uids}) emails')

        with self.get_connection() as connection:
            connection.remove_flags(email_uids, [b'\\Flagged'])

        for uid in email_uids:
            self.remove_cache_flags(uid, b'\\Flagged')
