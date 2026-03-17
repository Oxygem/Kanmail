package oauth

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"sync"

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

var oauthServices = map[string]oauthService{
	"gmail": {
		authEndpoint:        "https://accounts.google.com/o/oauth2/auth",
		tokenEndpoint:       "https://accounts.google.com/o/oauth2/token",
		profileEndpoint:     "https://www.googleapis.com/userinfo/v2/me",
		scope:               "https://mail.google.com https://www.googleapis.com/auth/userinfo.email",
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

var oauthHTTPClient = &http.Client{}
var oauthResponseServerAddr net.Addr

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

// Map of refresh token -> access token
var oauthTokens = map[string]string{}
var oauthTokenLock sync.Mutex

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

	tokenData, err := util.MakeHTTPRequestJSON(
		r.Context(),
		oauthHTTPClient,
		req,
	)
	if err != nil {
		log.Error().Any("data", tokenData).Msg("Unexpected oauth error")
		http.Error(w, fmt.Sprintf("Unexpected error: %s", err), http.StatusInternalServerError)
		return
	}

	var resp OAuthResponse
	resp.Scope = tokenData["scope"].(string)
	resp.AccessToken = tokenData["access_token"].(string)
	resp.RefreshToken = tokenData["refresh_token"].(string)

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
	v.Set("redirect_uri", getRedirectURL())

	url := service.authEndpoint + "?" + v.Encode()
	return uid.String(), url, nil
}

func GetOAuthResponse(ctx context.Context, uid string) (*OAuthResponse, error) {
	oauthRequestLock.Lock()
	defer oauthRequestLock.Unlock()

	if currentOAuthRequest == nil {
		return nil, fmt.Errorf("no in-flight oauth request found")
	}
	resp := currentOAuthRequest.response
	// Only return resp once
	if resp != nil {
		currentOAuthRequest = nil
	}
	return resp, nil
}

func GetOAuthAccessToken(ctx context.Context, provider, refreshToken string) (string, error) {
	oauthTokenLock.Lock()
	defer oauthTokenLock.Unlock()

	accessToken, ok := oauthTokens[refreshToken]
	if ok {
		zerolog.Ctx(ctx).Trace().Msg("Using cached access token")
		return accessToken, nil
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

	tokenData, err := util.MakeHTTPRequestJSON(
		ctx,
		oauthHTTPClient,
		&util.HTTPRequest{
			URL:    service.tokenEndpoint,
			Method: http.MethodPost,
			Form:   v,
		},
	)
	if err != nil {
		return "", err
	}

	zerolog.Ctx(ctx).Trace().Msg("Fetched new access token")
	accessToken = tokenData["access_token"].(string)
	oauthTokens[refreshToken] = accessToken

	return accessToken, nil
}

func ClearOAuthAccessToken(refreshToken string) {
	oauthTokenLock.Lock()
	delete(oauthTokens, refreshToken)
	oauthTokenLock.Unlock()
}

func ClearOAuthAccessTokens() {
	oauthTokenLock.Lock()
	clear(oauthTokens)
	oauthTokenLock.Unlock()
}
