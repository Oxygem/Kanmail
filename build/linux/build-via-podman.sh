#!/bin/bash

set -exuo pipefail

arch=${ARCH:-}
appimageArch=

case "$arch" in
    amd64)
        appimageArch=x86_64
        ;;
    arm64)
        appimageArch=aarch64
        ;;
    *)
        echo >2 "Invalid arch: ${arch}"
        exit 1
esac

root_dir="$(readlink -f "$(dirname "$0")")/../.."

echo "Build build container..."
podman build -t kanmail-linux-build-$arch -f $root_dir/build/linux/Dockerfile --build-arg=arch=$arch $root_dir

cid=$(podman run --rm -d kanmail-linux-build-$arch tail -f /dev/null)

echo "Build AppImage..."
podman exec -it $cid bash -c ". /usr/local/nvm/nvm.sh && wails3 task linux:package"

echo "Copy AppImage..."
podman cp $cid:/opt/kanmail/kanmail-$appimageArch.AppImage $root_dir/bin/Kanmail-$arch.AppImage
echo "Wrote: bin/Kanmail-$arch.AppImage"

echo "Stop container..."
podman stop $cid
