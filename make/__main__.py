#!/usr/bin/env python

import json
import platform

from datetime import datetime
from os import makedirs, path, remove

import click
import pyupdater
import requests
import tld

from jinja2 import Template

from .macos import codesign_and_notarize
from .settings import (
    CODESIGN_KEY_NAME,
    DIST_DIRNAME,
    DOCKER_NAME,
    GITHUB_API_TOKEN,
    MAJOR_VERSION,
    MAKE_DIRNAME,
    ROOT_DIRNAME,
    TEMP_CHANGELOG_FILENAME,
    TEMP_SPEC_FILENAME,
    TEMP_VERSION_LOCK_FILENAME,
    VERSION_DATA_FILENAME,
)
from .util import print_and_check_output, print_and_run


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
    previous_tag = print_and_check_output((
        'git', 'describe', '--abbrev=0', '--tags',
    )).strip().decode()

    git_changes = print_and_check_output((
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

    with open('CHANGELOG.md', 'r') as f:
        current_changelog = f.read()

    changelog = f'{new_changelog}{current_changelog}'
    with open('CHANGELOG.md', 'w') as f:
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
    print_and_run(('yarn', 'run', 'build'))

    if not path.isdir(DIST_DIRNAME):
        makedirs(DIST_DIRNAME)

    click.echo(f'--> generate {VERSION_DATA_FILENAME}')
    _write_release_version(version)
    _write_version_data(version)

    click.echo()
    click.echo(f'Kanmail v{version} release is prepped!')
    click.echo(f'Re-run {click.style("scripts/release.py", bold=True)} to build on each platform')
    click.echo()


def build_release(build_only=False, docker=False, build_version=None):
    system_type = 'Docker' if docker else platform.system()

    if system_type == 'Darwin' and not CODESIGN_KEY_NAME:
        raise click.ClickException(
            'No `CODESIGN_KEY_NAME` environment variable provided!',
        )

    js_bundle_filename = path.join(DIST_DIRNAME, 'main.js')
    js_bundle_exists = path.exists(js_bundle_filename)
    if not js_bundle_exists:
        if build_only and click.confirm('No JS bundle exists, build it?'):
            print_and_run(('yarn', 'run', 'build'))
        else:
            raise click.ClickException(f'No JS bundle exists ({js_bundle_filename}), exiting!')

    if build_only:
        if build_version:
            version = build_version
        else:
            version = _generate_version()
    else:
        version = _get_release_version()

    click.echo(f'--> building v{version} on {system_type}')

    click.echo(f'--> generate {TEMP_SPEC_FILENAME}')
    specfile = _generate_spec(version)

    if build_only:
        _write_version_data(version)

    if docker:
        print_and_run((
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
        print_and_run((
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
            codesign_and_notarize(version)

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

    print_and_check_output(('docker', 'image', 'inspect', f'{DOCKER_NAME}:{release_version}'))
    print_and_run(('docker', 'push', f'{DOCKER_NAME}:{release_version}'))

    if not click.confirm((
        f'Are you SURE v{release_version} is ready to release '
        '(commit changelog -> package -> sign -> upload)?'
    )):
        raise click.Abort('User is not sure!')

    _write_new_changelog()
    print_and_run(('git', 'add', 'CHANGELOG.md'))
    print_and_run(('git', 'commit', '-m', f'Update changelog for v{release_version}.'))
    print_and_run((
        'git', 'tag',
        '-a', f'v{release_version}',
        '-m', f'v{release_version}',
    ))

    print_and_run(('pyupdater', 'pkg', '--process', '--sign'))
    print_and_run(('pyupdater', 'upload', '--service', 's3'))

    print_and_run(('git', 'push'))
    print_and_run(('git', 'push', '--tags'))

    _create_github_release(release_version)

    # Finally, remove the release version lock
    remove(TEMP_VERSION_LOCK_FILENAME)
    click.echo(f'--> Kanmail v{release_version} released!')

    if click.confirm(f'Run scripts/clean.sh?', default=True):
        print_and_run(('scripts/clean.sh',))


@click.command()
@click.option('--complete', is_flag=True, default=False)
@click.option('--build-only', is_flag=True, default=False)
@click.option('--docker', is_flag=True, default=False)
@click.option('--version', default=None)
def release(complete, build_only, docker, version):
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

        if version and not build_only:
            raise click.UsageError('Cannot --version without --build-only!')

        click.echo('--> [2*/3] building release')
        build_release(build_only=build_only, docker=docker, build_version=version)
        return

    # No version lock so let's create one and prepare start-of-release
    click.echo('--> [1/3] preparing release')
    prepare_release()


if __name__ == '__main__':
    release()
