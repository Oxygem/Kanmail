package oauth

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"github.com/oxygem/kanmail/internal/util"
)

// withTokenEndpoint points a provider at a test server for the duration of a
// test, restoring the real configuration afterwards.
func withTokenEndpoint(t *testing.T, provider, endpoint string) {
	t.Helper()
	original := oauthServices[provider]
	service := original
	service.tokenEndpoint = endpoint
	oauthServices[provider] = service
	t.Cleanup(func() {
		oauthServices[provider] = original
		ClearOAuthAccessTokens()
	})
	ClearOAuthAccessTokens()
}

func TestTokenErrorClassification(t *testing.T) {
	for _, tc := range []struct {
		name        string
		err         *TokenError
		wantReauth  bool
		wantMessage string
	}{
		{
			name:        "revoked grant",
			err:         &TokenError{Provider: "gmail", Code: "invalid_grant", Description: "Token has been expired or revoked.", StatusCode: 400},
			wantReauth:  true,
			wantMessage: "gmail oauth token error: invalid_grant: Token has been expired or revoked.",
		},
		{
			name:        "consent withdrawn",
			err:         &TokenError{Provider: "outlook", Code: "consent_required", StatusCode: 400},
			wantReauth:  true,
			wantMessage: "outlook oauth token error: consent_required",
		},
		{
			name:       "server side failure",
			err:        &TokenError{Provider: "gmail", Code: "temporarily_unavailable", StatusCode: 503},
			wantReauth: false,
		},
		{
			name:        "non-oauth error body",
			err:         &TokenError{Provider: "gmail", StatusCode: 502},
			wantReauth:  false,
			wantMessage: "gmail oauth token error: HTTP 502",
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := util.IsReauthRequired(tc.err); got != tc.wantReauth {
				t.Fatalf("IsReauthRequired(%v) = %v, want %v", tc.err, got, tc.wantReauth)
			}
			// The sentinel must survive wrapping - callers add context on the
			// way up (which connection, which account) before it's classified.
			wrapped := errors.Join(errors.New("failed imap oauth login"), tc.err)
			if got := util.IsReauthRequired(wrapped); got != tc.wantReauth {
				t.Fatalf("IsReauthRequired(wrapped) = %v, want %v", got, tc.wantReauth)
			}
			if tc.wantMessage != "" && tc.err.Error() != tc.wantMessage {
				t.Fatalf("Error() = %q, want %q", tc.err.Error(), tc.wantMessage)
			}
		})
	}
}

func TestGetOAuthAccessTokenCachesRevokedGrant(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		w.Write([]byte(`{"error": "invalid_grant", "error_description": "Token has been expired or revoked."}`))
	}))
	defer server.Close()
	withTokenEndpoint(t, "gmail", server.URL)

	for i := range 3 {
		_, err := GetOAuthAccessToken(context.Background(), "gmail", "dead-token")
		if !util.IsReauthRequired(err) {
			t.Fatalf("attempt %d: err = %v, want re-auth required", i, err)
		}
	}

	// Every connection attempt would otherwise re-ask a question whose answer
	// cannot change until the user re-authorises.
	if got := calls.Load(); got != 1 {
		t.Fatalf("token endpoint called %d times, want 1", got)
	}

	// A fresh grant is a different refresh token, so it isn't held back by the
	// rejected one.
	calls.Store(0)
	if _, err := GetOAuthAccessToken(context.Background(), "gmail", "other-token"); err == nil {
		t.Fatal("expected the other token to reach the endpoint and fail there")
	}
	if got := calls.Load(); got != 1 {
		t.Fatalf("token endpoint called %d times for a different token, want 1", got)
	}
}

func TestGetOAuthAccessTokenRetriesTransientFailures(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		w.Write([]byte(`{"error": "temporarily_unavailable"}`))
	}))
	defer server.Close()
	withTokenEndpoint(t, "gmail", server.URL)

	for i := range 2 {
		_, err := GetOAuthAccessToken(context.Background(), "gmail", "live-token")
		if err == nil {
			t.Fatalf("attempt %d: expected an error", i)
		}
		if util.IsReauthRequired(err) {
			t.Fatalf("attempt %d: a 503 must not condemn the grant: %v", i, err)
		}
	}

	if got := calls.Load(); got != 2 {
		t.Fatalf("token endpoint called %d times, want 2 - transient failures must be retried", got)
	}
}

func TestGetOAuthAccessTokenCachesSuccess(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"access_token": "at-1", "expires_in": 3600}`))
	}))
	defer server.Close()
	withTokenEndpoint(t, "gmail", server.URL)

	for i := range 2 {
		token, err := GetOAuthAccessToken(context.Background(), "gmail", "live-token")
		if err != nil {
			t.Fatalf("attempt %d: unexpected error: %v", i, err)
		}
		if token != "at-1" {
			t.Fatalf("attempt %d: token = %q, want at-1", i, token)
		}
	}

	if got := calls.Load(); got != 1 {
		t.Fatalf("token endpoint called %d times, want 1", got)
	}
}
