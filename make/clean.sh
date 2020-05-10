#!/bin/sh

rm -rf dist/*
rm -f dist/.release_version_lock
rm -f dist/.spec
rm -f dist/.changelog
rm -rf build/*
rm -rf pyu-data/new/*
git checkout -- CHANGELOG.md
