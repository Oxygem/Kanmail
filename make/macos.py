from os import path, unlink
from shutil import rmtree

from .settings import CODESIGN_KEY_NAME, NOTARIZE_PASSWORD_KEYCHAIN_NAME
from .util import print_and_check_output, print_and_run


def codesign(app_dir):
    print_and_run(
        (
            "codesign",
            "--deep",
            "--timestamp",
            "--force",
            "--options",
            "runtime",
            "--entitlements",
            "make/entitlements.plist",
            "--sign",
            CODESIGN_KEY_NAME,
            app_dir,
        ),
    )
    print_and_run(("codesign", "--deep", "--verify", app_dir))


def notarize(version, app_dir, zip_filename):
    print_and_run(("ditto", "-c", "-k", "--keepParent", app_dir, zip_filename))

    try:
        notarize_response = print_and_check_output(
            (
                "xcrun",
                "notarytool",
                "submit",
                zip_filename,
                "--keychain-profile",
                NOTARIZE_PASSWORD_KEYCHAIN_NAME,
                "--wait",
            ),
        )

        if "status: Accepted" not in notarize_response:
            raise Exception("Failed to notarize app")

        print_and_run(("xcrun", "stapler", "staple", app_dir))
        print_and_run(("xcrun", "stapler", "validate", app_dir))
    finally:
        unlink(zip_filename)


def codesign_and_notarize(version):
    new_builds_dir = path.join("pyu-data", "new")

    filename = path.join(new_builds_dir, f"Kanmail-mac-{version}.tar.gz")
    print_and_run(("gtar", "-C", new_builds_dir, "-xzf", filename))
    app_name = "Kanmail.app"
    zip_filename = path.join(new_builds_dir, f"{app_name}.zip")
    app_dir = path.join(new_builds_dir, app_name)

    codesign(app_dir)
    notarize(version, app_dir, zip_filename)

    print_and_run(("gtar", "-C", new_builds_dir, "-zcf", filename, app_name))

    # Remove the app now we've tar-ed it up
    rmtree(app_dir)
