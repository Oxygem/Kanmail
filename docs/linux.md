[← back to docs](./README.md)

# Linux

Kanmail for Linux is built using an Ubuntu 16 Docker container and is officially supported on Ubuntu systems. Kanmail has been tested with the following Linux distributions.

## Ubuntu / Manjaro / Mint / elementaryOS

Confirmed working on Ubuntu 18/20, Manjaro 20, Mint 19, elementaryOS 5.

May require webkit2 if needed:

```
sudo apt install libwebkit2gtk-4.0
```

## Debian

Not working, could not intialize GTK?

## Fedora

Not working (Fedora Workstation 32) due to `libbz2` not found (but it exists)?
