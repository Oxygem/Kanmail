# Kanmail IMAP test server: Courier IMAP 5.0 (Debian bookworm), Maildir++ with
# the personal namespace under "INBOX." - the classic Courier shape. See
# ../README.md for the conventions (users, TLS, ports) every server follows.
FROM debian:bookworm-slim

# courier-imap hard-depends on an MTA it never uses here; a dummy package that
# provides mail-transport-agent keeps exim and friends out of the image. The
# self-signed cert Debian generates is dropped in favour of the shared /certs.
RUN set -eux; \
    export DEBIAN_FRONTEND=noninteractive; \
    mkdir -p /tmp/mta-dummy/DEBIAN; \
    printf 'Package: mta-dummy\nVersion: 1.0\nArchitecture: all\nMaintainer: Kanmail imaptest <nobody@invalid>\nProvides: mail-transport-agent\nDescription: dummy mail-transport-agent so courier-imap installs without one\n' \
        > /tmp/mta-dummy/DEBIAN/control; \
    dpkg-deb --build /tmp/mta-dummy /tmp/mta-dummy.deb; \
    dpkg -i /tmp/mta-dummy.deb; \
    apt-get update; \
    apt-get install -y --no-install-recommends courier-imap courier-authlib-userdb; \
    rm -rf /var/lib/apt/lists/* /tmp/mta-dummy /tmp/mta-dummy.deb; \
    rm -f /etc/courier/imapd.pem /etc/courier/dhparams.pem

COPY imapd imapd-ssl authdaemonrc /etc/courier/
COPY provision-users.sh entrypoint.sh /usr/local/bin/

RUN chmod 0640 /etc/courier/authdaemonrc && chgrp courier /etc/courier/authdaemonrc && provision-users.sh

EXPOSE 143 993
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
