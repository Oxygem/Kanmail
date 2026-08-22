// Package imaptest runs Kanmail's IMAP implementation against real mail servers
// in Docker - Dovecot in several namespace shapes, Courier, Cyrus & Stalwart.
//
// The tests are skipped unless KANMAIL_IMAPTEST names the servers to run
// against: "all", or a comma separated list of target names from targets.go.
//
//	KANMAIL_IMAPTEST=all go test ./internal/tests/imap/
//	KANMAIL_IMAPTEST=courier,cyrus go test ./internal/tests/imap/ -run Move -v
//
// Every server has the users user1..user8 with the password "password". A test
// borrows one, wipes its mailbox back to the server's baseline and drives a
// real emails.Account at it, while a second, direct go-imap connection plays
// the other client: seeding mail, deleting it behind Kanmail's back, checking
// what the server ended up with.
//
// The servers are brought up with docker compose before the tests and torn down
// again after them, leaving nothing running.
//
// Other knobs: KANMAIL_IMAPTEST_NO_COMPOSE=1 skips both the compose up and the
// tear down (the servers are managed by hand, and stay up between runs),
// KANMAIL_IMAPTEST_DEBUG=1 logs at trace level and dumps the raw IMAP
// conversation.
package imaptest

import (
	"os"
	"testing"

	"github.com/oxygem/kanmail/internal/constants"
)

func TestMain(m *testing.M) {
	spec := os.Getenv("KANMAIL_IMAPTEST")
	if spec == "" {
		os.Exit(m.Run())
	}
	targets = selectTargets(spec)

	constants.ENV_DEBUG_TLS_INSECURE = "1"
	if debug {
		constants.ENV_DEBUG_IMAP_IO = "1"
	}

	compose := os.Getenv("KANMAIL_IMAPTEST_NO_COMPOSE") == ""
	if compose {
		composeUp(targets)
	}
	waitForServers(targets)

	for _, tg := range targets {
		n := tg.concurrency()
		pool := make(chan string, n)
		for i := 1; i <= n; i++ {
			pool <- tg.user(i)
		}
		userPools[tg.name] = pool
	}

	code := m.Run()
	if compose {
		composeDown()
	}
	os.Exit(code)
}
