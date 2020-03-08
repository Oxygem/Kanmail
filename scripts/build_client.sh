#!/bin/sh

set -ex

scripts/build_release.py --build-only $@
