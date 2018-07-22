#!/bin/sh

set -e 

echo "--> Building webpack..."
yarn run build

CMD="pyinstaller boot.py \
    --windowed \
    --name Kanmail \
    --icon pyinstaller/Kanmail.icns \
    --add-data kanmail/client/static:static \
    --add-data kanmail/client/templates:templates \
    --add-data dist/main.js:static/dist \
    $@"

echo "--> Running: $CMD"
$CMD

echo "--> Copying custom Info.plist"
cp pyinstaller/Info.plist dist/Kanmail.app/Contents/Info.plist

echo "<-- dist/Kanmail.app Build!"
