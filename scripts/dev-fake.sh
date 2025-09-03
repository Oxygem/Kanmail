#!/bin/sh

set -euxo pipefail

export KANMAIL_PROFILE=dev-fake
export KANMAIL_DEBUG_CACHES_DISABLE=1
export KANMAIL_DEBUG_FAKE_IMAP=${1:-on}
wails3 dev
