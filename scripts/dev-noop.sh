#!/bin/sh

set -euxo pipefail

export KANMAIL_PROFILE=noop
wails3 task dev
