package oauth

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/emersion/go-sasl"
)

// The XOAUTH2 mechanism name.
const Xoauth2 = "XOAUTH2"

// An XOAUTH2 error.
type Xoauth2Error struct {
	Status  string `json:"status"`
	Schemes string `json:"schemes"`
	Scope   string `json:"scope"`

	// The challenge as it arrived, kept for the servers that answer with
	// something other than the documented JSON - otherwise all that's left to
	// report is a parse failure, which says nothing about why we were refused.
	Raw string `json:"-"`
}

// Implements error.
func (err *Xoauth2Error) Error() string {
	var parts []string
	if err.Status != "" {
		parts = append(parts, "status "+err.Status)
	}
	// The scope the server wanted is the difference between "this token is no
	// good" and "this token was never granted access to mail"
	if err.Scope != "" {
		parts = append(parts, "scope "+err.Scope)
	}
	if err.Schemes != "" {
		parts = append(parts, "schemes "+err.Schemes)
	}
	if len(parts) == 0 {
		parts = append(parts, "challenge "+err.Raw)
	}
	return fmt.Sprintf("XOAUTH2 authentication error (%s)", strings.Join(parts, ", "))
}

type xoauth2Client struct {
	Username string
	Token    string

	// The error challenge the server sent, if any. Reported through
	// DiagnoseAuthError rather than by failing the exchange - see Next.
	err *Xoauth2Error
}

func (a *xoauth2Client) Start() (mech string, ir []byte, err error) {
	mech = Xoauth2
	ir = []byte("user=" + a.Username + "\x01auth=Bearer " + a.Token + "\x01\x01")
	return
}

// Next handles the only challenge XOAUTH2 ever sends: an error. Google
// documents the exchange (see the protocol doc below) as the client answering
// the error challenge with an empty response, and only then does the server
// send the final tagged failure - which is where the reason a human can act on
// lives ("Invalid credentials", "IMAP access is disabled for your domain").
// Failing the SASL exchange here instead abandons the command before that line
// is ever read. Microsoft documents no challenge at all: its servers send the
// tagged failure directly, so Next is never called.
func (a *xoauth2Client) Next(challenge []byte) ([]byte, error) {
	if a.err != nil {
		// The empty response should have drawn the failure out of the server; a
		// second challenge means it won't, so end the exchange rather than loop.
		return nil, a.err
	}

	a.err = &Xoauth2Error{Raw: string(challenge)}
	if err := json.Unmarshal(challenge, a.err); err != nil {
		// Unmarshal may have half-filled the struct before giving up
		a.err = &Xoauth2Error{Raw: string(challenge)}
	}
	return []byte{}, nil
}

// An implementation of the XOAUTH2 authentication mechanism, as described in
// https://developers.google.com/workspace/gmail/imap/xoauth2-protocol.
func NewXoauth2Client(username, token string) sasl.Client {
	return &xoauth2Client{Username: username, Token: token}
}
