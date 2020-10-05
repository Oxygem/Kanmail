#!/usr/bin/env python

import sys

sys.path.append('.')  # noqa: E402

from kanmail.server.mail.folder_cache import (  # noqa: E402
    remove_stale_folders,
    remove_stale_headers,
    vacuum_folder_cache,
)


print('--> Removing stale folders...')
remove_stale_folders()

print('--> Removing stale headers...')
remove_stale_headers()

print('--> Vacuuming!')
vacuum_folder_cache()
