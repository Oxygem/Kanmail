#!/bin/sh

echo "--> yarn build"
yarn run build

echo "--> pyinstaller build"
pyinstaller main.py \
    --windowed \
    --name Kanmail \
    --icon make/Kanmail.icns \
    --add-data kanmail/client/static:static \
    --add-data kanmail/client/templates:templates \
    --add-data dist/main.js:static/dist \

# Cleanup
rm -f Kanmail.spec
