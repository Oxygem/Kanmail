from os import path, symlink
from shutil import rmtree

from .settings import CODESIGN_KEY_NAME
from .util import print_and_run


def codesign(app_dir):
    # "Fix" invalid files/symlinks from pyupdater
    # See: https://github.com/JMSwag/PyUpdater/issues/139
    # Basically - anything in Resources that's also in MacOS - remove in MacOS
    # and replace with symlink to the Resources copy.
    macos_dir = path.join(app_dir, 'Contents', 'MacOS')
    resources_dir = path.join(app_dir, 'Contents', 'Resources')

    # First *copy* the base_library.zip into Contents/Resources so that below
    # we remove the original and replace with a symlink. Fixes codesign issues,
    # see: https://github.com/pyinstaller/pyinstaller/issues/3550
    print_and_run((
        'mv',
        path.join(macos_dir, 'base_library.zip'),
        resources_dir,
    ))

    symlink(
        path.join('..', 'Resources', 'base_library.zip'),
        path.join(macos_dir, 'base_library.zip'),
    )

    print_and_run((
        'codesign',
        '--deep',
        '--timestamp',
        '--options', 'runtime',
        '-s', CODESIGN_KEY_NAME,
        app_dir,
    ))


def codesign_and_notarize(version):
    new_builds_dir = path.join('pyu-data', 'new')

    filename = path.join(new_builds_dir, f'Kanmail-mac-{version}.tar.gz')
    print_and_run(('gtar', '-C', new_builds_dir, '-xzf', filename))
    app_name = 'Kanmail.app'
    app_dir = path.join(new_builds_dir, app_name)

    codesign(app_dir)

    print_and_run(('gtar', '-C', new_builds_dir, '-zcf', filename, app_name))

    # Remove the app now we've tar-ed it up
    rmtree(app_dir)
