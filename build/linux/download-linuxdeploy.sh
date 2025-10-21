#!/bin/bash

set -euxo pipefail

arch="$(arch)"

echo "Got arch: $arch"

if [ "$arch" = "aarch64" ]; then
    wget -c "https://github.com/linuxdeploy/linuxdeploy/releases/download/continuous/linuxdeploy-aarch64.AppImage"
    chmod +x linuxdeploy-aarch64.AppImage
    mv linuxdeploy-aarch64.AppImage /usr/local/bin/linuxdeploy
else
    wget -c "https://github.com/linuxdeploy/linuxdeploy/releases/download/continuous/linuxdeploy-x86_64.AppImage"
    chmod +x linuxdeploy-x86_64.AppImage
    mv linuxdeploy-x86_64.AppImage /usr/local/bin/linuxdeploy
fi
