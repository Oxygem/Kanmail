#!/usr/bin/env python

import json
import platform

from datetime import datetime
from os import path
from subprocess import run

import click
import pyupdater

from jinja2 import Template


MAJOR_VERSION = 1
DATE_VERSION = datetime.now().strftime('%y%m%H%M')
NOW_VERSION = f'{MAJOR_VERSION}.{DATE_VERSION}'

ROOT_DIRNAME = path.normpath(path.join(path.abspath(path.dirname(__file__)), '..'))
MAKE_DIRNAME = path.join(ROOT_DIRNAME, 'make')
DIST_DIRNAME = path.join(ROOT_DIRNAME, 'dist')

TEMP_SPEC_FILENAME = path.join(DIST_DIRNAME, '.spec')


def get_pyupdater_package_dir():
    return path.dirname(pyupdater.__file__)


def get_and_write_version(release_channel):
    version = f'{NOW_VERSION}.dev'

    if release_channel == 'alpha':
        version = f'{NOW_VERSION}alpha'

    if release_channel == 'beta':
        version = f'{NOW_VERSION}beta'

    if release_channel == 'stable':
        version = f'{NOW_VERSION}'

    # Write the version to the dist directory to be injected into the bundle
    version_data = json.dumps({
        'version': version,
    })
    with open(path.join(DIST_DIRNAME, 'version.json'), 'w') as f:
        f.write(version_data)

    return version


def generate_spec(version):
    system_type = platform.system()

    template_filename = None
    if system_type == 'Darwin':
        template_filename = 'spec_mac.j2.py'

    if not template_filename:
        raise NotImplementedError('This platform is not supported')

    with open(path.join(MAKE_DIRNAME, template_filename), 'r') as f:
        template_data = f.read()
    template = Template(template_data)

    with open(TEMP_SPEC_FILENAME, 'w') as f:
        f.write(template.render({
            'root_dir': ROOT_DIRNAME,
            'version': version,
            'pyupdater_package_dir': get_pyupdater_package_dir(),
        }))

    return TEMP_SPEC_FILENAME


@click.command()
@click.option('--alpha', 'release_channel', flag_value='alpha')
@click.option('--beta', 'release_channel', flag_value='beta')
@click.option('--stable', 'release_channel', flag_value='stable')
def build(release_channel):
    # Get the version
    version = get_and_write_version(release_channel)

    click.echo(f'\n### Build Kanmail {version}\n')

    # Build the clientside JS bundle
    click.echo('--> yarn run build')
    run(('yarn', 'run', 'build'))

    # Generate specfile for platform
    specfile = generate_spec(version)

    # Execute pyupdater
    command = (
        'pyupdater', 'build',
        '--windowed',
        '--app-version', version,
        '--name', 'Kanmail',
        specfile,
    )
    run(command)


if __name__ == '__main__':
    build()
