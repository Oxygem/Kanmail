package oauth

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/emersion/go-sasl"
	"github.com/google/uuid"
	"github.com/rs/zerolog"
	"go.mau.fi/util/random"

	"github.com/oxygem/kanmail/internal/constants"
	"github.com/oxygem/kanmail/internal/types"
	"github.com/oxygem/kanmail/internal/util"
)

type oauthService struct {
	authEndpoint    string
	tokenEndpoint   string
	profileEndpoint string
	scope           string
	emailTokenScope string
	// The subset of scope without which the mailbox cannot be opened, checked
	// against what the user actually granted - see missingEmailScopes
	emailScopes  []string
	clientID     string
	clientSecret string

	includeClientSecret bool
	useFormBody         bool
	UseLegacyXOAuth2    bool
}

// The provider redirects the browser back to us whether the user signed in,
// cancelled or hit a problem, and this page is all the feedback they get there
const oauthPageTemplate = `
<html>
  <head>
    <title>Kanmail Authentication</title>
  </head>
  <body style="background: white; font-family: Sans-Serif">
    <div style="width: 600px; margin: 50px auto">
      <h1>Kanmail</h1>
      <p>%s</p>
    </div>
  </body>
</html>
`

func writeOAuthPage(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "text/html")
	w.WriteHeader(status)
	fmt.Fprintf(w, oauthPageTemplate, html.EscapeString(message))
}

var ErrUnknownOAuthService = errors.New("no such oauth service")

// terminalTokenErrorCodes are token endpoint error codes that mean the grant we
// hold is gone for good - the user revoked Kanmail's access, changed their
// password, or let the refresh token lapse. Everything else (a 5xx, a rate
// limit, a transport failure) may work on the next attempt.
var terminalTokenErrorCodes = map[string]bool{
	"invalid_grant":        true,
	"consent_required":     true,
	"interaction_required": true,
}

// TokenError is an error response from a provider's token endpoint (RFC 6749
// section 5.2). The provider's own code is the only thing that distinguishes a
// dead grant from a transient failure, so it is kept rather than flattened into
// the HTTP status.
type TokenError struct {
	Provider    string `json:"provider"`
	Code        string `json:"code"`
	Description string `json:"description"`
	StatusCode  int    `json:"statusCode"`
}

func (e *TokenError) Error() string {
	code := e.Code
	if code == "" {
		code = fmt.Sprintf("HTTP %d", e.StatusCode)
	}
	msg := fmt.Sprintf("%s oauth token error: %s", e.Provider, code)
	if e.Description != "" {
		msg += ": " + e.Description
	}
	return msg
}

func (e *TokenError) Unwrap() error {
	if terminalTokenErrorCodes[e.Code] {
		return util.ErrReauthRequired
	}
	return nil
}

var oauthServices = map[string]oauthService{
	"gmail": {
		authEndpoint:        "https://accounts.google.com/o/oauth2/auth",
		tokenEndpoint:       "https://accounts.google.com/o/oauth2/token",
		profileEndpoint:     "https://www.googleapis.com/userinfo/v2/me",
		scope:               "https://mail.google.com/ https://www.googleapis.com/auth/userinfo.email",
		emailScopes:         []string{"https://mail.google.com/"},
		clientID:            constants.OAUTH_GMAIL_CLIENT_ID,
		clientSecret:        constants.OAUTH_GMAIL_CLIENT_SECRET,
		includeClientSecret: true,
		UseLegacyXOAuth2:    true, // Seems to work better?
	},
	"outlook": {
		authEndpoint:    "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
		tokenEndpoint:   "https://login.microsoftonline.com/common/oauth2/v2.0/token",
		profileEndpoint: "https://graph.microsoft.com/v1.0/me",
		scope:           "offline_access https://graph.microsoft.com/User.Read https://graph.microsoft.com/IMAP.AccessAsUser.All https://graph.microsoft.com/SMTP.Send",
		emailTokenScope: "https://outlook.office.com/IMAP.AccessAsUser.All https://outlook.office.com/SMTP.Send",
		emailScopes: []string{
			"https://graph.microsoft.com/IMAP.AccessAsUser.All",
			"https://graph.microsoft.com/SMTP.Send",
		},
		clientID:         constants.OAUTH_OUTLOOK_CLIENT_ID,
		clientSecret:     constants.OAUTH_OUTLOOK_CLIENT_SECRET,
		useFormBody:      true,
		UseLegacyXOAuth2: true, // Microsoft didn't get the OAUTHBEARER memo
	},
}

// scopeSuffix reduces a scope to the part providers agree on. Microsoft hands
// back Graph scopes bare ("IMAP.AccessAsUser.All") where it was asked for them
// prefixed - in whatever casing, since it treats scope names case-insensitively
// - and Google's mail scope appears with and without its trailing slash.
// Comparing whole strings would write off a perfectly good grant.
func scopeSuffix(scope string) string {
	trimmed := strings.TrimSuffix(scope, "/")
	if i := strings.LastIndex(trimmed, "/"); i >= 0 {
		trimmed = trimmed[i+1:]
	}
	return strings.ToLower(trimmed)
}

// missingEmailScopes lists the mail scopes a grant did not include. Google and
// Microsoft both put a checkbox against each permission they ask for, so a sign
// in can complete with a valid token that cannot open a mailbox - and the only
// symptom is an authentication failure at IMAP time, long after the screen that
// caused it.
func (s oauthService) missingEmailScopes(granted string) []string {
	have := map[string]bool{}
	for _, scope := range strings.Fields(granted) {
		have[scopeSuffix(scope)] = true
	}

	var missing []string
	for _, scope := range s.emailScopes {
		if !have[scopeSuffix(scope)] {
			missing = append(missing, scope)
		}
	}
	return missing
}

func MakeSASLClient(conf types.ConnectionSettings, accessToken string) sasl.Client {
	if oauthServices[conf.OAuthProvider].UseLegacyXOAuth2 {
		return NewXoauth2Client(conf.Username, accessToken)
	}
	return sasl.NewOAuthBearerClient(&sasl.OAuthBearerOptions{
		Token:    accessToken,
		Username: conf.Username,
		Host:     conf.Host,
		Port:     conf.Port,
	})
}

// Generous enough for a slow connection, but bounded - without a timeout a
// black-holed endpoint (sleep/wake, captive portal) blocks the caller forever
var oauthHTTPClient = &http.Client{Timeout: time.Minute}
var oauthResponseServerAddr net.Addr

// requestToken posts to a provider's token endpoint, turning an OAuth2 error
// response into a *TokenError so callers can tell "come back later" apart from
// "this grant is dead". Transport and body-read failures pass through as-is -
// there's no response to classify.
func requestToken(ctx context.Context, provider string, req *util.HTTPRequest) (map[string]any, error) {
	resp, body, err := util.MakeHTTPRequest(ctx, oauthHTTPClient, req)

	var data map[string]any
	if len(body) > 0 {
		// A provider answering with anything but JSON has nothing to say beyond
		// the status code, which the TokenError below carries regardless.
		_ = json.Unmarshal(body, &data)
	}

	if err == nil {
		return data, nil
	}
	if resp == nil || resp.StatusCode == http.StatusOK {
		return data, err
	}

	tokenErr := &TokenError{Provider: provider, StatusCode: resp.StatusCode}
	tokenErr.Code, _ = data["error"].(string)
	tokenErr.Description, _ = data["error_description"].(string)
	return data, tokenErr
}

type OAuthResponse struct {
	Email        string `json:"email"`
	Scope        string `json:"scope"`
	AccessToken  string `json:"accessToken"`
	RefreshToken string `json:"refreshToken"`

	// Set when the flow ended without a token - the user backed out at the
	// provider (Cancelled) or the exchange was rejected (Error). Either way the
	// frontend has to stop waiting for a confirmation that isn't coming.
	Cancelled bool   `json:"cancelled,omitempty"`
	Error     string `json:"error,omitempty"`
}

type oauthRequest struct {
	provider string
	// CSRF protection: the provider echoes state back on the redirect, so a
	// response that doesn't carry it can't belong to the flow we started
	state string
	// PKCE (RFC 7636): the code is only exchangeable with the verifier, which
	// never leaves this process
	pkceVerifier string
	response     *OAuthResponse
}

// var oauthRequests = map[uuid.UUID]*oauthRequest{}
var currentOAuthRequest *oauthRequest
var oauthRequestLock sync.Mutex

type cachedAccessToken struct {
	accessToken string
	expiresAt   time.Time
}

// Map of refresh token -> access token
var oauthTokens = map[string]cachedAccessToken{}

// Refresh tokens the provider has rejected outright. Without this every
// connection attempt - and there are several per account, continuously - asks
// the token endpoint a question whose answer cannot change until the user
// re-authorises, which mints a different refresh token anyway.
var invalidRefreshTokens = map[string]error{}

// Guards the two maps above only. It must never be held across the token
// request itself - that request is per-account, but this lock is global, so
// one slow provider would stall every other account's connections behind it.
var oauthTokenLock sync.Mutex

// Serialises refreshes of a single refresh token, so concurrent connections
// for one account ask the token endpoint once rather than stampeding it.
var refreshLocks = map[string]*sync.Mutex{}
var refreshLocksLock sync.Mutex

func refreshLockFor(refreshToken string) *sync.Mutex {
	refreshLocksLock.Lock()
	defer refreshLocksLock.Unlock()

	lock, ok := refreshLocks[refreshToken]
	if !ok {
		lock = &sync.Mutex{}
		refreshLocks[refreshToken] = lock
	}
	return lock
}

// cachedTokenFor returns a usable access token, or the error recorded when the
// provider rejected this refresh token. ok is false when a refresh is due.
func cachedTokenFor(refreshToken string) (token string, err error, ok bool) {
	oauthTokenLock.Lock()
	defer oauthTokenLock.Unlock()

	if err, rejected := invalidRefreshTokens[refreshToken]; rejected {
		return "", err, true
	}
	if cached, found := oauthTokens[refreshToken]; found && time.Now().Before(cached.expiresAt) {
		return cached.accessToken, nil, true
	}
	return "", nil, false
}

// Refresh tokens slightly before the server-side expiry so we never hand out
// a token that expires mid-login
const accessTokenExpiryBuffer = 5 * time.Minute

// Guards oauthResponseServerAddr: without it two rapid StartOAuthRequest calls
// could both Listen (leaking one socket), and the addr write had no
// happens-before with the handler goroutine's read.
var oauthResponseServerLock sync.Mutex

func getRedirectURL() string {
	oauthResponseServerLock.Lock()
	defer oauthResponseServerLock.Unlock()
	return "http://" + oauthResponseServerAddr.String()
}

func ensureResponseServer(ctx context.Context) error {
	oauthResponseServerLock.Lock()
	defer oauthResponseServerLock.Unlock()

	if oauthResponseServerAddr != nil {
		return nil
	}

	listener, err := net.Listen("tcp", "localhost:0")
	if err != nil {
		return err
	}
	server := &http.Server{Handler: http.HandlerFunc(handleOAuthResponse)}

	// Addr is assigned before the server goroutine starts, so the handler can
	// never observe it unset
	oauthResponseServerAddr = listener.Addr()

	go func() {
		defer util.LogAndPanic(ctx)
		if err := server.Serve(listener); err != http.ErrServerClosed {
			// Panic is appropriate here because if the server dies while oauth flow in effect
			// the alternative is a hanging app with no explanation.
			panic(err)
		}
	}()

	zerolog.Ctx(ctx).Debug().
		Str("addr", listener.Addr().String()).
		Msg("Started OAuth response server")
	return nil
}

// completeOAuthRequest hands the outcome of the flow to the waiting frontend and
// tells the browser what happened. Every path out of the handler below goes
// through here: one that only writes a page leaves the app sat waiting for a
// confirmation that will never arrive.
func completeOAuthRequest(w http.ResponseWriter, status int, resp *OAuthResponse, message string) {
	currentOAuthRequest.response = resp
	writeOAuthPage(w, status, message)
}

func failOAuthRequest(w http.ResponseWriter, status int, reason string) {
	completeOAuthRequest(w, status, &OAuthResponse{Error: reason}, fmt.Sprintf(
		"Sign in failed: %s. Please close this window & return to the Kanmail app to try again.",
		reason,
	))
}

func handleOAuthResponse(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.Error(w, "Path not found", http.StatusNotFound)
		return
	}

	oauthRequestLock.Lock()
	defer oauthRequestLock.Unlock()

	if currentOAuthRequest == nil {
		writeOAuthPage(w, http.StatusNotFound,
			"There's no sign in waiting for a response - please start again from the Kanmail app.")
		return
	}

	if currentOAuthRequest.response != nil {
		writeOAuthPage(w, http.StatusConflict,
			"This sign in has already completed, please close this window & return to the Kanmail app.")
		return
	}

	log := zerolog.Ctx(r.Context()).With().
		Str("provider", currentOAuthRequest.provider).
		Logger()

	query := r.URL.Query()

	// A response without our state can't belong to the flow we started, so it
	// gets a page but does not complete (or cancel) the pending request.
	if query.Get("state") != currentOAuthRequest.state {
		log.Warn().Msg("OAuth response with missing or mismatched state")
		writeOAuthPage(w, http.StatusBadRequest,
			"This response doesn't match the sign in in progress - please start again from the Kanmail app.")
		return
	}

	// Providers redirect back here with an error and no code when the user hits
	// cancel or declines any of the access asked for
	if errCode := query.Get("error"); errCode != "" || query.Get("code") == "" {
		log.Warn().
			Str("error", errCode).
			Str("description", query.Get("error_description")).
			Msg("OAuth flow did not complete")

		// access_denied is what both providers send for the cancel button, and
		// a bare redirect with nothing at all means the same thing
		if errCode == "" || errCode == "access_denied" {
			completeOAuthRequest(w, http.StatusOK, &OAuthResponse{Cancelled: true},
				"Sign in was cancelled, please close this window & return to the Kanmail app.")
			return
		}

		reason := errCode
		if description := query.Get("error_description"); description != "" {
			reason = fmt.Sprintf("%s: %s", errCode, description)
		}
		failOAuthRequest(w, http.StatusOK, reason)
		return
	}

	service, ok := oauthServices[currentOAuthRequest.provider]
	if !ok {
		failOAuthRequest(w, http.StatusBadRequest,
			fmt.Sprintf("no such provider: %s", currentOAuthRequest.provider))
		return
	}

	req := &util.HTTPRequest{
		URL:    service.tokenEndpoint,
		Method: http.MethodPost,
	}

	v := url.Values{}
	v.Set("client_id", service.clientID)
	v.Set("code", query.Get("code"))
	v.Set("grant_type", "authorization_code")
	v.Set("redirect_uri", getRedirectURL())
	v.Set("code_verifier", currentOAuthRequest.pkceVerifier)

	if service.includeClientSecret {
		v.Set("client_secret", service.clientSecret)
	}

	if service.useFormBody {
		req.Form = v
	} else {
		req.JSON = v
	}

	tokenData, err := requestToken(r.Context(), currentOAuthRequest.provider, req)
	if err != nil {
		log.Error().Err(err).Any("data", tokenData).Msg("Unexpected oauth error")
		failOAuthRequest(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Checked, not asserted: a response missing any of these would otherwise
	// panic inside the HTTP handler, which net/http recovers by resetting the
	// connection - leaving the frontend waiting on a confirmation that never
	// arrives, with nothing logged to say why.
	var resp OAuthResponse
	resp.Scope, _ = tokenData["scope"].(string)
	resp.AccessToken, _ = tokenData["access_token"].(string)
	resp.RefreshToken, _ = tokenData["refresh_token"].(string)
	if resp.AccessToken == "" || resp.RefreshToken == "" {
		log.Error().Bool("hasAccessToken", resp.AccessToken != "").
			Bool("hasRefreshToken", resp.RefreshToken != "").
			Msg("Incomplete oauth token response")
		failOAuthRequest(w, http.StatusBadGateway, "incomplete token response")
		return
	}

	// Catching a partial grant here is the difference between telling the user
	// what to do about it and storing an account that can never connect. A
	// provider that doesn't report the granted scope leaves nothing to check.
	if resp.Scope == "" {
		log.Warn().Msg("OAuth token response did not report the granted scope")
	} else if missing := service.missingEmailScopes(resp.Scope); len(missing) > 0 {
		log.Error().Str("granted", resp.Scope).Strs("missing", missing).
			Msg("OAuth grant is missing the scopes needed to access email")
		failOAuthRequest(w, http.StatusOK, fmt.Sprintf(
			"Kanmail was not given access to your email (missing %s) - "+
				"please sign in again and accept every permission requested",
			strings.Join(missing, ", "),
		))
		return
	}

	headers := http.Header{"Authorization": []string{"Bearer " + resp.AccessToken}}
	profileData, err := util.MakeHTTPRequestJSON(
		r.Context(),
		oauthHTTPClient,
		&util.HTTPRequest{
			URL:     service.profileEndpoint,
			Method:  http.MethodGet,
			Headers: headers,
		},
	)
	if err != nil {
		log.Error().Err(err).Any("data", profileData).Msg("Unexpected oauth error")
		failOAuthRequest(w, http.StatusInternalServerError, err.Error())
		return
	}

	for _, key := range []string{"email", "mail"} {
		resp.Email, ok = profileData[key].(string)
		if ok {
			break
		}
	}
	if resp.Email == "" {
		failOAuthRequest(w, http.StatusBadGateway, "no email returned from profile request")
		return
	}

	// A provider re-issuing a refresh token we'd already written off (rather
	// than minting a fresh one) would otherwise be rejected out of hand by the
	// cache below, making the reconnect the user just completed look broken.
	clearInvalidRefreshToken(resp.RefreshToken)

	log.Info().
		Str("provider", currentOAuthRequest.provider).
		Str("email", resp.Email).
		Str("scope", resp.Scope).
		Msg("Completed oauth response")

	completeOAuthRequest(w, http.StatusOK, &resp,
		"Authentication complete, please close this window & return to the Kanmail app.")
}

func GetOAuthRequestURL(ctx context.Context, provider string) (string, string, error) {
	if err := ensureResponseServer(ctx); err != nil {
		return "", "", fmt.Errorf("failed to start oauth response server: %w", err)
	}

	oauthRequestLock.Lock()
	defer oauthRequestLock.Unlock()

	service, ok := oauthServices[provider]
	if !ok {
		return "", "", ErrUnknownOAuthService
	}

	uid := uuid.New()
	currentOAuthRequest = &oauthRequest{
		provider:     provider,
		state:        base64.RawURLEncoding.EncodeToString(random.Bytes(16)),
		pkceVerifier: base64.RawURLEncoding.EncodeToString(random.Bytes(32)),
	}

	pkceChallenge := sha256.Sum256([]byte(currentOAuthRequest.pkceVerifier))

	v := url.Values{}
	v.Set("client_id", service.clientID)
	v.Set("scope", service.scope)
	v.Set("response_type", "code")
	v.Set("access_type", "offline")
	v.Set("prompt", "consent")
	v.Set("redirect_uri", getRedirectURL())
	v.Set("state", currentOAuthRequest.state)
	v.Set("code_challenge", base64.RawURLEncoding.EncodeToString(pkceChallenge[:]))
	v.Set("code_challenge_method", "S256")

	url := service.authEndpoint + "?" + v.Encode()
	return uid.String(), url, nil
}

func GetOAuthResponse(ctx context.Context, uid string) (*OAuthResponse, error) {
	oauthRequestLock.Lock()
	defer oauthRequestLock.Unlock()

	if currentOAuthRequest == nil {
		// No request in flight: either none was started, or a prior poll already
		// consumed the response and cleared it. The frontend polls on an interval
		// and a tick almost always fires between the successful poll and its
		// clearInterval, so this is an expected, benign state - return an empty
		// response rather than an error that surfaces as a spurious alert.
		zerolog.Ctx(ctx).Trace().Msg("No in-flight oauth request to return")
		return nil, nil
	}
	resp := currentOAuthRequest.response
	// Only return resp once
	if resp != nil {
		currentOAuthRequest = nil
	}
	return resp, nil
}

func GetOAuthAccessToken(ctx context.Context, provider, refreshToken string) (string, error) {
	if token, err, ok := cachedTokenFor(refreshToken); ok {
		if err == nil {
			zerolog.Ctx(ctx).Trace().Msg("Using cached access token")
		}
		return token, err
	}

	lock := refreshLockFor(refreshToken)
	lock.Lock()
	defer lock.Unlock()

	// Another goroutine may have refreshed this token while we waited
	if token, err, ok := cachedTokenFor(refreshToken); ok {
		return token, err
	}

	service := oauthServices[provider]

	v := url.Values{}
	v.Set("client_id", service.clientID)
	v.Set("refresh_token", refreshToken)
	v.Set("grant_type", "refresh_token")

	if service.includeClientSecret {
		v.Set("client_secret", service.clientSecret)
	}

	if service.emailTokenScope != "" {
		v.Set("scope", service.emailTokenScope)
	}

	tokenData, err := requestToken(ctx, provider, &util.HTTPRequest{
		URL:    service.tokenEndpoint,
		Method: http.MethodPost,
		Form:   v,
	})
	if err != nil {
		if util.IsReauthRequired(err) {
			oauthTokenLock.Lock()
			invalidRefreshTokens[refreshToken] = err
			delete(oauthTokens, refreshToken)
			oauthTokenLock.Unlock()

			zerolog.Ctx(ctx).Error().Err(err).Str("provider", provider).
				Msg("OAuth refresh token rejected, account needs re-authenticating")
		}
		return "", err
	}

	zerolog.Ctx(ctx).Trace().Msg("Fetched new access token")
	accessToken, ok := tokenData["access_token"].(string)
	if !ok {
		return "", fmt.Errorf("no access_token in oauth token response")
	}

	expiresAt := time.Now().Add(time.Hour)
	if expiresIn, ok := tokenData["expires_in"].(float64); ok {
		expiresAt = time.Now().Add(time.Duration(expiresIn) * time.Second)
	}

	oauthTokenLock.Lock()
	oauthTokens[refreshToken] = cachedAccessToken{
		accessToken: accessToken,
		expiresAt:   expiresAt.Add(-accessTokenExpiryBuffer),
	}
	oauthTokenLock.Unlock()

	return accessToken, nil
}

// ClearOAuthAccessToken discards a cached access token for a given refresh token
func ClearOAuthAccessToken(refreshToken, accessToken string) {
	oauthTokenLock.Lock()
	defer oauthTokenLock.Unlock()

	if cached, ok := oauthTokens[refreshToken]; ok && cached.accessToken == accessToken {
		delete(oauthTokens, refreshToken)
	}
}

func clearInvalidRefreshToken(refreshToken string) {
	oauthTokenLock.Lock()
	delete(invalidRefreshTokens, refreshToken)
	oauthTokenLock.Unlock()
}

// ClearOAuthAccessTokens drops every cached token, including the record of
// which refresh tokens the provider rejected, so a grant restored at the
// provider's end gets another chance without restarting the app.
func ClearOAuthAccessTokens() {
	oauthTokenLock.Lock()
	clear(oauthTokens)
	clear(invalidRefreshTokens)
	oauthTokenLock.Unlock()

	clearTokenDiagnoses()
}
