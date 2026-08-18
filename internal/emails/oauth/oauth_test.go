package oauth

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
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

// withOAuthRequest puts a request in flight for the duration of a test - the
// redirect handler only answers when the app is waiting for one.
func withOAuthRequest(t *testing.T, provider string) {
	t.Helper()
	oauthRequestLock.Lock()
	currentOAuthRequest = &oauthRequest{provider: provider}
	oauthRequestLock.Unlock()

	originalAddr := oauthResponseServerAddr
	oauthResponseServerAddr = &net.TCPAddr{IP: net.IPv4(127, 0, 0, 1), Port: 12345}

	t.Cleanup(func() {
		oauthRequestLock.Lock()
		currentOAuthRequest = nil
		oauthRequestLock.Unlock()
		oauthResponseServerAddr = originalAddr
	})
}

// Every way the flow can end must leave a response behind, otherwise the app
// sits on "waiting for confirmation" with nothing coming.
func TestHandleOAuthResponseRecordsFailures(t *testing.T) {
	for _, tc := range []struct {
		name          string
		query         string
		wantCancelled bool
		wantError     string
	}{
		{
			name:          "user cancelled",
			query:         "?error=access_denied",
			wantCancelled: true,
		},
		{
			name:          "redirect with nothing at all",
			wantCancelled: true,
		},
		{
			name:      "provider rejected the request",
			query:     "?error=invalid_scope&error_description=Bad+scope",
			wantError: "invalid_scope: Bad scope",
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			withOAuthRequest(t, "gmail")

			w := httptest.NewRecorder()
			handleOAuthResponse(w, httptest.NewRequest(http.MethodGet, "/"+tc.query, nil))

			if got := w.Header().Get("Content-Type"); got != "text/html" {
				t.Fatalf("Content-Type = %q, want text/html", got)
			}

			resp, err := GetOAuthResponse(context.Background(), "uid")
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if resp == nil {
				t.Fatal("no response recorded - the app would wait forever")
			}
			if resp.Cancelled != tc.wantCancelled {
				t.Fatalf("Cancelled = %v, want %v", resp.Cancelled, tc.wantCancelled)
			}
			if resp.Error != tc.wantError {
				t.Fatalf("Error = %q, want %q", resp.Error, tc.wantError)
			}
			if resp.RefreshToken != "" {
				t.Fatalf("RefreshToken = %q, want empty", resp.RefreshToken)
			}
		})
	}
}

func TestHandleOAuthResponseRecordsTokenFailure(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		w.Write([]byte(`{"error": "invalid_request", "error_description": "Missing required parameter: code"}`))
	}))
	defer server.Close()
	withTokenEndpoint(t, "gmail", server.URL)
	withOAuthRequest(t, "gmail")

	w := httptest.NewRecorder()
	handleOAuthResponse(w, httptest.NewRequest(http.MethodGet, "/?code=some-code", nil))

	resp, err := GetOAuthResponse(context.Background(), "uid")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp == nil {
		t.Fatal("no response recorded - the app would wait forever")
	}
	if resp.Cancelled {
		t.Fatal("Cancelled = true, want false - the exchange failed, the user didn't cancel")
	}
	want := "gmail oauth token error: invalid_request: Missing required parameter: code"
	if resp.Error != want {
		t.Fatalf("Error = %q, want %q", resp.Error, want)
	}
}

// A grant the user trimmed on the consent screen otherwise only shows up as an
// authentication failure at IMAP time, with nothing to connect it back to the
// checkbox that caused it.
func TestHandleOAuthResponseRejectsPartialGrant(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{
			"access_token": "at-1",
			"refresh_token": "rt-1",
			"scope": "https://www.googleapis.com/auth/userinfo.email"
		}`))
	}))
	defer server.Close()
	withTokenEndpoint(t, "gmail", server.URL)
	withOAuthRequest(t, "gmail")

	w := httptest.NewRecorder()
	handleOAuthResponse(w, httptest.NewRequest(http.MethodGet, "/?code=some-code", nil))

	resp, err := GetOAuthResponse(context.Background(), "uid")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp == nil {
		t.Fatal("no response recorded - the app would wait forever")
	}
	if !strings.Contains(resp.Error, "https://mail.google.com/") {
		t.Fatalf("Error = %q, want the missing scope named", resp.Error)
	}
	if resp.RefreshToken != "" {
		t.Fatal("a grant that cannot open a mailbox must not be stored")
	}
}

func TestMissingEmailScopes(t *testing.T) {
	for _, tc := range []struct {
		name     string
		provider string
		granted  string
		want     []string
	}{
		{
			name:     "google grant with everything asked for",
			provider: "gmail",
			granted:  "https://www.googleapis.com/auth/userinfo.email https://mail.google.com/",
		},
		{
			name:     "google mail permission unticked",
			provider: "gmail",
			granted:  "https://www.googleapis.com/auth/userinfo.email openid",
			want:     []string{"https://mail.google.com/"},
		},
		{
			// Microsoft answers with bare Graph scopes where it was asked for
			// them prefixed - the same grant, spelled differently
			name:     "microsoft grant reported unprefixed",
			provider: "outlook",
			granted:  "openid profile User.Read IMAP.AccessAsUser.All SMTP.Send",
		},
		{
			// Microsoft treats scope names case-insensitively, so the echoed
			// casing carries no meaning
			name:     "microsoft grant reported in different casing",
			provider: "outlook",
			granted:  "openid imap.accessasuser.all smtp.send",
		},
		{
			name:     "microsoft send permission withheld",
			provider: "outlook",
			granted:  "https://graph.microsoft.com/User.Read https://graph.microsoft.com/IMAP.AccessAsUser.All",
			want:     []string{"https://graph.microsoft.com/SMTP.Send"},
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got := oauthServices[tc.provider].missingEmailScopes(tc.granted)
			if strings.Join(got, " ") != strings.Join(tc.want, " ") {
				t.Fatalf("missingEmailScopes(%q) = %v, want %v", tc.granted, got, tc.want)
			}
		})
	}
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

func TestClearOAuthAccessTokenIgnoresStaleToken(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"access_token": "at-%d", "expires_in": 3600}`, calls.Add(1))
	}))
	defer server.Close()
	withTokenEndpoint(t, "gmail", server.URL)

	first, err := GetOAuthAccessToken(context.Background(), "gmail", "live-token")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// One connection's login is rejected, so it drops the token it used and the
	// next caller fetches a replacement.
	ClearOAuthAccessToken("live-token", first)
	second, err := GetOAuthAccessToken(context.Background(), "gmail", "live-token")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if second == first {
		t.Fatalf("token = %q, want a refreshed one", second)
	}

	// A sibling connection was holding the same token and reports its own
	// failure a moment later. The replacement is not what it failed on.
	ClearOAuthAccessToken("live-token", first)
	third, err := GetOAuthAccessToken(context.Background(), "gmail", "live-token")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if third != second {
		t.Fatalf("token = %q, want the cached %q", third, second)
	}
	if got := calls.Load(); got != 2 {
		t.Fatalf("token endpoint called %d times, want 2", got)
	}
}
