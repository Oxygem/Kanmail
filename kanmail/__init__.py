import logging
import sys


if sys.version_info.major != 3:
    raise RuntimeError('Python 2 is *not* supported.')


# Set the default/global log level to WARN
logging.getLogger().setLevel(logging.WARNING)
