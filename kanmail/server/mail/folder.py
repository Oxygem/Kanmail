from contextlib import contextmanager
from copy import copy

import six

from kanmail.log import logger
from kanmail.server.util import lock_class_method
from kanmail.settings import get_settings

from .fixes import fix_email_uids, fix_missing_uids
from .folder_cache import FolderCache
from .util import decode_string, make_email_headers, parse_bodystructure


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

    # List of email UIDs in this folder
    email_uids = None

    # Whether this folder exists on the server
    exists = True

    # Index of the current view for this folder - as we request more emails
    # this is increased.
    offset = 0

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

        # Fetch email UIDs (cached if possible)
        self.email_uids = self.get_email_uids()

    def __len__(self):
        return len(self.email_uids)

    def log(self, method, message):
        func = getattr(logger, method)
        func('[Account: {0}/{1}]: {2}'.format(
            self.account.name, self.name, message,
        ))

    @contextmanager
    def get_connection(self):
        '''
        Shortcut to getting a connection and selecting our folder with it.
        '''

        with self.account.get_connection() as connection:
            connection.select_folder(self.name)
            yield connection

    def check_cache_validity(self):
        with self.account.get_connection() as connection:
            status = connection.folder_status(self.name, [b'UIDVALIDITY'])

        uid_validity = status[b'UIDVALIDITY']
        cache_validity = self.cache.get_uid_validity()

        # TODO: this needs to be handled in the frontend somehow (since it's
        # extremely rare just force a "click here to reload).
        if uid_validity != cache_validity:
            self.cache.bust()
            self.cache.set_uid_validity(uid_validity)
            return False
        return True

    def add_cache_flags(self, uid, new_flag):
        headers = self.cache.get_headers(uid)

        if new_flag not in headers['flags']:
            flags = list(headers['flags'])
            flags.append(new_flag)
            headers['flags'] = tuple(flags)
            self.cache.set_headers(uid, headers)

    def remove_cache_flags(self, uid, remove_flag):
        headers = self.cache.get_headers(uid)

        if remove_flag in headers['flags']:
            flags = list(headers['flags'])
            flags.remove(remove_flag)
            headers['flags'] = tuple(flags)
            self.cache.set_headers(uid, headers)

    def get_email_parts(self, email_uids, part):
        '''
        Fetch actual email body parts, where the part is the same for each email.
        '''

        self.log('debug', 'Fetching {0} message parts ({1})'.format(
            len(email_uids), part,
        ))

        body_keyname = 'BODY[{0}]'.format(part)

        # Fetch the email headers/details
        with self.get_connection() as connection:
            # Fetch the emails from the folder
            email_parts = connection.fetch(
                email_uids,
                [body_keyname],
            )

        # Fix any dodgy UIDs
        email_parts = fix_email_uids(email_uids, email_parts)

        self.log('debug', 'Fetched {0} email parts ({1})'.format(
            len(email_uids), part,
        ))

        emails = {}

        for uid, data in email_parts.items():
            headers = self.cache.get_headers(uid)
            parts = headers['parts']

            data_meta = parts.get(part)

            if not data_meta:
                raise Exception('MISSING PART', uid, part, parts)

            data = decode_string(
                # Data comes back with bytes keys, so encode our str => bytes
                data[body_keyname.encode()],
                data_meta,
            )

            emails[uid] = data

            self.add_cache_flags(uid, b'\\Seen')

        return emails

    def get_email_headers(self, email_uids):
        '''
        Fetch email headers/meta information (to display in a folder list).
        '''

        emails = []

        # First get/remove any cached headers before fetching
        got_email_uids = []

        for uid in email_uids:
            cached_headers = self.cache.get_headers(uid)
            if cached_headers:
                got_email_uids.append(uid)
                emails.append(cached_headers)

        for uid in got_email_uids:
            email_uids.remove(uid)

        self.log('debug', 'Fetching {0} messages (+{1} from cached)'.format(
            len(email_uids), len(emails),
        ))

        if not email_uids:
            return emails

        # Fetch the email headers/details
        with self.get_connection() as connection:
            # Fetch the emails from the folder
            email_headers = connection.fetch(
                email_uids,
                [
                    'FLAGS',
                    'ENVELOPE',
                    'RFC822.SIZE',
                    'BODYSTRUCTURE',
                    # Best-effort excerpt
                    'BODY.PEEK[1]<0.500>',
                    # References header for threading
                    # TODO: remove the peek from here?
                    'BODY.PEEK[HEADER.FIELDS (REFERENCES CONTENT-TRANSFER-ENCODING)]',
                ],
            )

        # Fix any dodgy UIDs
        email_headers = fix_email_uids(email_uids, email_headers)

        for uid, data in email_headers.items():
            parts = parse_bodystructure(data[b'BODYSTRUCTURE'])
            headers = make_email_headers(self.account, self, uid, data, parts)

            self.cache.set_headers(uid, headers)
            emails.append(headers)

        return emails

    def get_email_uids(self, use_cache=True):
        # If we're not a query folder we can try for cached UIDs
        if use_cache and not self.query:
            cached_uids = self.cache.get_uids()
            if cached_uids:
                self.log(
                    'debug',
                    'Loaded {0} cached message IDs'.format(len(cached_uids)),
                )
                return cached_uids

        search_query = ['ALL']

        if isinstance(self.query, six.string_types):
            search_query = ['SUBJECT', self.query]

        self.log('debug', 'Fetching message IDs')

        with self.get_connection() as connection:
            message_uids = connection.search(search_query)

        self.log('debug', 'Fetched {0} message UIDs'.format(len(message_uids)))

        uids = set(message_uids)
        self.cache.set_uids(uids)
        return uids

    # Bits that fiddle with self.email_uids
    #

    def fix_offset_before_removing_uids(self, uids):
        if not self.email_uids or self.offset >= len(self.email_uids):
            return

        sorted_email_uids = sorted(self.email_uids, reverse=True)

        # Figure out the number of email UIDs we're removing *before* the offset,
        # so we can reduce the offset accordingly (so we don't jump).
        offset_email_uid = sorted_email_uids[self.offset]
        uids_lower_than_offset = len([
            uid for uid in uids
            if uid < offset_email_uid
        ])

        self.offset -= uids_lower_than_offset

    @lock_class_method
    def sync_emails(self, expected_uids=None):
        '''
        Get new emails for this folder and prepend them to our internal email
        list. Once this is done the function increases ``self.offset`` by
        the number of new emails, meaning we don't jump back when ``get_emails``.
        '''

        # If we don't exist, we have nothing
        if not self.exists:
            return [], []

        message_uids = self.get_email_uids(use_cache=False)

        # Check the folder UIDVALIDITY (busts the cache if needed)
        uids_valid = self.check_cache_validity()

        if uids_valid:
            # Remove existing from new to get anything new
            new_message_uids = message_uids - self.email_uids
            # Remove new from existing to get deleted
            deleted_message_uids = self.email_uids - message_uids
            self.fix_offset_before_removing_uids(deleted_message_uids)
        else:
            # All old uids invalid, so set all new and all old deleted
            new_message_uids = message_uids
            deleted_message_uids = self.email_uids

        self.email_uids = message_uids

        for uid in deleted_message_uids:
            self.cache.delete_headers(uid)

        if expected_uids:
            new_message_uids = fix_missing_uids(
                expected_uids, new_message_uids,
            )

        self.log('debug', 'Fetched {0} new/{1} deleted message IDs'.format(
            len(new_message_uids), len(deleted_message_uids),
        ))

        new_emails = {}

        if new_message_uids:
            # Now actually fetch & return those emails
            new_emails = self.get_email_headers(new_message_uids)

        # Return the enw emails & any deleted uids
        return new_emails, list(deleted_message_uids)

    @lock_class_method
    def get_emails(self, reset=False, batch_size=None):
        '''
        Get slices of emails from our email list, fetching more if needed.

        Once the emails are selected this function increases ``self.offset``
        by the # of emails selected, which will then offset the start of the
        next call to this function. This means repeated calls to the function
        will iterate through the folders email, in descending order (newest
        first).
        '''

        # If we don't exist, we have nothing
        if not self.exists:
            return [], 0, 0

        if reset:
            self.log('debug', 'Resetting folder (offset=0)')
            self.offset = 0

        if not batch_size:
            batch_size = get_settings()['system']['batch_size']

        sorted_email_uids = sorted(self.email_uids, reverse=True)

        # Select the slice of UIDs
        index = self.offset
        email_uids = sorted_email_uids[index:index + batch_size]

        # Nothing to fetch? Shortcut!
        if not email_uids:
            return [], self.offset, self.offset

        # Actually fetch the emails
        emails = self.get_email_headers(email_uids)

        # Store the old offset as we need to return it
        offset = copy(self.offset)

        # Move the index along by the # fetched
        self.offset += len(emails)

        return emails, offset, self.offset

    @lock_class_method
    def delete_emails(self, email_uids):
        '''
        Flag emails as deleted within this folder.
        '''

        self.log('debug', 'Deleting {0} ({1}) emails'.format(
            len(email_uids), email_uids,
        ))

        with self.get_connection() as connection:
            connection.delete_messages(email_uids)

        self.fix_offset_before_removing_uids(email_uids)

        for uid in email_uids:
            self.email_uids.remove(uid)
            self.cache.delete_headers(uid)

    @lock_class_method
    def move_emails(self, email_uids, new_folder):
        '''
        Move (copy + delete) emails (by UID) from this folder to another.
        '''

        # Ensure the new folder exists and update any alias
        new_folder = self.account.ensure_folder_exists(new_folder)

        self.log('debug', 'Moving {0} ({1}) emails to -> {2}'.format(
            len(email_uids), email_uids, new_folder,
        ))

        with self.get_connection() as connection:
            connection.copy(email_uids, new_folder)
            connection.delete_messages(email_uids)

        self.fix_offset_before_removing_uids(email_uids)

        for uid in email_uids:
            self.email_uids.remove(uid)
            self.cache.delete_headers(uid)

    # Functions that affect emails, but not any of the class internals
    #

    def copy_emails(self, email_uids, new_folder):
        '''
        Copy emails (by UID) from this folder to another.
        '''

        # Ensure the new folder exists and update any alias
        new_folder = self.account.ensure_folder_exists(new_folder)

        self.log('debug', 'Copying {0} ({1}) emails to -> {2}'.format(
            len(email_uids), email_uids, new_folder,
        ))

        with self.get_connection() as connection:
            connection.copy(email_uids, new_folder)

    def star_emails(self, email_uids):
        '''
        Star/flag emails (by UID) in this folder.
        '''

        self.log('debug', 'Starring {0} ({1}) emails'.format(
            len(email_uids), email_uids,
        ))

        with self.get_connection() as connection:
            connection.add_flags(email_uids, [b'\\Flagged'])

        for uid in email_uids:
            self.add_cache_flags(uid, b'\\Flagged')

    def unstar_emails(self, email_uids):
        '''
        Unstar/unflag emails (by UID) in this folder.
        '''

        self.log('debug', 'Unstarring {0} ({1}) emails'.format(
            len(email_uids), email_uids,
        ))

        with self.get_connection() as connection:
            connection.remove_flags(email_uids, [b'\\Flagged'])

        for uid in email_uids:
            self.remove_cache_flags(uid, b'\\Flagged')
