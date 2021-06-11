import json
import platform

from datetime import datetime
from os import path
from subprocess import check_output, run

import click
import pyupdater
# import requests
import tld

from jinja2 import Template

from kanmail.settings.hidden import generate_hidden_data

from .settings import (
    # GITHUB_API_TOKEN,
    HIDDEN_DATA_FILENAME,
    MAJOR_VERSION,
    MAKE_DIRNAME,
    ROOT_DIRNAME,
    TEMP_SPEC_FILENAME,
    TEMP_VERSION_LOCK_FILENAME,
    VERSION_DATA_FILENAME,
)


def _get_pyupdater_package_dir():
    return path.dirname(pyupdater.__file__)


def _get_tld_package_dir():
    return path.dirname(tld.__file__)


def print_and_run(command, **kwargs):
    click.echo(f'--> {command}')
    return run(command, check=True, **kwargs)


def print_and_check_output(command):
    click.echo(f'--> {command}')
    return (
        check_output(command)
        .decode()  # bytes -> str
        .strip()
    )


def generate_version():
    date_version = datetime.now().strftime('%y%m%d%H%M')
    return f'{MAJOR_VERSION}.{date_version}'


def get_git_changes():
    previous_tag = print_and_check_output((
        'git', 'describe', '--abbrev=0', '--tags',
    ))

    git_changes = print_and_check_output((
        'git', 'log', '--oneline', '--pretty=%s', f'{previous_tag}..HEAD',
    )).splitlines()

    return '\n'.join([f'- {change}' for change in git_changes])


def write_version_data(version):
    channel = 'stable'

    # Write the version to the dist directory to be injected into the bundle
    with open(VERSION_DATA_FILENAME, 'w') as f:
        json.dump({
            'version': version,
            'channel': channel,
        }, f)


def read_version_data():
    with open(VERSION_DATA_FILENAME, 'r') as f:
        return json.load(f)


def write_hidden_data():
    with open(HIDDEN_DATA_FILENAME, 'wb') as f:
        f.write(generate_hidden_data())


def generate_spec(version, onedir=False):
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
            'onedir': onedir,
        }))

    return TEMP_SPEC_FILENAME


def create_new_changelog(version, git_changes):
    new_changelog = f'# v{version}\n\nChanges:\n{git_changes}\n\n'
    new_changelog = click.edit(new_changelog)

    if not new_changelog:
        raise click.BadParameter('Invalid changelog!')

    with open('CHANGELOG.md', 'r') as f:
        current_changelog = f.read()

    changelog = f'{new_changelog}{current_changelog}'
    with open('CHANGELOG.md', 'w') as f:
        f.write(changelog)


# def create_github_release(version):
#     # Swap out the title line in the changelog for a link to the downloads page (tag title is
#     # already shown in github UI).
#     changelog = get_new_changelog()
#     changelog_lines = changelog.splitlines()
#     changelog_lines[0] = '[**Download the latest Kanmail here**](https://kanmail.io/download).'
#     changelog = '\n'.join(changelog)

#     response = requests.post(
#         'https://api.github.com/repos/fizzadar/Kanmail/releases',
#         json={
#             'tag_name': f'v{version}',
#             'body': changelog,
#         },
#         headers={
#             'Authorization': f'token {GITHUB_API_TOKEN}',
#         },
#     )
#     response.raise_for_status()


def get_release_version():
    with open(TEMP_VERSION_LOCK_FILENAME, 'r') as f:
        return f.read().strip()


def write_release_version(version):
    with open(TEMP_VERSION_LOCK_FILENAME, 'w') as f:
        f.write(version)
