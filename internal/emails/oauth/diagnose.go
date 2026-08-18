package oauth

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/emersion/go-sasl"
	"github.com/rs/zerolog"

	"github.com/oxygem/kanmail/internal/types"
	"github.com/oxygem/kanmail/internal/util"
)

var googleTokenInfoEndpoint = "https://oauth2.googleapis.com/tokeninfo"

var tokenInfoHTTPClient = &http.Client{Timeout: 5 * time.Second}

type tokenDiagnosis struct {
	text string
	at   time.Time
	ttl  time.Duration
}

// An account whose login fails reconnects on a loop, but the grant behind it
// cannot change between two attempts moments apart - so ask the provider at
// most this often per grant, and reuse the answer in between.
const tokenDiagnosisTTL = 10 * time.Minute

// A probe that failed says nothing about the grant, but re-asking on every
// attempt while tokeninfo is unreachable would slow each reconnect further.
const tokenProbeRetryDelay = time.Minute

// Keyed by refresh token: each attempt carries a freshly minted access token,
// but they all describe the same grant - until a reconnect stores a new
// refresh token, whose failures must not inherit the old grant's diagnosis.
var tokenDiagnoses = map[string]tokenDiagnosis{}
var tokenDiagnosesLock sync.Mutex

func clearTokenDiagnoses() {
	tokenDiagnosesLock.Lock()
	clear(tokenDiagnoses)
	tokenDiagnosesLock.Unlock()
}

// DiagnoseAuthError turns a rejected OAuth login into something that can be
// acted on. Three things have to be put back together: the provider's error
// challenge (the status code, and the scope it wanted), the tagged response it
// finishes with (where the reason a human can act on lives) and - where the
// provider offers a way to ask - what the token it just refused actually
// carries. A login that fails right after a successful sign in is nearly always
// a token missing the mail scope or belonging to a different address, and
// neither is visible in the status code alone.
func DiagnoseAuthError(
	ctx context.Context,
	conf types.ConnectionSettings,
	accessToken string,
	saslClient sasl.Client,
	err error,
) error {
	if client, ok := saslClient.(*xoauth2Client); ok && client.err != nil {
		err = fmt.Errorf("%w (server response: %w)", client.err, err)
	}
	if diagnosis := diagnoseToken(ctx, conf, accessToken); diagnosis != "" {
		err = fmt.Errorf("%w: %s", err, diagnosis)
	}
	return err
}

func diagnoseToken(ctx context.Context, conf types.ConnectionSettings, accessToken string) string {
	if conf.OAuthProvider != "gmail" || accessToken == "" {
		return ""
	}

	key := conf.OAuthRefreshToken
	tokenDiagnosesLock.Lock()
	cached, found := tokenDiagnoses[key]
	tokenDiagnosesLock.Unlock()
	if found && time.Since(cached.at) < cached.ttl {
		return cached.text
	}

	diagnosis, tokenSpecific := describeToken(ctx, oauthServices[conf.OAuthProvider], conf.Username, accessToken)
	if tokenSpecific {
		// "this token is expired/revoked" is true of one minted token, not of
		// the grant - and the next attempt mints another, so don't cache it
		return diagnosis
	}

	ttl := tokenDiagnosisTTL
	if diagnosis == "" {
		ttl = tokenProbeRetryDelay
	}
	tokenDiagnosesLock.Lock()
	tokenDiagnoses[key] = tokenDiagnosis{text: diagnosis, at: time.Now(), ttl: ttl}
	tokenDiagnosesLock.Unlock()

	return diagnosis
}

// describeToken asks the provider about the token it just refused.
// tokenSpecific reports whether the answer is about this one minted token
// rather than the grant behind it.
func describeToken(
	ctx context.Context,
	service oauthService,
	username, accessToken string,
) (diagnosis string, tokenSpecific bool) {
	// The token travels in the request body: in the URL it would end up in the
	// request log line and in the URL a failed transport quotes in its error
	data, err := util.MakeHTTPRequestJSON(ctx, tokenInfoHTTPClient, &util.HTTPRequest{
		URL:    googleTokenInfoEndpoint,
		Method: http.MethodPost,
		Form:   url.Values{"access_token": {accessToken}},
	})
	if data == nil {
		zerolog.Ctx(ctx).Warn().Err(err).Msg("Failed to inspect rejected access token")
		return "", false
	}

	if tokenErr, _ := data["error"].(string); tokenErr != "" {
		if description, _ := data["error_description"].(string); description != "" {
			tokenErr += ": " + description
		}
		return fmt.Sprintf("the provider rejects the access token itself (%s)", tokenErr), true
	}

	granted, _ := data["scope"].(string)
	tokenEmail, _ := data["email"].(string)
	audience, _ := data["aud"].(string)

	zerolog.Ctx(ctx).Warn().
		Str("scope", granted).
		Str("email", tokenEmail).
		Str("username", username).
		Msg("Inspected rejected access token")

	var notes []string
	// An absent scope field says nothing about what was granted - only a
	// present one that misses the mail scope does
	if granted != "" {
		if missing := service.missingEmailScopes(granted); len(missing) > 0 {
			notes = append(notes, fmt.Sprintf(
				"the token was never granted %s (it has: %s)",
				strings.Join(missing, ", "), granted,
			))
		}
	}
	if tokenEmail != "" && !strings.EqualFold(tokenEmail, username) {
		notes = append(notes, fmt.Sprintf("the token belongs to %s, not %s", tokenEmail, username))
	}
	if audience != "" && audience != service.clientID {
		notes = append(notes, "the token was issued to a different application")
	}
	if len(notes) == 0 {
		if granted == "" {
			// Nothing checkable came back - no better than a failed probe
			return "", false
		}
		// Everything the provider will tell us about the token is in order, so
		// what's left is the mailbox refusing us - IMAP switched off for the
		// user or the whole domain being the usual reason.
		notes = append(notes, fmt.Sprintf(
			"the token is valid and carries %s, so the account is refusing IMAP access itself "+
				"(often disabled by a domain administrator)", granted,
		))
	}
	return strings.Join(notes, "; "), false
}
