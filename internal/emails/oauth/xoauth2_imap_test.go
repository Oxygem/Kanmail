package oauth

import (
	"bufio"
	"context"
	"encoding/base64"
	"net"
	"strings"
	"testing"

	"github.com/emersion/go-imap/v2/imapclient"

	"github.com/oxygem/kanmail/internal/types"
)

// The reason a login was refused is only ever in the tagged response, and the
// server only sends it once the error challenge has been answered. This drives
// a real client against a server that behaves the way Google's does, because
// the whole exchange is what has to hold - not any one half of it.
func TestXoauth2LoginReportsServerAlert(t *testing.T) {
	const alert = "NO [ALERT] Invalid credentials (Failure)"
	challenge := base64.StdEncoding.EncodeToString(
		[]byte(`{"status":"400","schemes":"Bearer","scope":"https://mail.google.com/"}`),
	)

	serverConn, clientConn := net.Pipe()
	defer serverConn.Close()

	challengeResponse := make(chan string, 1)
	go func() {
		defer serverConn.Close()
		reader := bufio.NewReader(serverConn)

		// Advertising the capabilities up front keeps the client from asking,
		// so the next line to arrive is the AUTHENTICATE we care about
		serverConn.Write([]byte("* OK [CAPABILITY IMAP4rev1 SASL-IR AUTH=XOAUTH2] ready\r\n"))

		command, err := reader.ReadString('\n')
		if err != nil {
			return
		}
		tag, _, _ := strings.Cut(command, " ")

		serverConn.Write([]byte("+ " + challenge + "\r\n"))
		response, err := reader.ReadString('\n')
		challengeResponse <- response
		if err != nil {
			return
		}
		serverConn.Write([]byte(tag + " " + alert + "\r\n"))
	}()

	client := imapclient.New(clientConn, nil)
	defer client.Close()

	conf := types.ConnectionSettings{
		Username:      "user@example.com",
		OAuthProvider: "gmail",
	}
	// Empty token: the diagnostic probe is skipped rather than reaching out to
	// Google from a test
	saslClient := MakeSASLClient(conf, "")

	err := client.Authenticate(saslClient)
	if err == nil {
		t.Fatal("expected the login to fail")
	}

	// Google's protocol doc has the client answer the error challenge with an
	// empty line - "=" only means empty inside the AUTHENTICATE command itself
	// (RFC 4959), and a real server would reject it as invalid base64
	if response := <-challengeResponse; response != "\r\n" {
		t.Fatalf("challenge response = %q, want an empty line", response)
	}

	err = DiagnoseAuthError(context.Background(), conf, "", saslClient, err)

	for _, want := range []string{"400", "https://mail.google.com/", "Invalid credentials"} {
		if !strings.Contains(err.Error(), want) {
			t.Fatalf("Error() = %q, want it to mention %q", err.Error(), want)
		}
	}
}
