#!/bin/sh

set -euxo pipefail

ARCH=amd64 CC=x86_64-w64-mingw32-gcc wails3 task windows:build
