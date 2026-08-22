package imaptest

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/oxygem/kanmail/internal/emails"
)

// The extensions Kanmail relies on (and those it must cope without) are what
// the target table says they are - a change here means the server changed or
// the table is wrong, either way every other test's expectations need a look.
func TestCapabilities(t *testing.T) {
	forEachTarget(t, func(t *testing.T, tg *target) {
		e := newEnv(t, tg)

		caps, err := e.account.FetchCapabilities(e.ctx)
		require.NoError(t, err)
		for _, cap := range tg.caps {
			assert.True(t, caps.Has(cap), "expected capability %s", cap)
		}
		for _, cap := range tg.noCaps {
			assert.False(t, caps.Has(cap), "unexpected capability %s", cap)
		}
	})
}

// STARTTLS on the plain port reaches the same server as implicit TLS
func TestStartTLS(t *testing.T) {
	forEachTarget(t, func(t *testing.T, tg *target) {
		e := newEnv(t, tg)

		settings := tg.accountSettings(e.user)
		settings.IMAPSettings.Port = tg.plainPort
		settings.IMAPSettings.SSL = false
		settings.IMAPSettings.StartTLS = true
		account := emails.NewAccount(settings, e.caches, nil)
		t.Cleanup(func() { account.CloseConnections(e.ctx) })

		caps, err := account.FetchCapabilities(e.ctx)
		require.NoError(t, err)
		for _, cap := range tg.caps {
			assert.True(t, caps.Has(cap), "expected capability %s", cap)
		}
	})
}

// A wrong password fails fast, not after the network retry budget - servers
// say AUTHENTICATIONFAILED, or at least NO, neither of which is transient
func TestWrongPasswordFailsFast(t *testing.T) {
	forEachTarget(t, func(t *testing.T, tg *target) {
		e := newEnv(t, tg)

		settings := tg.accountSettings(e.user)
		settings.IMAPSettings.Password = "wrong"
		account := emails.NewAccount(settings, e.caches, nil)
		t.Cleanup(func() { account.CloseConnections(e.ctx) })

		started := time.Now()
		_, err := account.FetchCapabilities(e.ctx)
		assert.Error(t, err)
		assert.Less(t, time.Since(started), 10*time.Second, "should not retry a rejected login")
	})
}

// Plain text credentials are refused before anything is sent
func TestRefusesPlaintextCredentials(t *testing.T) {
	forEachTarget(t, func(t *testing.T, tg *target) {
		e := newEnv(t, tg)

		settings := tg.accountSettings(e.user)
		settings.IMAPSettings.Port = tg.plainPort
		settings.IMAPSettings.SSL = false
		account := emails.NewAccount(settings, e.caches, nil)
		t.Cleanup(func() { account.CloseConnections(e.ctx) })

		_, err := account.FetchCapabilities(e.ctx)
		assert.ErrorContains(t, err, "unencrypted")
	})
}

// The whole pool, regular and priority, serving many folders at once: the
// connection budget is five, the work here needs more than that concurrently
func TestConcurrentFolderAccess(t *testing.T) {
	forEachTarget(t, func(t *testing.T, tg *target) {
		e := newEnv(t, tg)
		names := []string{"INBOX", tg.qualify("Alpha"), tg.qualify("Beta"), tg.qualify("Gamma"), tg.qualify("Delta")}
		for _, name := range names {
			if name != "INBOX" {
				e.createMailbox(name)
			}
			e.seed(name, 3)
		}

		errs := make(chan error, len(names)*3)
		for _, name := range names {
			folder := e.folder(name)
			for range 3 {
				go func() {
					if _, err := folder.PaginateEmails(e.ctx, emails.PaginateOptions{BatchSize: 10}); err != nil {
						errs <- err
						return
					}
					if _, err := folder.SyncEmails(e.ctx); err != nil {
						errs <- err
						return
					}
					_, err := folder.SearchEmails(e.ctx, "message", 10)
					errs <- err
				}()
			}
		}
		for range cap(errs) {
			assert.NoError(t, <-errs)
		}

		for _, name := range names {
			resp, err := e.folder(name).PaginateEmails(e.ctx, emails.PaginateOptions{BatchSize: 10, Reset: true})
			require.NoError(t, err, name)
			assert.Len(t, resp.Emails, 3, name)
		}
	})
}
