from os import path, unlink

import click

from .settings import (
    TEMP_CHANGELOG_FILENAME,
    TEMP_SPEC_FILENAME,
    TEMP_VERSION_LOCK_FILENAME,
)
from .util import print_and_run


if __name__ == '__main__':
    for filename in (
        TEMP_CHANGELOG_FILENAME,
        TEMP_SPEC_FILENAME,
        TEMP_VERSION_LOCK_FILENAME,
    ):
        if path.exists(filename):
            click.echo(f'Removing {filename}')
            unlink(filename)

    print_and_run('rm -rf dist/* build/* pyu-data/new/*', shell=True)
    print_and_run(('git', 'checkout', '--', 'CHANGELOG.md'))

    click.echo('Cleaning complete!')
