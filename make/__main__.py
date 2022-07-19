import platform
from os import environ, path
from subprocess import CalledProcessError

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
    write_hidden_data,
    write_version_data,
)


def prepare_release():
    version = generate_version()
    git_changes = get_git_changes()

    if not click.confirm(
        (
            f"\nGit Changes:\n{git_changes}\n\n"
            f"Are you SURE you wish to start releasing v{version}?"
        )
    ):
        raise click.ClickException("User is not sure!")

    click.echo(f"--> preparing v{version} release")

    click.echo("--> create changelog")
    create_new_changelog(version, git_changes)

    print_and_run(("git", "add", "CHANGELOG.md"))
    print_and_run(("git", "commit", "-m", f"Update changelog for v{version}"))
    print_and_run(
        (
            "git",
            "tag",
            "-a",
            f"v{version}",
            "-m",
            f"v{version}",
        )
    )
    print_and_run(("git", "push"))
    print_and_run(("git", "push", "--tags"))

    click.echo()
    click.echo(f"Kanmail v{version} release is prepped!")
    click.echo()


def build_release(is_release=False, docker=False, build_version=None, onedir=None):
    system_type = "Docker" if docker else platform.system()

    # Refuse to build release unless we're specifically in the special MacOS X build env
    if is_release and system_type == "Darwin":
        if environ.get("MACOSX_DEPLOYMENT_TARGET") != MACOSX_DEPLOYMENT_TARGET:
            raise click.ClickException(
                (
                    "Refusing to build on MacOS where MACOSX_DEPLOYMENT_TARGET is not "
                    f"set to {MACOSX_DEPLOYMENT_TARGET} (need to setup env?)."
                )
            )

    js_bundle_filename = path.join(DIST_DIRNAME, "emails.js")
    js_bundle_exists = path.exists(js_bundle_filename)
    if not js_bundle_exists:
        if not is_release and click.confirm("No JS bundle exists, build it?"):
            print_and_run(("yarn", "run", "build"))
        else:
            raise click.ClickException(f"No JS bundle exists ({js_bundle_filename}), exiting!")

    if is_release:
        version = get_release_version()
        click.echo(f"--> building release v{version} on {system_type}")
    else:
        if build_version:
            version = build_version
        else:
            version = generate_version()
        click.echo(f"--> building non-release v{version} on {system_type}")

    click.echo(f"--> generate {TEMP_SPEC_FILENAME}")
    specfile = generate_spec(version, onedir=onedir)

    write_version_data(version)
    write_hidden_data()

    if docker:
        print_and_run(
            (
                "docker",
                "build",
                "--pull",
                "-t",
                f"{DOCKER_NAME}:{version}",
                ".",
            )
        )
    else:
        print_and_run(
            (
                "pyupdater",
                "build",
                f"--app-version={version}",
                "--pyinstaller-log-info",
                "--name",
                "Kanmail",
                specfile,
            )
        )

    click.echo()
    click.echo(f"Kanmail v{version} for {system_type} built!")

    if not is_release:
        click.echo("Single build complete...")
        return

    click.echo(
        (f'--> run {click.style("make release", bold=True)} ' "to build on another platform")
    )
    click.echo(
        (f'--> run {click.style("make release-complete", bold=True)} ' "to complete the release")
    )
    click.echo()


def download_and_complete_release():
    for key, value in (
        ("CODESIGN_KEY_NAME", CODESIGN_KEY_NAME),
        ("NOTARIZE_PASSWORD_KEYCHAIN_NAME", NOTARIZE_PASSWORD_KEYCHAIN_NAME),
    ):
        if not value:
            raise click.ClickException(
                f"No `{key}` environment variable provided!",
            )

    version = get_release_version()

    for filename in (
        f"Kanmail-mac-{version}.tar.gz",
        f"Kanmail-nix64-{version}.tar.gz",
        f"Kanmail-win-{version}.zip",
    ):
        if not path.exists(path.join("pyu-data", "new", filename)):
            try:
                print_and_run(
                    ("aws", "s3", "cp", f"s3://builds.kanmail.io/{filename}", "pyu-data/new")
                )
            except CalledProcessError:
                if not click.confirm(f"Error fetching build: {filename}, OK to skip?"):
                    raise

    # Now use `codesign` to sign the package with a Developer ID
    codesign_and_notarize(version)

    if not GITHUB_API_TOKEN:
        raise click.ClickException(
            "No `GITHUB_API_TOKEN` environment variable provided!",
        )

    docker_image_tag = f"{DOCKER_NAME}:{version}"

    try:
        # Check output to hide the JSON dump
        print_and_check_output(("docker", "image", "inspect", docker_image_tag))
    except CalledProcessError:
        if not click.confirm("No Docker image found, OK to skip?"):
            raise
    else:
        print_and_run(("docker", "push", docker_image_tag))
        docker_latest_tag = f"{DOCKER_NAME}:latest"
        print_and_run(("docker", "tag", docker_image_tag, docker_latest_tag))
        print_and_run(("docker", "push", docker_latest_tag))

    if not click.confirm(
        (
            f"Are you SURE v{version} is ready to release "
            "(commit changelog -> package -> sign -> upload)?"
        )
    ):
        raise click.Abort("User is not sure!")

    print_and_run(("pyupdater", "pkg", "--process", "--sign"))
    print_and_run(("pyupdater", "upload", "--service", "s3"))

    create_github_release(version)

    click.echo(f"--> Kanmail v{version} released!")

    if click.confirm("Run cleanup?", default=True):
        print_and_run(("python", "-m", "make.clean"))


@click.command()
@click.option("--complete-release", is_flag=True, default=False)
@click.option("--start-release", is_flag=True, default=False)
@click.option("--docker", is_flag=True, default=False)
@click.option("--onedir", is_flag=True, default=False)
@click.option("--version", default=None)
def build_or_release(complete_release, start_release, docker, version, onedir):
    click.echo("### Kanmail build & release script")
    click.echo()

    release_version = get_release_version()

    if complete_release and not release_version:
        raise click.UsageError("Cannot --complete-release, no tag exists!")

    if complete_release:
        click.echo("--> [3/3] completing relase")
        download_and_complete_release()
        return

    if start_release:
        click.echo("--> [1/3] preparing release")
        prepare_release()
        return

    if release_version:
        if version:
            raise click.UsageError("Cannot --version with git tag!")

        if onedir:
            raise click.UsageError("Cannot --onedir with git tag!")

    click.echo("--> [2*/3] building release")
    build_release(
        is_release=release_version is not None,
        docker=docker,
        build_version=version,
        onedir=onedir,
    )


if __name__ == "__main__":
    build_or_release()
