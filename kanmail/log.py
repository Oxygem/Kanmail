import logging
import sys

from datetime import datetime
from logging.handlers import TimedRotatingFileHandler

import click


# Get the logger
logger = logging.getLogger('Kanmail')
# Don't push messages from this Process -> main
logger.propagate = False


class LogFormatter(logging.Formatter):
    level_to_format = {
        logging.DEBUG: lambda s: click.style(s, 'green'),
        logging.WARNING: lambda s: click.style(s, 'yellow'),
        logging.ERROR: lambda s: click.style(s, 'red'),
        logging.CRITICAL: lambda s: click.style(s, 'red', bold=True),
    }

    def format(self, record):
        message = super(LogFormatter, self).format(record)

        # Add path/module info for debug
        if record.levelno is logging.DEBUG:
            path_start = record.pathname.rfind('kanmail')

            if path_start:
                pyinfra_path = record.pathname[path_start:-3]  # -3 removes `.py`
                module_name = pyinfra_path.replace('/', '.')
                message = f'[{module_name}] {message}'

        if record.levelno in self.level_to_format:
            message = self.level_to_format[record.levelno](message)

        now = datetime.now().replace(microsecond=0).isoformat()
        return f'{now} {record.levelname} {message}'


def setup_logging(debug: bool, log_file: str) -> int:
    # Figure out the log level
    log_level = logging.WARNING

    if debug:
        log_level = logging.DEBUG

    # Set the log level
    logger.setLevel(log_level)

    # Setup a new handler for stdout & stderr
    stderr_handler = logging.StreamHandler(sys.stderr)

    # Setup a formatter
    formatter = LogFormatter()
    stderr_handler.setFormatter(formatter)

    # Add the handlers
    logger.addHandler(stderr_handler)

    # Setup the file handler
    file_handler = TimedRotatingFileHandler(
        log_file,
        when='D',
        backupCount=7,
    )
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)

    logger.debug(f'Debug level set to: {log_level}')
    return log_level
