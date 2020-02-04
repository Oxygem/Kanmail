#!/usr/bin/env python

import json
import platform

from datetime import datetime
from os import environ, makedirs, path, remove, symlink
from shutil import rmtree
from subprocess import check_output, run

import click
import pyupdater
import requests
import tld

from jinja2 import Template

MAJOR_VERSION = 1

ROOT_DIRNAME = path.normpath(path.join(path.abspath(path.dirname(__file__)), '..'))
DIST_DIRNAME = path.join(ROOT_DIRNAME, 'dist')
MAKE_DIRNAME = path.join(ROOT_DIRNAME, 'make')

TEMP_VERSION_LOCK_FILENAME = path.join(DIST_DIRNAME, '.release_version_lock')
TEMP_SPEC_FILENAME = path.join(DIST_DIRNAME, '.spec')
TEMP_CHANGELOG_FILENAME = path.join(DIST_DIRNAME, '.changelog')

VERSION_DATA_FILENAME = path.join(DIST_DIRNAME, 'version.json')

DOCKER_NAME = 'fizzadar/kanmail'

CODESIGN_KEY_NAME = environ.get('CODESIGN_KEY_NAME')
GITHUB_API_TOKEN = environ.get('GITHUB_API_TOKEN')


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
    system_to_platform = {
        'Darwin': 'mac',
        'Linux': 'nix64',
        'Windows': 'win',
    }
    platform_name = system_to_platform.get(platform.system())

    if not platform_name:
        raise NotImplementedError('This platform is not supported!')

    with open(path.join(MAKE_DIRNAME, 'spec.j2.py'), 'r') as f:
        template_data = f.read()
    template = Template(template_data)

    with open(TEMP_SPEC_FILENAME, 'w') as f:
        f.write(template.render({
            'root_dir': ROOT_DIRNAME,
            'version': version,
            'platform_name': platform_name,
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


def _create_new_changelog(version, git_changes):
    new_changelog = f'# v{version}\n\nChanges:\n{git_changes}\n\n'
    new_changelog = click.edit(new_changelog)

    if not new_changelog:
        raise click.BadParameter('Invalid changelog!')

    with open(TEMP_CHANGELOG_FILENAME, 'w') as f:
        f.write(new_changelog)


def _get_new_changelog():
    with open(TEMP_CHANGELOG_FILENAME, 'r') as f:
        return f.read()


def _write_new_changelog():
    new_changelog = _get_new_changelog()

    with open('CHANGELOG.md', 'w') as f:
        current_changelog = f.read()
        changelog = f'{new_changelog}{current_changelog}'
        f.write(changelog)


def _create_github_release(version):
    response = requests.post(
        'https://api.github.com/repos/fizzadar/Kanmail/releases',
        json={
            'tag_name': f'v{version}',
            'body': _get_new_changelog(),
        },
        headers={
            'Authorization': f'token {GITHUB_API_TOKEN}',
        },
    )
    response.raise_for_status()


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

    click.echo('--> create changelog')
    _create_new_changelog(version, git_changes)

    click.echo('--> building clientside bundle')
    _print_and_run(('yarn', 'run', 'build'))

    if not path.isdir(DIST_DIRNAME):
        makedirs(DIST_DIRNAME)

    click.echo(f'--> generate {VERSION_DATA_FILENAME}')
    _write_release_version(version)
    _write_version_data(version)

    click.echo()
    click.echo(f'Kanmail v{version} release is prepped!')
    click.echo(f'Re-run {click.style("scripts/release.py", bold=True)} to build on each platform')
    click.echo()


def build_release(build_only=False, docker=False):
    system_type = 'Docker' if docker else platform.system()

    if system_type == 'Darwin' and not CODESIGN_KEY_NAME:
        raise click.ClickException(
            'No `CODESIGN_KEY_NAME` environment variable provided!',
        )

    js_bundle_exists = path.exists(path.join(DIST_DIRNAME, 'main.js'))

    if build_only:
        version = _generate_version()
        if not js_bundle_exists:
            click.echo('--> building clientside bundle')
            _print_and_run(('yarn', 'run', 'build'))
    else:
        version = _get_release_version()
        if not js_bundle_exists:
            raise click.ClickException('No JS bundle exists, exiting!')

    click.echo(f'--> building v{version} on {system_type}')

    click.echo(f'--> generate {TEMP_SPEC_FILENAME}')
    specfile = _generate_spec(version)

    if build_only:
        _write_version_data(version)

    if docker:
        _print_and_run((
            'docker',
            'build',
            '--pull',
            '-t',
            f'kanmail:{version}',
            '-f',
            'docker/Dockerfile',
            '.',
        ))
    else:
        _print_and_run((
            'pyupdater',
            'build',
            f'--app-version={version}',
            '--pyinstaller-log-info',
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
        click.echo('Single build complete...')
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
    if not GITHUB_API_TOKEN:
        raise click.ClickException(
            'No `GITHUB_API_TOKEN` environment variable provided!',
        )

    release_version = _get_release_version()

    _print_and_check_output(('docker', 'image', 'inspect', f'{DOCKER_NAME}:{release_version}'))
    _print_and_run(('docker', 'push', f'{DOCKER_NAME}:{release_version}'))

    if not click.confirm((
        f'Are you SURE v{release_version} is ready to release '
        '(commit changelog -> package -> sign -> upload)?'
    )):
        raise click.Abort('User is not sure!')

    _write_new_changelog()
    _print_and_run(('git', 'add', 'CHANGELOG.md'))
    _print_and_run(('git', 'commit', '-m', f'Update changelog for v{release_version}.'))
    _print_and_run((
        'git', 'tag',
        '-a', f'v{release_version}',
        '-m', f'v{release_version}',
    ))

    _print_and_run(('pyupdater', 'pkg', '--process', '--sign'))
    _print_and_run(('pyupdater', 'upload', '--service', 's3'))

    _print_and_run(('git', 'push'))
    _print_and_run(('git', 'push', '--tags'))

    _create_github_release(release_version)

    # Finally, remove the release version lock
    remove(TEMP_VERSION_LOCK_FILENAME)
    click.echo(f'--> Kanmail v{release_version} released!')

    if click.confirm(f'Run scripts/clean.sh?', default=True):
        _print_and_run(('scripts/clean.sh',))


@click.command()
@click.option('--complete', is_flag=True, default=False)
@click.option('--build-only', is_flag=True, default=False)
@click.option('--docker', is_flag=True, default=False)
def release(complete, build_only, docker):
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
        build_release(build_only=build_only, docker=docker)
        return

    # No version lock so let's create one and prepare start-of-release
    click.echo('--> [1/3] preparing release')
    prepare_release()


if __name__ == '__main__':
    release()
