from subprocess import check_output, run

import click


def print_and_run(command):
    click.echo(f'--> {command}')
    return run(command, check=True)


def print_and_check_output(command):
    click.echo(f'--> {command}')
    return (
        check_output(command)
        .decode()  # bytes -> str
        .strip()
    )
