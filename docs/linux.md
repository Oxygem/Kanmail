[← back to docs](./README.md)

# Linux

Kanmail for Linux is built using an Ubuntu 16 Docker container and is officially supported on Ubuntu systems. Kanmail has been tested with the following Linux distributions.

## Apt systems

### Ubuntu / Mint / elementaryOS

Confirmed working on Ubuntu 18/20, Mint 19, elementaryOS 5.

May require webkit2 if needed:

```
sudo apt install libwebkit2gtk-4.0
```

Note for elementaryOS: only works when run as root, needs investigation.

### Debian

Not working, issue with `libpng12`. Has the same `libpng16` installed as Ubuntu but doesn't work. Needs investigation.

## Yum systems

### Fedora

Confirmed working on Fedora Workstation 32.

## Pacman systems

### Manjaro

Confirmed working on Manjaro 20 XFCE desktop.
