from distutils.spawn import find_executable
from os import path

import click

from .settings import (
    BASE_REQUIREMENTS_FILENAME,
    DEVELOPMENT_REQUIREMENTS_FILENAME,
    REQUIREMENTS_FILENAME,
)
from .util import print_and_run


def _ensure_pip_tools_installed():
    if not find_executable('pip-sync'):
        click.echo('Installing pip-tools')
        print_and_run(('pip', 'install', 'pip-tools'))


@click.group()
def cli():
    pass


@cli.command()
@click.option('--dev', is_flag=True, default=False)
def install(dev):
    _ensure_pip_tools_installed()

    requirements_files = (REQUIREMENTS_FILENAME,)
    if dev:
        requirements_files = (REQUIREMENTS_FILENAME, DEVELOPMENT_REQUIREMENTS_FILENAME)

    print_and_run(('pip-sync', *requirements_files))

    click.echo('Requirements setup complete!')


@cli.command()
def update():
    _ensure_pip_tools_installed()

    print_and_run((
        'pip-compile',
        '-q',
        f'--output-file={path.relpath(REQUIREMENTS_FILENAME)}',
        path.relpath(BASE_REQUIREMENTS_FILENAME),
    ))

    click.echo(f'Requiremnts file updated: {path.relpath(REQUIREMENTS_FILENAME)}')


@cli.command()
def update_dev():
    _ensure_pip_tools_installed()

    print_and_run((
        'pip-compile',
        '-q',
        path.relpath(DEVELOPMENT_REQUIREMENTS_FILENAME).replace('.txt', '.in'),
    ))

    click.echo(f'Development requirements file updated: {DEVELOPMENT_REQUIREMENTS_FILENAME}')


if __name__ == '__main__':
    cli()
