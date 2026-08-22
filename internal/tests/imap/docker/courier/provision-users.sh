#!/bin/bash
# Build-time: creates user1..user8 (password "password") in Courier's userdb,
# each with a Maildir owned by the vmail user holding the subscribed baseline
# folders INBOX.Sent, INBOX.Drafts and INBOX.Trash.
set -euo pipefail

groupadd -g 5000 vmail
useradd -u 5000 -g 5000 -d /srv/mail -s /usr/sbin/nologin vmail

for i in $(seq 1 8); do
    user=user$i
    home=/srv/mail/$user
    maildir=$home/Maildir

    mkdir -p "$home"
    maildirmake "$maildir"
    echo INBOX > "$maildir/courierimapsubscribed"
    for folder in Sent Drafts Trash; do
        maildirmake -f "$folder" "$maildir"
        echo "INBOX.$folder" >> "$maildir/courierimapsubscribed"
    done
    chown -R vmail:vmail "$home"

    userdb "$user" set home="$home" uid=5000 gid=5000
    echo password | userdbpw -md5 | userdb "$user" set imappw
done

makeuserdb
