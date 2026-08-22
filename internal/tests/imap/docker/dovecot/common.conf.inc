# Shared by every Dovecot variant
log_path = /dev/stdout
auth_verbose = yes
listen = *
protocols = imap

# Service address space limits fail under Rosetta emulation on arm64 hosts
default_vsz_limit = 0

mail_home = /srv/mail/%Lu
mail_uid = 1000
mail_gid = 1000
first_valid_uid = 1000
last_valid_uid = 1000
mail_max_userip_connections = 100

# Any username logs in with the password "password"
auth_mechanisms = plain login
passdb {
  driver = static
  args = password=password
}
userdb {
  driver = static
  args = uid=1000 gid=1000 home=/srv/mail/%Lu
}

ssl = yes
ssl_cert = </certs/cert.pem
ssl_key = </certs/key.pem

service imap-login {
  inet_listener imap {
    port = 143
  }
  inet_listener imaps {
    port = 993
    ssl = yes
  }
}
