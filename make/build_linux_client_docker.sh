#!/bin/sh

set -ex


docker build \
    -t kanmail-ubuntu-linux-build \
    -f make/Dockerfile-ubuntu-linux-build \
    .

docker run \
    -v `pwd`:/opt/kanmail \
    kanmail-ubuntu-linux-build \
    make
