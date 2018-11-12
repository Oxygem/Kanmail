#!/bin/sh

set -ex

TLD_PACKAGE_DIR=`python -c 'from os import path;import tld;print(path.dirname(tld.__file__))'`

yarn run build

pyinstaller main.py \
    --windowed \
    --name Kanmail \
    --icon make/Kanmail.icns \
    --add-data kanmail/client/static:static \
    --add-data kanmail/client/templates:templates \
    --add-data dist/main.js:static/dist \
    --add-data ${TLD_PACKAGE_DIR}/res/effective_tld_names.dat.txt:tld/res

# Cleanup
rm -f Kanmail.spec
