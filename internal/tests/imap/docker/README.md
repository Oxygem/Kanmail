# IMAP test servers

Real mail servers the `imaptest` suite runs Kanmail's IMAP implementation
against. `docker compose up -d --wait` here brings them all up; the Go tests do
the same automatically and tear them back down (`down --volumes`) when the run
finishes, so nothing is left behind - see `../doc.go`. To keep servers up across
runs, bring them up here by hand and set `KANMAIL_IMAPTEST_NO_COMPOSE=1`.

| service | host ports (143/993) | shape |
|---|---|---|
| `dovecot` | 11143 / 11993 | Maildir++, `.` delimiter, no prefix |
| `dovecot-fs` | 12143 / 12993 | Maildir `LAYOUT=fs`, `/` delimiter (Gmail/Fastmail/Outlook shape) |
| `dovecot-prefix` | 13143 / 13993 | Maildir++ under an `INBOX.` personal prefix, public namespace at `shared.` |
| `dovecot-nonamespace` | 14143 / 14993 | as `dovecot` but no NAMESPACE advertised |
| `courier` | 15143 / 15993 | Courier 5, `INBOX.` prefix, no MOVE/SPECIAL-USE/LITERAL+ |
| `cyrus` | 16143 / 16993 | Cyrus 3.6 default namespace (`/`, `Other Users/`, `Shared Folders/`) |
| `cyrus-legacy` | 17143 / 17993 | Cyrus 3.6 pre-3.0 namespace (`INBOX.`, `user.`, `""`) |
| `stalwart` | 18143 / 18993 (+18080 admin) | Stalwart 0.16, `/` delimiter, Outlook special-folder names |

The Dovecot images are `linux/amd64` (no arm64 build for 2.3.21), so they run
under emulation on Apple Silicon — hence `default_vsz_limit = 0` in
`dovecot/common.conf.inc`. Cyrus returns inconsistent mailbox views under
concurrent access across users, so its two targets run one env at a time
(`maxConcurrent: 1` in `../targets_test.go`); the others run several in parallel.
Known Kanmail interop gaps the suite surfaced are written up in `../FINDINGS.md`.

## Conventions every server follows

- **Users** `user1` … `user8`, password `password`, all provisioned at build or
  start so the first login works. Tests acquire a user, wipe its mailbox, use
  it, release it.
- **TLS** implicit on container port 993 and STARTTLS on 143, using the shared
  self-signed certificate the `certs` service writes into the `certs` volume
  (`/certs/cert.pem`, `/certs/key.pem`, `/certs/combined.pem` = cert+key,
  `/certs/dhparams.pem`; all mode 644). Kanmail connects with
  `KANMAIL_DEBUG_TLS_INSECURE` so the certificate only has to exist.
- **Connections** at least 50 concurrent per user/IP: Kanmail opens a pool of
  five per account and the tests run several accounts in parallel.
- **Foreground** process logging to stdout, exiting when the daemon dies, with
  a healthcheck the Go harness and `--wait` can rely on.
- **Host ports** `NN143` / `NN993` with a unique `NN` per service, listed in the
  target table in `../targets_test.go`.
- **Baseline folders**: whatever a fresh user on that server has (Dovecot and
  Cyrus auto-create `Sent`/`Drafts`/`Trash`/`Junk`, Courier is given
  `INBOX.Sent`/`INBOX.Drafts`/`INBOX.Trash`). The harness restores the
  baseline when it resets a user, so it is also in the target table.

## Adding a server

1. Add a directory with its Dockerfile / config, and a service in
   `docker-compose.yml` using the `*certs` anchor and the next free port pair.
2. Bring it up and probe it by hand (`openssl s_client -connect 127.0.0.1:NN993`
   then `a LOGIN user1 password`, `b NAMESPACE`, `c LIST "" "*"`).
3. Add a target to `../targets_test.go` with what the probe showed: the
   namespaces it reports, which special folders it maps and how, and any
   capabilities it lacks.
4. Run `KANMAIL_IMAPTEST=<name> go test ./internal/tests/imap/`.
