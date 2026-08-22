# Kanmail IMAP test server: Cyrus IMAP 3.6 from Debian bookworm. One image, two
# configurations picked at start by CYRUS_CONFIG (see entrypoint.sh):
#   default  altnamespace + unixhierarchysep, personal folders beside INBOX, "/"
#   legacy   the pre-3.0 shape, personal folders under "INBOX.", "." delimiter
FROM debian:bookworm-slim

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        cyrus-imapd sasl2-bin libsasl2-modules-db busybox \
    && rm -rf /var/lib/apt/lists/*

COPY cyrus.conf imapd.conf imapd-legacy.conf /etc/
COPY entrypoint.sh /usr/local/bin/

# user1..user8 (and the cyrus admin) in the sasldb the auxprop plugin reads,
# under the realm imapd.conf's servername selects
RUN for user in user1 user2 user3 user4 user5 user6 user7 user8 cyrus; do \
        echo password | saslpasswd2 -c -p -u localhost "$user"; \
    done \
    && chown cyrus:mail /etc/sasldb2 && chmod 640 /etc/sasldb2 \
    && /usr/sbin/cyrus makedirs

EXPOSE 143 993
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
