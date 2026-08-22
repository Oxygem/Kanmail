#!/bin/sh
# Starts Cyrus master in the foreground with the imapd.conf CYRUS_CONFIG selects
# ("default" or "legacy"). Cyrus only logs through syslog, so a busybox syslogd
# forwards everything to the container's stdout.
set -eu

case "${CYRUS_CONFIG:-default}" in
    default) ;;
    legacy) ln -sf /etc/imapd-legacy.conf /etc/imapd.conf ;;
    *) echo "unknown CYRUS_CONFIG '$CYRUS_CONFIG' (default|legacy)" >&2; exit 1 ;;
esac

busybox syslogd -n -O /dev/stdout &
exec /usr/lib/cyrus/bin/master -D -C /etc/imapd.conf -M /etc/cyrus.conf
