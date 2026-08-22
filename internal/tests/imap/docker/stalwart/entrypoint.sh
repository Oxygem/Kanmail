#!/bin/bash
# Kanmail IMAP test server: Stalwart 0.16
#
# Stalwart keeps everything but the data store location in its database and
# reads listeners, TLS and most settings only at startup, so this starts the
# server once to provision it over the JMAP management API, then restarts it
# in the foreground. Provisioning is idempotent: existing objects are kept and
# singletons are rewritten. The readiness marker keeps the healthcheck from
# passing while the provisioning instance is up.
set -euo pipefail

api=http://127.0.0.1:8080/jmap
auth=admin:password # STALWART_RECOVERY_ADMIN in docker-compose.yml
ready=/tmp/kanmail-ready
# sha512-crypt of "password"; a pre-hashed secret skips the password strength
# policy, which rejects "password" as a top-10 common password
hash='$6$kanmail$njk8/NZ.efhdguwAQcBGoRYfM8YqvO/jJ/TnC1dZU9iQ/u5B8Dq.9Srl3wN.Tf7fuhjkomHsesAs/b9H/LP4T.'

rm -f "$ready"
stalwart --config /etc/stalwart/config.json &
server=$!
trap 'kill $server 2>/dev/null' TERM INT

for _ in $(seq 150); do
  curl -fs -u "$auth" -o /dev/null "$api/session" && break
  sleep 0.2
done
account=$(curl -fs -u "$auth" "$api/session" | grep -o '"urn:stalwart:jmap":"[^"]*"' | cut -d'"' -f4)

# jmap METHOD [ARGS]: one JMAP method call, prints the response
jmap() {
  local args="\"accountId\":\"$account\""
  [ -z "${2:-}" ] || args="$args,$2"
  curl -fs -u "$auth" -H 'Content-Type: application/json' "$api" -d \
    "{\"using\":[\"urn:ietf:params:jmap:core\",\"urn:stalwart:jmap\"],\"methodCalls\":[[\"$1\",{$args},\"c\"]]}"
}

# ids TYPE [FILTER]: ids of the matching objects
ids() {
  jmap "$1/query" "${2:+\"filter\":$2}" | grep -o '"ids":\[[^]]*\]' | sed 's/"ids":\[//; s/\]//; s/"//g; s/,/ /g'
}

# create TYPE KEY JSON: creates the object unless it already exists
create() {
  local out
  out=$(jmap "$1/set" "\"create\":{\"$2\":$3}")
  case "$out" in
    *'"created"'* | *primaryKeyViolation*) ;;
    *) echo "stalwart: creating $1 $2 failed: $out" >&2; exit 1 ;;
  esac
}

# update TYPE ID JSON
update() {
  local out
  out=$(jmap "$1/set" "\"update\":{\"$2\":$3}")
  case "$out" in
    *'"updated"'*) ;;
    *) echo "stalwart: updating $1 $2 failed: $out" >&2; exit 1 ;;
  esac
}

# Log to stdout instead of /var/log/stalwart
tracer='{"@type":"Stdout","ansi":false,"level":"info","enable":true}'
tracers=$(ids x:Tracer)
if [ -z "$tracers" ]; then
  create x:Tracer t "$tracer"
else
  for id in $tracers; do update x:Tracer "$id" "$tracer"; done
fi

# The shared test certificate; without one Stalwart generates a self-signed one
cert=$(ids x:Certificate | cut -d' ' -f1)
if [ -z "$cert" ]; then
  create x:Certificate c '{"certificate":{"@type":"File","filePath":"/certs/cert.pem"},"privateKey":{"@type":"File","filePath":"/certs/key.pem"}}'
  cert=$(ids x:Certificate | cut -d' ' -f1)
fi

# IMAP with STARTTLS on 143; the default listeners only cover implicit TLS on 993
create x:NetworkListener imap '{"name":"imap","bind":{"[::]:143":true},"protocol":"imap","useTls":true,"tlsImplicit":false}'

create x:Domain d '{"name":"example.org"}'
domain=$(ids x:Domain '{"name":"example.org"}')
for n in 1 2 3 4 5 6 7 8; do
  create x:Account "u$n" "{\"@type\":\"User\",\"name\":\"user$n\",\"domainId\":\"$domain\",\"credentials\":{\"0\":{\"@type\":\"Password\",\"secret\":\"$hash\"}}}"
done

# The default domain lets a bare "userN" log in as userN@example.org
update x:SystemSettings singleton "{\"defaultHostname\":\"mail.example.org\",\"defaultDomainId\":\"$domain\",\"defaultCertificateId\":\"$cert\"}"
# No connection, request or failed-login limits: the tests open many
# connections per account and hundreds of sessions a minute
update x:Imap singleton '{"maxConcurrent":1000,"maxAuthFailures":20,"maxRequestRate":null}'
update x:Security singleton '{"authBanRate":null,"loiterBanRate":null,"abuseBanRate":null}'
# No ASN/GeoIP database downloads at startup
update x:Asn singleton '{"@type":"Disabled"}'

kill "$server"
wait "$server" || true
touch "$ready"
exec stalwart --config /etc/stalwart/config.json
