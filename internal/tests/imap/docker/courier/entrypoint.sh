#!/bin/bash
# Runs authdaemond, imapd (143, STARTTLS) and imapd-ssl (993) in the foreground
# the way Debian's /usr/lib/courier/imapd{,-ssl} rc scripts do, minus
# courierlogger (so everything logs straight to the container's stderr) and the
# per-IP imapaccess file. Exits as soon as any of the three dies.
set -euo pipefail

set -a
. /etc/courier/authdaemonrc
. /etc/courier/imapd
. /etc/courier/imapd-ssl
set +a

mkdir -p "$authdaemonvar"
chown courier:courier "$authdaemonvar"
chmod 750 "$authdaemonvar"

umask "$IMAP_UMASK"
if [ -n "${TLS_CACHEFILE:-}" ]; then
    rm -f "$TLS_CACHEFILE"
    touch "$TLS_CACHEFILE"
    chown courier:courier "$TLS_CACHEFILE"
    chmod 600 "$TLS_CACHEFILE"
fi
if [ -n "${IMAP_ULIMITD:-}" ]; then
    ulimit -v "$IMAP_ULIMITD"
fi

trap 'kill $(jobs -p) 2>/dev/null' EXIT
trap exit TERM INT

/usr/lib/courier/courier-authlib/authdaemond &

for _ in $(seq 50); do
    [ -S "$authdaemonvar/socket" ] && break
    sleep 0.1
done
[ -S "$authdaemonvar/socket" ] || { echo "authdaemond did not start" >&2; exit 1; }

IMAP_STARTTLS=$IMAPDSTARTTLS /usr/sbin/couriertcpd \
    -address="$ADDRESS" -maxprocs="$MAXDAEMONS" -maxperip="$MAXPERIP" $TCPDOPTS \
    "$PORT" /usr/lib/courier/courier/imaplogin /usr/bin/imapd "$MAILDIRPATH" &

IMAP_TLS=1 /usr/sbin/couriertcpd \
    -address="$SSLADDRESS" -maxprocs="$MAXDAEMONS" -maxperip="$MAXPERIP" $TCPDOPTS \
    "$SSLPORT" "$COURIERTLS" -server -tcpd -user=courier \
    /usr/lib/courier/courier/imaplogin /usr/bin/imapd "$MAILDIRPATH" &

echo "courier-imap listening on $PORT (STARTTLS) and $SSLPORT (TLS)" >&2
wait -n
echo "a courier daemon exited, stopping" >&2
exit 1
