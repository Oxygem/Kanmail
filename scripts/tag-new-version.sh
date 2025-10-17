#!/bin/sh

set -euo pipefail

if [[ -n "$(git status -s)" ]]; then
    echo "Uncommitted changes, refusing to release!"
    exit 1
fi

export KANMAIL_APP_VERSION="2.$(date '+%y%m%d%H%M%S')"

git tag -a $KANMAIL_APP_VERSION -m $KANMAIL_APP_VERSION
git push --atomic origin 2.x $KANMAIL_APP_VERSION
