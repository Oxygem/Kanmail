from os import path, symlink, unlink
from shutil import rmtree
from time import sleep

from .settings import CODESIGN_KEY_NAME, NOTARIZE_PASSWORD_KEYCHAIN_NAME
from .util import print_and_check_output, print_and_run


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
        '--entitlements', 'make/entitlements.plist',
        '--sign', CODESIGN_KEY_NAME,
        app_dir,
    ))
    print_and_run(('codesign', '--verify', app_dir))


def wait_for_notarization(notarize_request_id):
    while True:
        notarize_status = print_and_check_output((
            'xcrun',
            'altool',
            '--password', f'@keychain:{NOTARIZE_PASSWORD_KEYCHAIN_NAME}',
            '--notarization-info', notarize_request_id,
        ))

        if 'Status: in progress' not in notarize_status:
            break

        sleep(5)

    return 'Status: success' in notarize_status


def notarize(version, app_dir, zip_filename):
    print_and_run(('ditto', '-c', '-k', '--keepParent', app_dir, zip_filename))

    try:
        notarize_response = print_and_check_output((
            'xcrun',
            'altool',
            '--notarize-app',
            '--primary-bundle-id', version,
            '--password', f'@keychain:{NOTARIZE_PASSWORD_KEYCHAIN_NAME}',
            '--file', zip_filename,
        ))

        for line in notarize_response.splitlines():
            if line.startswith('RequestUUID'):
                notarize_request_id = line.split('=')[1].strip()

        did_succeed = wait_for_notarization(notarize_request_id)
        if not did_succeed:
            raise Exception(f'Failed to notarize app, requestID={notarize_request_id}')

        print_and_run(('xcrun', 'stapler', 'staple', app_dir))
        print_and_run(('xcrun', 'stapler', 'validate', app_dir))
    finally:
        unlink(zip_filename)


def codesign_and_notarize(version):
    new_builds_dir = path.join('pyu-data', 'new')

    filename = path.join(new_builds_dir, f'Kanmail-mac-{version}.tar.gz')
    print_and_run(('gtar', '-C', new_builds_dir, '-xzf', filename))
    app_name = 'Kanmail.app'
    zip_filename = path.join(new_builds_dir, f'{app_name}.zip')
    app_dir = path.join(new_builds_dir, app_name)

    codesign(app_dir)
    notarize(version, app_dir, zip_filename)

    print_and_run(('gtar', '-C', new_builds_dir, '-zcf', filename, app_name))

    # Remove the app now we've tar-ed it up
    rmtree(app_dir)
