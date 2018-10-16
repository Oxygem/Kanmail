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
DATE_VERSION = datetime.now().strftime('%y%m%d%H%M')
NOW_VERSION = f'{MAJOR_VERSION}.{DATE_VERSION}'

ROOT_DIRNAME = path.normpath(path.join(path.abspath(path.dirname(__file__)), '..'))
MAKE_DIRNAME = path.join(ROOT_DIRNAME, 'make')
DIST_DIRNAME = path.join(ROOT_DIRNAME, 'dist')
VERSION_FILENAME = path.join(DIST_DIRNAME, 'version.json')

TEMP_SPEC_FILENAME = path.join(DIST_DIRNAME, '.spec')


def get_pyupdater_package_dir():
    return path.dirname(pyupdater.__file__)


def get_version(is_release):
    return f'{NOW_VERSION}' if is_release else f'{NOW_VERSION}alpha'


def write_version(is_release):
    version = get_version(is_release)
    channel = 'stable' if is_release else 'alpha'

    # Write the version to the dist directory to be injected into the bundle
    version_data = json.dumps({
        'version': version,
        'channel': channel,
    })
    with open(VERSION_FILENAME, 'w') as f:
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


def print_and_run(command):
    click.echo(f'--> {command}')
    run(command)


@click.command()
@click.option('--release', 'is_release', is_flag=True, default=False)
def build(is_release):
    # Get the version
    version = get_version(is_release)
    click.echo(f'\n### Build{" + Release" if is_release else ""} Kanmail {version}\n')

    click.echo(f'--> generate {VERSION_FILENAME}')
    write_version(is_release)

    # Generate specfile for platform
    click.echo(f'--> generate {TEMP_SPEC_FILENAME}')
    specfile = generate_spec(version)

    # Build the clientside JS bundle
    print_and_run(('yarn', 'run', 'build'))

    # Execute pyupdater
    print_and_run((
        'pyupdater', 'build',
        '--windowed',
        '--app-version', version,
        '--name', 'Kanmail',
        specfile,
    ))

    # Process & sign the build
    if is_release:
        print_and_run(('pyupdater', 'pkg', '--process', '--sign'))


if __name__ == '__main__':
    build()
