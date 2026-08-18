package oauth

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/oxygem/kanmail/internal/types"
)

// The challenge is the only place the status code and the scope the server
// wanted ever appear - a login that reports just one of them cannot be told
// apart from any other rejection.
func TestXoauth2ErrorReportsWholeChallenge(t *testing.T) {
	for _, tc := range []struct {
		name      string
		challenge string
		want      []string
	}{
		{
			name:      "google error challenge",
			challenge: `{"status":"400","schemes":"Bearer","scope":"https://mail.google.com/"}`,
			want:      []string{"400", "https://mail.google.com/", "Bearer"},
		},
		{
			name:      "server answered with something else entirely",
			challenge: "not json at all",
			want:      []string{"not json at all"},
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			client := NewXoauth2Client("user@example.com", "at-1").(*xoauth2Client)
			if _, err := client.Next([]byte(tc.challenge)); err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if client.err == nil {
				t.Fatal("challenge was not recorded")
			}
			for _, want := range tc.want {
				if !strings.Contains(client.err.Error(), want) {
					t.Fatalf("Error() = %q, want it to mention %q", client.err.Error(), want)
				}
			}
		})
	}
}

// Providers only send the reason a human can act on ("Invalid credentials",
// "IMAP access is disabled for your domain") after the client answers their
// error challenge. Failing the exchange here abandons the command first.
func TestXoauth2NextAnswersErrorChallenge(t *testing.T) {
	client := NewXoauth2Client("user@example.com", "at-1")

	resp, err := client.Next([]byte(`{"status":"400"}`))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp == nil || len(resp) != 0 {
		t.Fatalf("response = %q, want an empty (non-nil) response", resp)
	}

	// A server that keeps challenging instead of failing the command would
	// otherwise loop forever
	if _, err := client.Next([]byte(`{"status":"400"}`)); err == nil {
		t.Fatal("expected the exchange to end on a second challenge")
	}
}

func TestDiagnoseAuthErrorJoinsChallengeAndResponse(t *testing.T) {
	client := NewXoauth2Client("user@example.com", "at-1")
	if _, err := client.Next([]byte(`{"status":"400","scope":"https://mail.google.com/"}`)); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	serverErr := errors.New("NO [ALERT] Invalid credentials (Failure)")
	// No provider set, so the token probe is skipped - this asserts the two
	// halves of the failure are reported together, nothing more
	err := DiagnoseAuthError(context.Background(), types.ConnectionSettings{}, "at-1", client, serverErr)

	for _, want := range []string{"400", "https://mail.google.com/", "Invalid credentials"} {
		if !strings.Contains(err.Error(), want) {
			t.Fatalf("Error() = %q, want it to mention %q", err.Error(), want)
		}
	}
	if !errors.Is(err, serverErr) {
		t.Fatal("the server's own error must stay in the chain")
	}
}
