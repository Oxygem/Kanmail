package oauth

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/oxygem/kanmail/internal/types"
)

func withTokenInfoEndpoint(t *testing.T, url string) {
	t.Helper()
	orig := googleTokenInfoEndpoint
	googleTokenInfoEndpoint = url
	t.Cleanup(func() {
		googleTokenInfoEndpoint = orig
		clearTokenDiagnoses()
	})
}

// The access token must never travel in the URL: it would land in the request
// log line, and in the URL any failed transport quotes back in its error.
func TestDescribeToken(t *testing.T) {
	for _, tc := range []struct {
		name              string
		response          string
		status            int
		want              []string
		wantEmpty         bool
		wantTokenSpecific bool
	}{
		{
			name:              "provider rejects the token",
			status:            http.StatusBadRequest,
			response:          `{"error":"invalid_token","error_description":"expired"}`,
			want:              []string{"rejects the access token itself", "invalid_token", "expired"},
			wantTokenSpecific: true,
		},
		{
			name:     "mail scope never granted",
			response: `{"scope":"openid email","email":"user@example.com"}`,
			want:     []string{"never granted https://mail.google.com/"},
		},
		{
			name:     "token for somebody else",
			response: `{"scope":"https://mail.google.com/","email":"other@example.com"}`,
			want:     []string{"belongs to other@example.com, not user@example.com"},
		},
		{
			name:     "grant in order, mailbox refusing",
			response: `{"scope":"https://mail.google.com/","email":"user@example.com"}`,
			want:     []string{"refusing IMAP access"},
		},
		{
			// An absent scope proves nothing about the grant - a made-up
			// "never granted" instruction would send the user to re-consent
			// for no reason
			name:      "provider does not report the scope",
			response:  `{"email":"user@example.com"}`,
			wantEmpty: true,
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.RawQuery != "" {
					t.Error("the access token must travel in the body, not the URL")
				}
				if r.FormValue("access_token") != "at-1" {
					t.Errorf("access_token = %q, want at-1", r.FormValue("access_token"))
				}
				if tc.status != 0 {
					w.WriteHeader(tc.status)
				}
				w.Write([]byte(tc.response))
			}))
			defer server.Close()
			withTokenInfoEndpoint(t, server.URL)

			diagnosis, tokenSpecific := describeToken(
				context.Background(), oauthServices["gmail"], "user@example.com", "at-1")

			if tc.wantEmpty && diagnosis != "" {
				t.Fatalf("diagnosis = %q, want none", diagnosis)
			}
			for _, want := range tc.want {
				if !strings.Contains(diagnosis, want) {
					t.Fatalf("diagnosis = %q, want it to mention %q", diagnosis, want)
				}
			}
			if tokenSpecific != tc.wantTokenSpecific {
				t.Fatalf("tokenSpecific = %v, want %v", tokenSpecific, tc.wantTokenSpecific)
			}
		})
	}
}

// A reconnect stores a new refresh token, and its failures must not inherit
// the previous grant's diagnosis - while the retry loop on one grant must not
// probe the provider on every attempt.
func TestDiagnoseTokenCachesPerGrant(t *testing.T) {
	var probes atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		probes.Add(1)
		w.Write([]byte(`{"scope":"openid","email":"user@example.com"}`))
	}))
	defer server.Close()
	withTokenInfoEndpoint(t, server.URL)

	conf := types.ConnectionSettings{
		OAuthProvider:     "gmail",
		OAuthRefreshToken: "rt-1",
		Username:          "user@example.com",
	}

	first := diagnoseToken(context.Background(), conf, "at-1")
	// The retry mints a fresh access token for the same grant
	second := diagnoseToken(context.Background(), conf, "at-2")
	if first == "" || first != second {
		t.Fatalf("diagnoses = %q / %q, want the same non-empty answer", first, second)
	}
	if got := probes.Load(); got != 1 {
		t.Fatalf("probes = %d, want the second attempt served from cache", got)
	}

	conf.OAuthRefreshToken = "rt-2"
	if diagnoseToken(context.Background(), conf, "at-3"); probes.Load() != 2 {
		t.Fatal("a new grant must be probed afresh, not answered for the old one")
	}
}

// "This token is expired" is true of one minted token, not of the grant - the
// next attempt carries a different token, so the answer must not be reused.
func TestDiagnoseTokenDoesNotCacheTokenSpecificAnswers(t *testing.T) {
	var probes atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		probes.Add(1)
		w.WriteHeader(http.StatusBadRequest)
		w.Write([]byte(`{"error":"invalid_token"}`))
	}))
	defer server.Close()
	withTokenInfoEndpoint(t, server.URL)

	conf := types.ConnectionSettings{
		OAuthProvider:     "gmail",
		OAuthRefreshToken: "rt-1",
		Username:          "user@example.com",
	}

	diagnoseToken(context.Background(), conf, "at-1")
	diagnoseToken(context.Background(), conf, "at-2")
	if got := probes.Load(); got != 2 {
		t.Fatalf("probes = %d, want each token inspected for itself", got)
	}
}
