#!/usr/bin/env python

import json
import platform

from datetime import datetime
from os import makedirs, path
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


def print_and_run(command):
    click.echo(f'--> {command}')
    run(command)


def get_version(is_release):
    return NOW_VERSION
    # TODO? Multi channel
    # return NOW_VERSION if is_release else f'{NOW_VERSION}alpha'


def write_version(is_release):
    version = get_version(is_release)
    channel = 'stable'
    # TODO? Multi channel
    # channel = 'stable' if is_release else 'alpha'

    # Write the version to the dist directory to be injected into the bundle
    version_data = json.dumps({
        'version': version,
        'channel': channel,
    })
    with open(VERSION_FILENAME, 'w') as f:
        f.write(version_data)

    return version


def generate_spec(version, is_release):
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
            'is_release': is_release,
            'pyupdater_package_dir': get_pyupdater_package_dir(),
        }))

    return TEMP_SPEC_FILENAME


def update_changelog_git_release(version):
    # Edit/create the changelog
    with open('CHANGELOG.md', 'r') as f:
        changelog_data = f.read()

    changelog_data = f'# v{version}\n\n\n{changelog_data}'
    new_changelog = click.edit(changelog_data)
    if not new_changelog:
        raise click.BadParameter('Invalid changelog!')

    with open('CHANGELOG.md', 'w') as f:
        f.write(new_changelog)

    # Git commit the changelog/tag/push
    print_and_run(('git', 'add', 'CHANGELOG.md'))
    print_and_run(('git', 'commit', '-m', f'Update changelog for v{version}.'))
    print_and_run(('git', 'tag', '-a', f'v{version}', '-m', f'v{version}'))
    print_and_run(('git', 'push'))
    print_and_run(('git', 'push', '--tags'))


@click.command()
@click.option('--release', 'is_release', is_flag=True, default=False)
def build(is_release):
    if not path.exists(DIST_DIRNAME):
        makedirs(DIST_DIRNAME)

    # Get the version
    version = get_version(is_release)
    click.echo(f'\n### Build{" + Release" if is_release else ""} Kanmail {version}\n')

    if is_release:
        update_changelog_git_release(version)

    click.echo(f'--> generate {VERSION_FILENAME}')
    write_version(is_release)

    # Generate specfile for platform
    click.echo(f'--> generate {TEMP_SPEC_FILENAME}')
    specfile = generate_spec(version, is_release=is_release)

    # Build the clientside JS bundle
    print_and_run(('yarn', 'run', 'build'))

    # Do the build with pyinstaller or pyupdater if releasing
    print_and_run((
        'pyupdater',
        'build',
        f'--app-version={version}',
        '--windowed',
        '--name',
        'Kanmail',
        specfile,
    ))

    # Process, sign & upload the build with pyupdater
    if is_release:
        print_and_run(('pyupdater', 'pkg', '--process', '--sign'))
        print_and_run(('pyupdater', 'upload', '--service', 's3'))


if __name__ == '__main__':
    build()
