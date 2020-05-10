#!/usr/bin/env python

import platform

from os import environ, makedirs, path, remove

import click

from .macos import codesign_and_notarize
from .settings import (
    CODESIGN_KEY_NAME,
    DIST_DIRNAME,
    DOCKER_NAME,
    GITHUB_API_TOKEN,
    MACOSX_DEPLOYMENT_TARGET,
    NOTARIZE_PASSWORD_KEYCHAIN_NAME,
    TEMP_SPEC_FILENAME,
    TEMP_VERSION_LOCK_FILENAME,
    VERSION_DATA_FILENAME,
)
from .util import (
    create_github_release,
    create_new_changelog,
    generate_spec,
    generate_version,
    get_git_changes,
    get_release_version,
    print_and_check_output,
    print_and_run,
    write_new_changelog,
    write_release_version,
    write_version_data,
)


def prepare_release():
    version = generate_version()
    git_changes = get_git_changes()

    if not click.confirm((
        f'\nGit Changes:\n{git_changes}\n\n'
        f'Are you SURE you wish to start releasing v{version}?'
    )):
        raise click.ClickException('User is not sure!')

    click.echo(f'--> preparing v{version} release')

    click.echo('--> create changelog')
    create_new_changelog(version, git_changes)

    click.echo('--> building clientside bundle')
    print_and_run(('yarn', 'run', 'build'))

    if not path.isdir(DIST_DIRNAME):
        makedirs(DIST_DIRNAME)

    click.echo(f'--> generate {VERSION_DATA_FILENAME}')
    write_release_version(version)
    write_version_data(version)

    click.echo()
    click.echo(f'Kanmail v{version} release is prepped!')
    click.echo(f'Re-run {click.style("scripts/release.py", bold=True)} to build on each platform')
    click.echo()


def build_release(release=False, docker=False, build_version=None, onedir=None):
    system_type = 'Docker' if docker else platform.system()

    if release and system_type == 'Darwin':
        for key, value in (
            ('CODESIGN_KEY_NAME', CODESIGN_KEY_NAME),
            ('NOTARIZE_PASSWORD_KEYCHAIN_NAME', NOTARIZE_PASSWORD_KEYCHAIN_NAME),
        ):
            if not value:
                raise click.ClickException(
                    f'No `{key}` environment variable provided!',
                )

        # Refuse to build release unless we're specifically in the special MacOS X build env
        if environ.get('MACOSX_DEPLOYMENT_TARGET') != MACOSX_DEPLOYMENT_TARGET:
            raise click.ClickException((
                'Refusing to build on MacOS where MACOSX_DEPLOYMENT_TARGET is not '
                'set to 10.12 (need to setup env?).'
            ))

    js_bundle_filename = path.join(DIST_DIRNAME, 'main.js')
    js_bundle_exists = path.exists(js_bundle_filename)
    if not js_bundle_exists:
        if not release and click.confirm('No JS bundle exists, build it?'):
            print_and_run(('yarn', 'run', 'build'))
        else:
            raise click.ClickException(f'No JS bundle exists ({js_bundle_filename}), exiting!')

    if release:
        version = get_release_version()
    else:
        if build_version:
            version = build_version
        else:
            version = generate_version()

    click.echo(f'--> building v{version} on {system_type}')

    click.echo(f'--> generate {TEMP_SPEC_FILENAME}')
    specfile = generate_spec(version, onedir=onedir)

    if not release:
        write_version_data(version)

    if docker:
        print_and_run((
            'docker',
            'build',
            '--pull',
            '-t',
            f'{DOCKER_NAME}:{version}',
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
        if release and system_type == 'Darwin':
            codesign_and_notarize(version)

    click.echo()
    click.echo(f'Kanmail v{version} for {system_type} built!')

    if not release:
        click.echo('Single build complete...')
        return

    click.echo((
        f'--> run {click.style("make release", bold=True)} '
        'to build on another platform'
    ))
    click.echo((
        f'--> run {click.style("make release-complete", bold=True)} '
        'to complete the release'
    ))
    click.echo()


def complete_release():
    if not GITHUB_API_TOKEN:
        raise click.ClickException(
            'No `GITHUB_API_TOKEN` environment variable provided!',
        )

    release_version = get_release_version()

    # Check output to hide the JSON dump
    print_and_check_output(('docker', 'image', 'inspect', f'{DOCKER_NAME}:{release_version}'))
    print_and_run(('docker', 'push', f'{DOCKER_NAME}:{release_version}'))

    if not click.confirm((
        f'Are you SURE v{release_version} is ready to release '
        '(commit changelog -> package -> sign -> upload)?'
    )):
        raise click.Abort('User is not sure!')

    write_new_changelog()
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

    create_github_release(release_version)

    # Finally, remove the release version lock
    remove(TEMP_VERSION_LOCK_FILENAME)
    click.echo(f'--> Kanmail v{release_version} released!')

    if click.confirm(f'Run make clean?', default=True):
        print_and_run(('make', 'clean'))


@click.command()
@click.option('--complete', is_flag=True, default=False)
@click.option('--release', is_flag=True, default=False)
@click.option('--docker', is_flag=True, default=False)
@click.option('--onedir', is_flag=True, default=False)
@click.option('--version', default=None)
def release(complete, release, docker, version, onedir):
    click.echo()
    click.echo('### Kanmail release script')
    click.echo()

    version_lock_exists = path.exists(TEMP_VERSION_LOCK_FILENAME)

    if complete and not release:
        raise click.UsageError('Cannot have --complete without --release!')

    if complete and not version_lock_exists:
        raise click.UsageError(
            f'Cannot --complete, no {TEMP_VERSION_LOCK_FILENAME} exists!',
        )

    if complete:
        click.echo('--> [3/3] completeing relase')
        complete_release()
        return

    # If the version lock exists we're actually building for a given platform
    if version_lock_exists or not release:
        if version_lock_exists and not release:
            raise click.UsageError('Cannot build when preparing a release!')

        if version and release:
            raise click.UsageError('Cannot --version with --release!')

        if onedir and release:
            raise click.UsageError('Cannot --onedir with --release!')

        click.echo('--> [2*/3] building release')
        build_release(release=release, docker=docker, build_version=version, onedir=onedir)
        return

    # No version lock so let's create one and prepare start-of-release
    click.echo('--> [1/3] preparing release')
    prepare_release()


if __name__ == '__main__':
    release()
