#!/bin/sh

set -ex


docker build \
    -t kanmail-ubuntu-linux-build \
    -f make/Dockerfile-ubuntu-linux-build \
    .

docker run \
    -v `pwd`:/opt/kanmail \
    -e SENTRY_DSN=$SENTRY_DSN \
    -e POSTHOG_API_KEY=$POSTHOG_API_KEY \
    -e GOOGLE_OAUTH_CLIENT_ID=$GOOGLE_OAUTH_CLIENT_ID \
    -e GOOGLE_OAUTH_CLIENT_SECRET=$GOOGLE_OAUTH_CLIENT_SECRET \
    kanmail-ubuntu-linux-build \
    python -m make $@
