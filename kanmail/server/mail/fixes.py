from __future__ import unicode_literals

from kanmail.log import logger

'''
Fixes for IMAP issues (specifically encountered with Gmail, elsewhere untested
currently). Basically: Gmail's IMAP implementation is shit.

This this StackOverflow question: https://stackoverflow.com/questions/46936646
'''


def fix_missing_uids(expected_uid_count, uids):
    '''
    This fixes missing UIDs - when moving multiple emails into a new folder,
    the next search request sometimes returns just the latest UID. Because they
    are sequential we can infer the previous UIDs.

    When passed to fetch these then generally have to be remapped (see below)
    as Gmail will return incorrect UIDs for each message - but the messages
    *are* correct.
    '''

    uid_count = len(uids)

    if uid_count < expected_uid_count:
        diff = expected_uid_count - uid_count
        lowest_uid = min(uids)

        for i in range(diff):
            uids.append(lowest_uid - (i + 1))

        logger.warning(
            f'Corrected {uid_count} missing UIDs {expected_uid_count} -> {uids}',
        )

    return uids


def fix_email_uids(email_uids, emails):
    '''
    After moving emails around in IMAP, Gmail sometimes returns stale/old UIDs
    for messages. This attempts to fix this by re-mapping any invalid returned
    UIDs to the correct UIDs.
    '''

    # First, get the list of returned UIDs
    returned_uids = []
    for uid, data in emails.items():
        returned_uids.append(uid)

    missing_uids = set(email_uids) - set(returned_uids)

    if missing_uids:
        error = ValueError((
            'Incorrect UIDs returned by server, '
            f'requested {len(email_uids)} but got {len(returned_uids)}, '
            f'missing={missing_uids} ({email_uids} - {returned_uids})'
        ))

        # If not the same length, something really went wrong
        if len(returned_uids) != len(email_uids):
            raise error

        # Build map of returned UID -> correct UID
        corrected_uid_map = {}

        # First pass - pull out any that exist in our wanted and returned
        for uid in email_uids:
            if uid in returned_uids:
                corrected_uid_map[uid] = uid
                email_uids.remove(uid)
                returned_uids.remove(uid)

        # Second pass - map any remaining ones in order
        email_uids = sorted(email_uids)
        returned_uids = sorted(returned_uids)

        for i, uid in enumerate(email_uids):
            corrected_uid_map[returned_uids[i]] = uid

        logger.warning(f'Corrected broken server UIDs: {corrected_uid_map}')

        # Overwrite our returned UID -> email map with our corrected UIDs
        emails = {
            corrected_uid_map[uid]: email
            for uid, email in emails.items()
        }

    return emails
