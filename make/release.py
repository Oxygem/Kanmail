from os import path

import click

from .settings import NEW_BUILDS_DIRNAME
from .util import print_and_run, read_version_data


def _wait_for_build(filename):
    click.echo('Build the client in another window, and return here afterwards')

    version = read_version_data()['version']
    filename = path.join(NEW_BUILDS_DIRNAME, filename.format(version=version))

    while True:
        if click.confirm('Has the build completed? '):
            if path.exists(filename):
                return
            click.echo(f'File {filename} not found, please try again.')


if __name__ == '__main__':
    print_and_run(('python', '-m', 'make.clean'))
    print_and_run(('python', '-m', 'make', '--release'))

    if click.confirm('Build Docker container?'):
        print_and_run(('python', '-m', 'make', '--docker', '--release'))

    if click.confirm('Build MacOS client? '):
        _wait_for_build('Kanmail-mac-{version}.tar.gz')

    if click.confirm('Build Linux client? '):
        _wait_for_build('Kanmail-nix64-{version}.tar.gz')

    if click.confirm('Build Windows client? '):
        _wait_for_build('Kanmail-win-{version}.zip')

    print_and_run(('python', '-m', 'make', '--release', '--complete'))
