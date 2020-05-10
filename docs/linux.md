[← back to docs](./README.md)

# Linux

Kanmail for Linux is built using an Ubuntu 16 Docker container. Kanmail has been tested with the following Linux distributions.

## Ubuntu / Debian / Manjaro / Mint

Confirmed working on Ubuntu 18/20, Manjaro 20, Mint 19.

## Fedora

Not working (Fedora Workstation 32) due to `libbz2` not found (but it exists)?

## elementaryOS

Tested on elementaryOS 5, needs webkit2 installed:

```
sudo apt install libwebkit2gtk-4.0
```

But - only works w/sudo?
