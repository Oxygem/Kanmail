#!/bin/sh

set -ex

scripts/release.py --build-only $@
