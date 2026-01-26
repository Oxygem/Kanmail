#!/bin/bash

set -euxo pipefail

if [ -z "${1:-}" ] || [ "${1}" = "sast" ]; then
    echo "Performing SAST scan..."
    docker build -t kanmail-scan-sast -f ./build/security/Dockerfile-sast .
    docker run kanmail-scan-sast sast --strict scan /opt/kanmail/build/security/scanner.yaml
fi

if [ -z "${1:-}" ] || [ "${1}" = "sca" ]; then
    echo "Performing SCA scan..."
    docker build -t kanmail-scan-sca -f ./build/security/Dockerfile-sca .
    docker run kanmail-scan-sca sca scan /opt/kanmail/build/security/scanner.yaml
fi
