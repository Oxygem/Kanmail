#!/usr/bin/env python

import json
import platform

from datetime import datetime
from os import environ, makedirs, path, remove, symlink
from shutil import rmtree
from subprocess import check_output, run

import click
import pyupdater
import tld

from jinja2 import Template

MAJOR_VERSION = 1

ROOT_DIRNAME = path.normpath(path.join(path.abspath(path.dirname(__file__)), '..'))
DIST_DIRNAME = path.join(ROOT_DIRNAME, 'dist')
MAKE_DIRNAME = path.join(ROOT_DIRNAME, 'make')

TEMP_VERSION_LOCK_FILENAME = path.join(DIST_DIRNAME, '.release_version_lock')
TEMP_SPEC_FILENAME = path.join(DIST_DIRNAME, '.spec')

VERSION_DATA_FILENAME = path.join(DIST_DIRNAME, 'version.json')

CODESIGN_KEY_NAME = environ.get('CODESIGN_KEY_NAME')


def _print_and_run(command):
    click.echo(f'--> {command}')
    return run(command, check=True)


def _print_and_check_output(command):
    click.echo(f'--> {command}')
    return check_output(command)


def _get_pyupdater_package_dir():
    return path.dirname(pyupdater.__file__)


def _get_tld_package_dir():
    return path.dirname(tld.__file__)


def _generate_version():
    date_version = datetime.now().strftime('%y%m%d%H%M')
    return f'{MAJOR_VERSION}.{date_version}'


def _write_version_data(version):
    channel = 'stable'

    # Write the version to the dist directory to be injected into the bundle
    version_data = json.dumps({
        'version': version,
        'channel': channel,
    })
    with open(VERSION_DATA_FILENAME, 'w') as f:
        f.write(version_data)


def _generate_spec(version):
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
            'pyupdater_package_dir': _get_pyupdater_package_dir(),
            'tld_package_dir': _get_tld_package_dir(),
        }))

    return TEMP_SPEC_FILENAME


def _get_git_changes():
    previous_tag = _print_and_check_output((
        'git', 'describe', '--abbrev=0', '--tags',
    )).strip().decode()

    git_changes = _print_and_check_output((
        'git', 'log', '--oneline', '--pretty=%s', f'{previous_tag}..HEAD',
    )).strip().decode().split('\n')

    return '\n'.join([f'- {change}' for change in git_changes])


def _update_changelog(version, git_changes):
    # Edit/create the changelog
    with open('CHANGELOG.md', 'r') as f:
        changelog_data = f.read()

    changelog_data = f'# v{version}\n\nChanges:\n{git_changes}\n\n{changelog_data}'
    new_changelog = click.edit(changelog_data)
    if not new_changelog:
        raise click.BadParameter('Invalid changelog!')

    with open('CHANGELOG.md', 'w') as f:
        f.write(new_changelog)


def _get_release_version():
    with open(TEMP_VERSION_LOCK_FILENAME, 'r') as f:
        return f.read().strip()


def _write_release_version(version):
    with open(TEMP_VERSION_LOCK_FILENAME, 'w') as f:
        f.write(version)


def _macos_codesign(version):
    new_builds_dir = path.join('pyu-data', 'new')

    filename = path.join(new_builds_dir, f'Kanmail-mac-{version}.tar.gz')
    _print_and_run(('gtar', '-C', new_builds_dir, '-xzf', filename))

    # "Fix" invalid files/symlinks from pyupdater
    # See: https://github.com/JMSwag/PyUpdater/issues/139
    # Basically - anything in Resources that's also in MacOS - remove in MacOS
    # and replace with symlink to the Resources copy.
    app_name = 'Kanmail.app'
    app_dir = path.join(new_builds_dir, app_name)
    macos_dir = path.join(app_dir, 'Contents', 'MacOS')
    resources_dir = path.join(app_dir, 'Contents', 'Resources')

    # First *copy* the base_library.zip into Contents/Resources so that below
    # we remove the original and replace with a symlink. Fixes codesign issues,
    # see: https://github.com/pyinstaller/pyinstaller/issues/3550
    _print_and_run((
        'mv',
        path.join(macos_dir, 'base_library.zip'),
        resources_dir,
    ))

    symlink(
        path.join('..', 'Resources', 'base_library.zip'),
        path.join(macos_dir, 'base_library.zip'),
    )

    # Sign it and re-tar!
    _print_and_run(('codesign', '-s', CODESIGN_KEY_NAME, '--deep', app_dir))
    _print_and_run(('gtar', '-C', new_builds_dir, '-zcf', filename, app_name))

    # Remove the app now we've tar-ed it up
    rmtree(app_dir)


def prepare_release():
    version = _generate_version()
    git_changes = _get_git_changes()

    if not click.confirm((
        f'\nGit Changes:\n{git_changes}\n\n'
        f'Are you SURE you wish to start releasing v{version}?'
    )):
        raise click.ClickException('User is not sure!')

    click.echo(f'--> preparing v{version} release')

    click.echo('--> update changelog')
    _update_changelog(version, git_changes)

    if not path.isdir(DIST_DIRNAME):
        makedirs(DIST_DIRNAME)

    click.echo(f'--> generate {VERSION_DATA_FILENAME}')
    _write_release_version(version)
    _write_version_data(version)

    click.echo()
    click.echo(f'Kanmail v{version} release is prepped!')
    click.echo(f'Re-run {click.style("scripts/release.py", bold=True)} to build on each platform')
    click.echo()


def build_release(build_only=False):
    system_type = platform.system()

    if system_type == 'Darwin' and not CODESIGN_KEY_NAME:
        raise click.ClickException(
            'No `CODESIGN_KEY_NAME` environment variable provided!',
        )

    if build_only:
        version = _generate_version()
    else:
        version = _get_release_version()

    click.echo(f'--> building v{version} on {system_type}')

    # Build the clientside JS bundle, rename with version
    _print_and_run(('yarn', 'run', 'build'))
    _print_and_run((
        'mv',
        path.join(DIST_DIRNAME, 'main.js'),
        path.join(DIST_DIRNAME, f'main-{version}.js'),
    ))

    click.echo(f'--> generate {TEMP_SPEC_FILENAME}')
    specfile = _generate_spec(version)

    if build_only:
        _write_version_data(version)

    # Do the build with pyinstaller or pyupdater if releasing
    _print_and_run((
        'pyupdater',
        'build',
        f'--app-version={version}',
        '--windowed',
        '--name',
        'Kanmail',
        specfile,
    ))

    # Now use `codesign` to sign the package with a Developer ID
    if system_type == 'Darwin':
        _macos_codesign(version)

    click.echo()
    click.echo(f'Kanmail v{version} for {system_type} built!')

    if build_only:
        click.echo('Cleaning up single build...')
        return

    click.echo((
        f'--> run {click.style("scripts/release.py", bold=True)} '
        'to build on another platform'
    ))
    click.echo((
        f'--> run {click.style("scripts/release.py --complete", bold=True)} '
        'to complete the release'
    ))
    click.echo()


def complete_release():
    release_version = _get_release_version()

    if not click.confirm((
        f'Are you SURE v{release_version} is ready to release '
        '(commit changelog -> package -> sign -> upload)?'
    )):
        raise click.Abort('User is not sure!')

    # Git commit the changelog/tag/push
    _print_and_run(('git', 'add', 'CHANGELOG.md'))
    _print_and_run(('git', 'commit', '-m', f'Update changelog for v{release_version}.'))
    _print_and_run((
        'git', 'tag',
        '-a', f'v{release_version}',
        '-m', f'v{release_version}',
    ))
    _print_and_run(('git', 'push'))
    _print_and_run(('git', 'push', '--tags'))

    # Sign + upload
    _print_and_run(('pyupdater', 'pkg', '--process', '--sign'))
    _print_and_run(('pyupdater', 'upload', '--service', 's3'))

    # Finally, remove the release version lock
    remove(TEMP_VERSION_LOCK_FILENAME)
    click.echo(f'--> Kanmail v{release_version} released!')

    if click.confirm(f'Delete dist/?', default=True):
        rmtree(DIST_DIRNAME)


@click.command()
@click.option('--complete', is_flag=True, default=False)
@click.option('--build-only', is_flag=True, default=False)
def release(complete=False, build_only=False):
    click.echo()
    click.echo('### Kanmail release script')
    click.echo()

    version_lock_exists = path.exists(TEMP_VERSION_LOCK_FILENAME)

    if complete:
        if build_only:
            raise click.UsageError('Cannot have --build-only and --complete!')

        if not version_lock_exists:
            raise click.UsageError(
                f'Cannot --complete, no {TEMP_VERSION_LOCK_FILENAME} exists!',
            )

        click.echo('--> [3/3] completeing relase')
        complete_release()
        return

    # If the version lock exists we're actually building for a given platform
    if version_lock_exists or build_only:
        if build_only and version_lock_exists:
            raise click.UsageError('Cannot --build-only when preparing a release!')

        click.echo('--> [2*/3] building release')
        build_release(build_only=build_only)
        return

    # No version lock so let's create one and prepare start-of-release
    click.echo('--> [1/3] preparing release')
    prepare_release()


if __name__ == '__main__':
    release()
