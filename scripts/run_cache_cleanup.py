#!/usr/bin/env python

import sys

sys.path.append('.')  # noqa: E402

from kanmail.server.mail.folder_cache import remove_stale_folders, remove_stale_headers


print('--> Removing stale folders...')
remove_stale_folders()

print('--> Removing stale headers...')
remove_stale_headers()
