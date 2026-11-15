package emails

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"errors"
	"io"
	"math/big"
	"net"
	"testing"
	"time"

	"github.com/emersion/go-smtp"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/oxygem/kanmail/internal/constants"
)

func selfSignedCert(t *testing.T) tls.Certificate {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	require.NoError(t, err)
	template := &x509.Certificate{
		SerialNumber: big.NewInt(1),
		DNSNames:     []string{"localhost"},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().Add(time.Hour),
	}
	der, err := x509.CreateCertificate(rand.Reader, template, template, &key.PublicKey, key)
	require.NoError(t, err)
	return tls.Certificate{Certificate: [][]byte{der}, PrivateKey: key}
}

func listenTLS10SMTP(t *testing.T) string {
	t.Helper()
	listener, err := tls.Listen("tcp", "127.0.0.1:0", &tls.Config{
		Certificates: []tls.Certificate{selfSignedCert(t)},
		MinVersion:   tls.VersionTLS10,
		MaxVersion:   tls.VersionTLS10,
	})
	require.NoError(t, err)
	t.Cleanup(func() { listener.Close() })

	go func() {
		for {
			conn, err := listener.Accept()
			if err != nil {
				return
			}
			go func() {
				defer conn.Close()
				if _, err := conn.Write([]byte("220 localhost ESMTP\r\n")); err == nil {
					io.Copy(io.Discard, conn)
				}
			}()
		}
	}()
	return listener.Addr().String()
}

type nopSMTPSession struct{}

func (nopSMTPSession) Reset()                               {}
func (nopSMTPSession) Logout() error                        { return nil }
func (nopSMTPSession) Mail(string, *smtp.MailOptions) error { return nil }
func (nopSMTPSession) Rcpt(string, *smtp.RcptOptions) error { return nil }
func (nopSMTPSession) Data(io.Reader) error                 { return nil }

func listenTLS10StartTLSSMTP(t *testing.T) string {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)

	server := smtp.NewServer(smtp.BackendFunc(func(*smtp.Conn) (smtp.Session, error) {
		return nopSMTPSession{}, nil
	}))
	server.Domain = "localhost"
	server.TLSConfig = &tls.Config{
		Certificates: []tls.Certificate{selfSignedCert(t)},
		MinVersion:   tls.VersionTLS10,
		MaxVersion:   tls.VersionTLS10,
	}
	go server.Serve(listener)
	t.Cleanup(func() { server.Close() })
	return listener.Addr().String()
}

func skipTLSVerification(t *testing.T) {
	prev := constants.ENV_DEBUG_TLS_INSECURE
	constants.ENV_DEBUG_TLS_INSECURE = "1"
	t.Cleanup(func() { constants.ENV_DEBUG_TLS_INSECURE = prev })
}

func TestDialWithTLSCheckReportsLegacyVersion(t *testing.T) {
	skipTLSVerification(t)
	addr := listenTLS10SMTP(t)
	dial := func(tlsConfig *tls.Config) (*smtp.Client, error) {
		return smtp.DialTLS(addr, tlsConfig)
	}

	_, err := dialWithTLSCheck(false, dial)

	var legacyErr *LegacyTLSError
	require.ErrorAs(t, err, &legacyErr)
	assert.Equal(t, uint16(tls.VersionTLS10), legacyErr.Version)
	assert.Equal(t,
		`server only supports TLS 1.0 (Kanmail requires TLS 1.2 or newer), enable "Legacy TLS" to connect anyway`,
		err.Error(),
	)
}

func TestDialWithTLSCheckAllowsLegacyTLS(t *testing.T) {
	skipTLSVerification(t)
	addr := listenTLS10SMTP(t)

	client, err := dialWithTLSCheck(true, func(tlsConfig *tls.Config) (*smtp.Client, error) {
		return smtp.DialTLS(addr, tlsConfig)
	})

	require.NoError(t, err)
	client.Close()
}

func TestDialWithTLSCheckReportsLegacyVersionOverStartTLS(t *testing.T) {
	skipTLSVerification(t)
	addr := listenTLS10StartTLSSMTP(t)
	dial := func(tlsConfig *tls.Config) (*smtp.Client, error) {
		return dialSMTPStartTLS(addr, tlsConfig)
	}

	_, err := dialWithTLSCheck(false, dial)

	var legacyErr *LegacyTLSError
	require.ErrorAs(t, err, &legacyErr)
	assert.Equal(t, uint16(tls.VersionTLS10), legacyErr.Version)

	client, err := dialWithTLSCheck(true, dial)
	require.NoError(t, err)
	state, ok := client.TLSConnectionState()
	assert.True(t, ok)
	assert.Equal(t, uint16(tls.VersionTLS10), state.Version)
	client.Close()
}

func TestDialWithTLSCheckPassesThroughOtherErrors(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	addr := listener.Addr().String()
	listener.Close()

	_, err = dialWithTLSCheck(false, func(tlsConfig *tls.Config) (*smtp.Client, error) {
		return smtp.DialTLS(addr, tlsConfig)
	})

	require.Error(t, err)
	var legacyErr *LegacyTLSError
	assert.False(t, errors.As(err, &legacyErr))
}

func TestIsTLSVersionError(t *testing.T) {
	assert.True(t, isTLSVersionError(errors.New("tls: server selected unsupported protocol version 301")))
	assert.False(t, isTLSVersionError(errors.New("tls: failed to verify certificate: x509: certificate signed by unknown authority")))
}

func TestLegacyTLSErrorWithoutVersion(t *testing.T) {
	assert.Equal(t,
		`server only supports an outdated TLS version (Kanmail requires TLS 1.2 or newer), enable "Legacy TLS" to connect anyway`,
		(&LegacyTLSError{}).Error(),
	)
}

func TestLoginErrorLeavesOutLostConnections(t *testing.T) {
	assert.Equal(t, io.ErrUnexpectedEOF, newLoginError(io.ErrUnexpectedEOF))
	assert.ErrorAs(t, newLoginError(errors.New("bad password")), new(LoginError))
}
