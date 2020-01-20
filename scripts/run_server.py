#!/usr/bin/env python

import os
import sys

sys.path.append('.')  # noqa: E402
os.environ['KANMAIL_MODE'] = 'server'  # noqa: E402

from kanmail import settings
from kanmail.server.app import app, boot


# Bootstrap the server
boot()

# Run the server
app.run(
    host='0.0.0.0',
    threaded=True,
    debug=settings.DEBUG,
    port=settings.SERVER_PORT,
)
