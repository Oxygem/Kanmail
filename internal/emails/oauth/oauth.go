package oauth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"sync"
	"time"

	"github.com/emersion/go-sasl"
	"github.com/google/uuid"
	"github.com/rs/zerolog"

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
	clientID        string
	clientSecret    string

	includeClientSecret bool
	useFormBody         bool
	UseLegacyXOAuth2    bool
}

var oauthCompleteTemplate = []byte(`
<html>
  <head>
    <title>Kanmail Authentication</title>
  </head>
  <body style="background: white; font-family: Sans-Serif">
    <div style="width: 600px; margin: 50px auto">
      <h1>Kanmail</h1>
      <p>
        Authentication complete, please close this window &amp; return to the
        Kanmail app.
      </p>
    </div>
  </body>
</html>
`)

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
		clientID:            constants.OAUTH_GMAIL_CLIENT_ID,
		clientSecret:        constants.OAUTH_GMAIL_CLIENT_SECRET,
		includeClientSecret: true,
	},
	"outlook": {
		authEndpoint:     "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
		tokenEndpoint:    "https://login.microsoftonline.com/common/oauth2/v2.0/token",
		profileEndpoint:  "https://graph.microsoft.com/v1.0/me",
		scope:            "offline_access https://graph.microsoft.com/User.Read https://graph.microsoft.com/IMAP.AccessAsUser.All https://graph.microsoft.com/SMTP.Send",
		emailTokenScope:  "https://outlook.office.com/IMAP.AccessAsUser.All https://outlook.office.com/SMTP.Send",
		clientID:         constants.OAUTH_OUTLOOK_CLIENT_ID,
		clientSecret:     constants.OAUTH_OUTLOOK_CLIENT_SECRET,
		useFormBody:      true,
		UseLegacyXOAuth2: true, // Microsoft didn't get the OAUTHBEARER memo
	},
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
}

type oauthRequest struct {
	provider string
	response *OAuthResponse
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

func getRedirectURL() string {
	return "http://" + oauthResponseServerAddr.String()
}

func ensureResponseServer(ctx context.Context) error {
	if oauthResponseServerAddr == nil {
		listener, err := net.Listen("tcp", "localhost:0")
		if err != nil {
			return err
		}
		server := &http.Server{Handler: http.HandlerFunc(handleOAuthResponse)}

		go func() {
			defer util.LogAndPanic(ctx)
			if err := server.Serve(listener); err != http.ErrServerClosed {
				// Panic is appropriate here because if the server dies while oauth flow in effect
				// the alternative is a hanging app with no explanation.
				panic(err)
			}
		}()

		oauthResponseServerAddr = listener.Addr()
		zerolog.Ctx(ctx).Debug().
			Str("addr", listener.Addr().String()).
			Msg("Started OAuth response server")
	}
	return nil
}

func handleOAuthResponse(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.Error(w, "Path not found", http.StatusNotFound)
		return
	}

	oauthRequestLock.Lock()
	defer oauthRequestLock.Unlock()

	if currentOAuthRequest == nil {
		http.Error(w, "No such request", http.StatusNotFound)
		return
	}

	if currentOAuthRequest.response != nil {
		http.Error(w, "Response handled already", http.StatusConflict)
		return
	}

	log := zerolog.Ctx(r.Context()).With().
		Str("provider", currentOAuthRequest.provider).
		Logger()

	service, ok := oauthServices[currentOAuthRequest.provider]
	if !ok {
		http.Error(w, fmt.Sprintf("No such provider: %s", currentOAuthRequest.provider), http.StatusBadRequest)
		return
	}

	req := &util.HTTPRequest{
		URL:    service.tokenEndpoint,
		Method: http.MethodPost,
	}

	v := url.Values{}
	v.Set("client_id", service.clientID)
	v.Set("code", r.URL.Query().Get("code"))
	v.Set("grant_type", "authorization_code")
	v.Set("redirect_uri", getRedirectURL())

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
		http.Error(w, fmt.Sprintf("Unexpected error: %s", err), http.StatusInternalServerError)
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
		http.Error(w, "Incomplete token response", http.StatusBadGateway)
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
		log.Error().Any("data", profileData).Msg("Unexpected oauth error")
		http.Error(w, fmt.Sprintf("Unexpected error: %s", err), http.StatusInternalServerError)
		return
	}

	for _, key := range []string{"email", "mail"} {
		resp.Email, ok = profileData[key].(string)
		if ok {
			break
		}
	}
	if resp.Email == "" {
		http.Error(w, "No email returned from profile request", http.StatusBadRequest)
		return
	}

	// A provider re-issuing a refresh token we'd already written off (rather
	// than minting a fresh one) would otherwise be rejected out of hand by the
	// cache below, making the reconnect the user just completed look broken.
	clearInvalidRefreshToken(resp.RefreshToken)

	currentOAuthRequest.response = &resp
	log.Info().
		Str("provider", currentOAuthRequest.provider).
		Str("email", resp.Email).
		Msg("Completed oauth response")

	w.Header().Set("Content-Type", "text/html")
	w.WriteHeader(http.StatusOK)
	w.Write(oauthCompleteTemplate)
}

func GetOAuthRequestURL(ctx context.Context, provider string) (string, string, error) {
	ensureResponseServer(ctx)

	oauthRequestLock.Lock()
	defer oauthRequestLock.Unlock()

	service, ok := oauthServices[provider]
	if !ok {
		return "", "", ErrUnknownOAuthService
	}

	uid := uuid.New()
	currentOAuthRequest = &oauthRequest{
		provider: provider,
	}

	v := url.Values{}
	v.Set("client_id", service.clientID)
	v.Set("scope", service.scope)
	v.Set("response_type", "code")
	v.Set("access_type", "offline")
	v.Set("prompt", "consent")
	v.Set("redirect_uri", getRedirectURL())

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

func ClearOAuthAccessToken(refreshToken string) {
	oauthTokenLock.Lock()
	delete(oauthTokens, refreshToken)
	oauthTokenLock.Unlock()
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
}
