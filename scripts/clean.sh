#!/bin/sh

set -ex

echo "--> nuking dist/ & build/"
rm -rf dist/*
rm -f dist/.release_version_lock
rm -f dist/.spec
rm -rf build/*

echo "--> nuking anything in pyu-data/new"
rm -rf pyu-data/new/*

echo "--> nuking CHANGELOG.md changes"
git checkout -- CHANGELOG.md
