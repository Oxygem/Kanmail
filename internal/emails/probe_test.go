package emails

import (
	"bufio"
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"errors"
	"math/big"
	"net"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/oxygem/kanmail/internal/types"
)

type testCA struct {
	cert *x509.Certificate
	key  *ecdsa.PrivateKey
	pool *x509.CertPool
}

func newTestCA(t *testing.T) *testCA {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	require.NoError(t, err)
	template := &x509.Certificate{
		SerialNumber:          big.NewInt(1),
		Subject:               pkix.Name{CommonName: "Kanmail Test CA"},
		NotBefore:             time.Now().Add(-time.Hour),
		NotAfter:              time.Now().Add(time.Hour),
		IsCA:                  true,
		KeyUsage:              x509.KeyUsageCertSign,
		BasicConstraintsValid: true,
	}
	der, err := x509.CreateCertificate(rand.Reader, template, template, &key.PublicKey, key)
	require.NoError(t, err)
	cert, err := x509.ParseCertificate(der)
	require.NoError(t, err)
	pool := x509.NewCertPool()
	pool.AddCert(cert)
	return &testCA{cert: cert, key: key, pool: pool}
}

func (ca *testCA) issue(t *testing.T, names ...string) tls.Certificate {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	require.NoError(t, err)
	template := &x509.Certificate{
		SerialNumber: big.NewInt(2),
		Subject:      pkix.Name{CommonName: names[0]},
		DNSNames:     names,
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().Add(time.Hour),
		KeyUsage:     x509.KeyUsageDigitalSignature,
		ExtKeyUsage:  []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
	}
	der, err := x509.CreateCertificate(rand.Reader, template, ca.cert, &key.PublicKey, ca.key)
	require.NoError(t, err)
	return tls.Certificate{Certificate: [][]byte{der}, PrivateKey: key}
}

type testServerMode string

const (
	modeSSL            testServerMode = "ssl"
	modeStartTLS       testServerMode = "starttls"
	modeLegacyStartTLS testServerMode = "legacy-starttls"
	modeLegacySSL      testServerMode = "legacy-ssl"
)

// startTestServer runs a server that speaks just enough IMAP or SMTP to be
// probed, returning its address
func startTestServer(t *testing.T, proto serverProtocol, mode testServerMode, cert tls.Certificate) string {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	t.Cleanup(func() { listener.Close() })

	tlsConfig := &tls.Config{Certificates: []tls.Certificate{cert}}
	if mode == modeLegacyStartTLS || mode == modeLegacySSL {
		tlsConfig.MinVersion, tlsConfig.MaxVersion = tls.VersionTLS10, tls.VersionTLS10
	}
	implicitTLS := mode == modeSSL || mode == modeLegacySSL
	go func() {
		for {
			conn, err := listener.Accept()
			if err != nil {
				return
			}
			go func() {
				defer conn.Close()
				if implicitTLS {
					conn = tls.Server(conn, tlsConfig)
				}
				serveTestConn(conn, proto, !implicitTLS, tlsConfig)
			}()
		}
	}()
	return listener.Addr().String()
}

func serveTestConn(conn net.Conn, proto serverProtocol, offerStartTLS bool, tlsConfig *tls.Config) {
	reader := bufio.NewReader(conn)
	write := func(lines ...string) {
		_, _ = conn.Write([]byte(strings.Join(lines, "\r\n") + "\r\n"))
	}
	upgrade := func() {
		conn = tls.Server(conn, tlsConfig)
		reader = bufio.NewReader(conn)
		offerStartTLS = false
	}

	if proto == protocolSMTP {
		write("220 test ESMTP")
	} else if offerStartTLS {
		write("* OK [CAPABILITY IMAP4rev1 STARTTLS] ready")
	} else {
		write("* OK [CAPABILITY IMAP4rev1] ready")
	}

	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			return
		}
		fields := strings.Fields(strings.ToUpper(line))
		if len(fields) == 0 {
			continue
		}

		if proto == protocolSMTP {
			switch fields[0] {
			case "EHLO", "HELO":
				if offerStartTLS {
					write("250-test", "250 STARTTLS")
				} else {
					write("250 test")
				}
			case "STARTTLS":
				write("220 go ahead")
				upgrade()
			case "QUIT":
				write("221 bye")
				return
			default:
				write("250 ok")
			}
			continue
		}

		if len(fields) < 2 {
			continue
		}
		tag := strings.Fields(line)[0]
		switch fields[1] {
		case "STARTTLS":
			write(tag + " OK begin TLS")
			upgrade()
		case "LOGOUT":
			write("* BYE", tag+" OK")
			return
		default:
			write(tag + " OK")
		}
	}
}

// useTestNetwork routes probes for host:port to the given addresses, anything
// else is refused
func useTestNetwork(t *testing.T, ca *testCA, routes map[string]string) {
	t.Helper()
	originalDial, originalTimeout, originalRoots := probeDial, probeTimeout, probeRootCAs
	t.Cleanup(func() {
		probeDial, probeTimeout, probeRootCAs = originalDial, originalTimeout, originalRoots
	})

	probeTimeout = time.Second
	probeRootCAs = ca.pool
	probeDial = func(ctx context.Context, address string) (net.Conn, error) {
		target, ok := routes[address]
		if !ok {
			return nil, &net.OpError{Op: "dial", Net: "tcp", Err: syscall.ECONNREFUSED}
		}
		var dialer net.Dialer
		return dialer.DialContext(ctx, "tcp", target)
	}
}

func imapSettings(host string, port int, ssl, startTLS bool) types.ConnectionSettings {
	return types.ConnectionSettings{
		Host:     host,
		Port:     port,
		SSL:      ssl,
		StartTLS: startTLS,
		Username: "someone@example.com",
		Password: "secret",
	}
}

func countProbes(t *testing.T) *atomic.Int32 {
	t.Helper()
	var probes atomic.Int32
	dial := probeDial
	t.Cleanup(func() { probeDial = dial })
	probeDial = func(ctx context.Context, address string) (net.Conn, error) {
		probes.Add(1)
		return dial(ctx, address)
	}
	return &probes
}

func useProbeStagger(t *testing.T, stagger time.Duration) {
	t.Helper()
	original := probeStagger
	t.Cleanup(func() { probeStagger = original })
	probeStagger = stagger
}

func TestResolveKeepsWorkingSettings(t *testing.T) {
	ca := newTestCA(t)
	addr := startTestServer(t, protocolIMAP, modeSSL, ca.issue(t, "imap.example.com"))
	useTestNetwork(t, ca, map[string]string{"imap.example.com:993": addr})

	conf := imapSettings("imap.example.com", 993, true, false)
	assert.Equal(t, conf, resolveServerSettings(t.Context(), protocolIMAP, conf))
}

func TestResolveSwitchesSSLToStartTLS(t *testing.T) {
	ca := newTestCA(t)
	addr := startTestServer(t, protocolIMAP, modeStartTLS, ca.issue(t, "mail.example.com"))
	useTestNetwork(t, ca, map[string]string{"mail.example.com:143": addr})

	resolved := resolveServerSettings(t.Context(), protocolIMAP, imapSettings("mail.example.com", 143, true, false))
	assert.Equal(t, imapSettings("mail.example.com", 143, false, true), resolved)
}

func TestResolveSwitchesStartTLSToSSL(t *testing.T) {
	ca := newTestCA(t)
	addr := startTestServer(t, protocolIMAP, modeSSL, ca.issue(t, "mail.example.com"))
	useTestNetwork(t, ca, map[string]string{"mail.example.com:993": addr})

	resolved := resolveServerSettings(t.Context(), protocolIMAP, imapSettings("mail.example.com", 993, false, true))
	assert.Equal(t, imapSettings("mail.example.com", 993, true, false), resolved)
}

func TestResolveTreatsBothSecurityModesAsSSL(t *testing.T) {
	ca := newTestCA(t)
	addr := startTestServer(t, protocolIMAP, modeSSL, ca.issue(t, "mail.example.com"))
	useTestNetwork(t, ca, map[string]string{"mail.example.com:993": addr})

	resolved := resolveServerSettings(t.Context(), protocolIMAP, imapSettings("mail.example.com", 993, true, true))
	assert.Equal(t, imapSettings("mail.example.com", 993, true, false), resolved)
}

func TestResolveSkipsOtherModeOnStandardPort(t *testing.T) {
	ca := newTestCA(t)
	useTestNetwork(t, ca, map[string]string{
		"smtp.example.com:465": startTestServer(t, protocolSMTP, modeSSL, newTestCA(t).issue(t, "smtp.example.com")),
		"smtp.example.com:587": startTestServer(t, protocolSMTP, modeStartTLS, ca.issue(t, "smtp.example.com")),
	})
	// STARTTLS on the SSL port waits out the whole timeout for a greeting
	probeTimeout = 5 * time.Second

	started := time.Now()
	resolved := resolveServerSettings(t.Context(), protocolSMTP, imapSettings("smtp.example.com", 465, true, false))
	assert.Equal(t, imapSettings("smtp.example.com", 587, false, true), resolved)
	assert.Less(t, time.Since(started), 2*time.Second)
}

func TestResolveSecuresInsecureSettings(t *testing.T) {
	ca := newTestCA(t)
	addr := startTestServer(t, protocolIMAP, modeStartTLS, ca.issue(t, "mail.example.com"))
	useTestNetwork(t, ca, map[string]string{"mail.example.com:143": addr})

	resolved := resolveServerSettings(t.Context(), protocolIMAP, imapSettings("mail.example.com", 143, false, false))
	assert.Equal(t, imapSettings("mail.example.com", 143, false, true), resolved)
}

func TestResolveTriesStandardPorts(t *testing.T) {
	ca := newTestCA(t)
	cert := ca.issue(t, "smtp.example.com")
	useTestNetwork(t, ca, map[string]string{
		"smtp.example.com:465": startTestServer(t, protocolSMTP, modeSSL, cert),
		"smtp.example.com:587": startTestServer(t, protocolSMTP, modeStartTLS, cert),
	})

	resolved := resolveServerSettings(t.Context(), protocolSMTP, imapSettings("smtp.example.com", 25, false, true))
	assert.Equal(t, imapSettings("smtp.example.com", 465, true, false), resolved)
}

func TestResolveSwitchesSMTPStartTLSPort(t *testing.T) {
	ca := newTestCA(t)
	addr := startTestServer(t, protocolSMTP, modeStartTLS, ca.issue(t, "smtp.example.com"))
	useTestNetwork(t, ca, map[string]string{"smtp.example.com:587": addr})

	resolved := resolveServerSettings(t.Context(), protocolSMTP, imapSettings("smtp.example.com", 465, true, false))
	assert.Equal(t, imapSettings("smtp.example.com", 587, false, true), resolved)
}

func TestResolveSwitchesToCertificateNameInEmailDomain(t *testing.T) {
	ca := newTestCA(t)
	addr := startTestServer(t, protocolIMAP, modeSSL, ca.issue(t, "example.com", "www.example.com"))
	useTestNetwork(t, ca, map[string]string{
		"mail.example.com:993": addr,
		"example.com:993":      addr,
	})

	resolved := resolveServerSettings(t.Context(), protocolIMAP, imapSettings("mail.example.com", 993, true, false))
	assert.Equal(t, imapSettings("example.com", 993, true, false), resolved)
}

func TestResolveIgnoresCertificateNameOnlySharingHostsDomain(t *testing.T) {
	ca := newTestCA(t)
	addr := startTestServer(t, protocolIMAP, modeSSL, ca.issue(t, "attacker.dyn.example.net"))
	useTestNetwork(t, ca, map[string]string{
		"myhome.dyn.example.net:993":   addr,
		"attacker.dyn.example.net:993": addr,
	})

	conf := imapSettings("myhome.dyn.example.net", 993, true, false)
	assert.Equal(t, conf, resolveServerSettings(t.Context(), protocolIMAP, conf))
}

func TestResolveOnlySuggestsCertificateSubdomainOfEmailDomain(t *testing.T) {
	ca := newTestCA(t)
	addr := startTestServer(t, protocolIMAP, modeSSL, ca.issue(t, "box.example.com"))
	useTestNetwork(t, ca, map[string]string{
		"mail.example.com:993": addr,
		"box.example.com:993":  addr,
	})

	conf := imapSettings("mail.example.com", 993, true, false)
	assert.Equal(t, conf, resolveServerSettings(t.Context(), protocolIMAP, conf))

	err := probeServer(t.Context(), protocolIMAP, serverFromSettings(conf), false)
	assert.Contains(t, WithCertificateHostHint(err).Error(), "certificate is for box.example.com")
}

func TestResolveOnlySuggestsCertificateNameInOtherDomain(t *testing.T) {
	ca := newTestCA(t)
	addr := startTestServer(t, protocolIMAP, modeSSL, ca.issue(t, "server1.hostco.net"))
	useTestNetwork(t, ca, map[string]string{
		"mail.example.com:993":   addr,
		"server1.hostco.net:993": addr,
	})

	conf := imapSettings("mail.example.com", 993, true, false)
	assert.Equal(t, conf, resolveServerSettings(t.Context(), protocolIMAP, conf))

	err := probeServer(t.Context(), protocolIMAP, serverFromSettings(conf), false)
	require.Error(t, err)
	assert.Contains(t, WithCertificateHostHint(err).Error(), "certificate is for server1.hostco.net, try that as the server")
}

func TestResolveFindsLegacyTLSServerOnAnotherPort(t *testing.T) {
	ca := newTestCA(t)
	addr := startTestServer(t, protocolIMAP, modeLegacyStartTLS, ca.issue(t, "mail.example.com"))
	useTestNetwork(t, ca, map[string]string{"mail.example.com:143": addr})

	resolved := resolveServerSettings(t.Context(), protocolIMAP, imapSettings("mail.example.com", 993, true, false))
	assert.Equal(t, imapSettings("mail.example.com", 143, false, true), resolved)
}

func TestResolveIgnoresLegacyTLSOnSSLPort(t *testing.T) {
	ca := newTestCA(t)
	addr := startTestServer(t, protocolIMAP, modeLegacySSL, ca.issue(t, "mail.example.com"))
	useTestNetwork(t, ca, map[string]string{"mail.example.com:993": addr})

	conf := imapSettings("mail.example.com", 143, false, true)
	assert.Equal(t, conf, resolveServerSettings(t.Context(), protocolIMAP, conf))
}

func TestResolveKeepsCertificateErrorOverLegacyTLSServer(t *testing.T) {
	ca := newTestCA(t)
	useTestNetwork(t, ca, map[string]string{
		"mail.example.com:993": startTestServer(t, protocolIMAP, modeSSL, newTestCA(t).issue(t, "mail.example.com")),
		"mail.example.com:143": startTestServer(t, protocolIMAP, modeLegacyStartTLS, ca.issue(t, "mail.example.com")),
	})

	conf := imapSettings("mail.example.com", 993, true, false)
	assert.Equal(t, conf, resolveServerSettings(t.Context(), protocolIMAP, conf))
}

func TestResolvePrefersWorkingServerToLegacyTLSOne(t *testing.T) {
	ca := newTestCA(t)
	cert := ca.issue(t, "mail.example.com")
	useTestNetwork(t, ca, map[string]string{
		"mail.example.com:143": startTestServer(t, protocolIMAP, modeLegacyStartTLS, cert),
		"mail.example.com:993": startTestServer(t, protocolIMAP, modeSSL, cert),
	})

	resolved := resolveServerSettings(t.Context(), protocolIMAP, imapSettings("mail.example.com", 143, false, true))
	assert.Equal(t, imapSettings("mail.example.com", 993, true, false), resolved)
}

func TestResolveKeepsSettingsWhenNothingWorks(t *testing.T) {
	ca := newTestCA(t)
	useTestNetwork(t, ca, map[string]string{})

	conf := imapSettings("mail.example.com", 993, true, false)
	assert.Equal(t, conf, resolveServerSettings(t.Context(), protocolIMAP, conf))
}

func TestCertificateHostHintIgnoresUntrustedCertificate(t *testing.T) {
	ca := newTestCA(t)
	untrusted := newTestCA(t).issue(t, "server1.attacker.net")
	useTestNetwork(t, ca, map[string]string{
		"mail.example.com:993": startTestServer(t, protocolIMAP, modeSSL, untrusted),
	})

	err := probeServer(t.Context(), protocolIMAP, server{host: "mail.example.com", port: 993, ssl: true}, false)
	require.Equal(t, []string{"server1.attacker.net"}, certificateHostnames(err))
	assert.Equal(t, err, WithCertificateHostHint(err))
}

func TestCertificateHostHintIgnoresOtherErrors(t *testing.T) {
	err := errors.New("connection refused")
	assert.Equal(t, err, WithCertificateHostHint(err))
}

type testConnection struct {
	conf   types.ConnectionSettings
	closed atomic.Bool
}

func (c *testConnection) CloseConnections(context.Context) { c.closed.Store(true) }

// connectTo returns a connect that only works with the settings given,
// failing straight away or, when hang is set, once abandoned
func connectTo(works types.ConnectionSettings, hang bool, made *[]*testConnection) func(
	context.Context, types.ConnectionSettings, func(),
) (*testConnection, error) {
	var lock sync.Mutex
	return func(ctx context.Context, conf types.ConnectionSettings, authenticated func()) (*testConnection, error) {
		connection := &testConnection{conf: conf}
		lock.Lock()
		*made = append(*made, connection)
		lock.Unlock()
		if conf == works {
			authenticated()
			return connection, nil
		}
		if hang {
			<-ctx.Done()
		}
		return connection, errors.New("connection failed")
	}
}

func TestConnectDoesNotProbeSettingsThatLogIn(t *testing.T) {
	useTestNetwork(t, newTestCA(t), map[string]string{})
	probes := countProbes(t)

	conf := imapSettings("mail.example.com", 993, true, false)
	var made []*testConnection
	connected, connection, err := connectServer(t.Context(), protocolIMAP, conf, connectTo(conf, false, &made))
	require.NoError(t, err)
	assert.Equal(t, conf, connected)
	assert.Equal(t, conf, connection.conf)
	assert.Len(t, made, 1)
	assert.Zero(t, probes.Load())
}

func TestConnectSwitchesToSettingsThatWork(t *testing.T) {
	ca := newTestCA(t)
	addr := startTestServer(t, protocolIMAP, modeSSL, ca.issue(t, "mail.example.com"))
	useTestNetwork(t, ca, map[string]string{"mail.example.com:993": addr})

	working := imapSettings("mail.example.com", 993, true, false)
	var made []*testConnection
	connected, connection, err := connectServer(t.Context(), protocolIMAP,
		imapSettings("mail.example.com", 993, false, true), connectTo(working, false, &made))
	require.NoError(t, err)
	assert.Equal(t, working, connected)
	assert.Equal(t, working, connection.conf)
	require.Len(t, made, 2)
	assert.True(t, made[0].closed.Load())
}

func TestConnectGivesUpOnConnectionThatHangs(t *testing.T) {
	ca := newTestCA(t)
	addr := startTestServer(t, protocolIMAP, modeSSL, ca.issue(t, "mail.example.com"))
	useTestNetwork(t, ca, map[string]string{"mail.example.com:993": addr})
	useProbeStagger(t, 10*time.Millisecond)

	working := imapSettings("mail.example.com", 993, true, false)
	var made []*testConnection
	connected, _, err := connectServer(t.Context(), protocolIMAP,
		imapSettings("mail.example.com", 993, false, true), connectTo(working, true, &made))
	require.NoError(t, err)
	assert.Equal(t, working, connected)
	assert.Eventually(t, made[0].closed.Load, time.Second, 10*time.Millisecond)
}

func TestConnectKeepsSettingsThatLoggedIn(t *testing.T) {
	ca := newTestCA(t)
	addr := startTestServer(t, protocolIMAP, modeSSL, ca.issue(t, "mail.example.com"))
	useTestNetwork(t, ca, map[string]string{"mail.example.com:993": addr})
	useProbeStagger(t, 10*time.Millisecond)

	conf := imapSettings("mail.example.com", 993, false, true)
	listErr := errors.New("failed listing folders")
	connected, _, err := connectServer(t.Context(), protocolIMAP, conf,
		func(ctx context.Context, conf types.ConnectionSettings, authenticated func()) (*testConnection, error) {
			authenticated()
			time.Sleep(50 * time.Millisecond)
			return &testConnection{conf: conf}, listErr
		})
	assert.Equal(t, listErr, err)
	assert.Equal(t, conf, connected)
}

func TestConnectReportsLoginFailureWithoutProbing(t *testing.T) {
	useTestNetwork(t, newTestCA(t), map[string]string{})
	probes := countProbes(t)

	conf := imapSettings("mail.example.com", 993, true, false)
	loginErr := LoginError{errors.New("bad password")}
	connected, _, err := connectServer(t.Context(), protocolIMAP, conf,
		func(ctx context.Context, conf types.ConnectionSettings, authenticated func()) (*testConnection, error) {
			return &testConnection{conf: conf}, loginErr
		})
	assert.Equal(t, loginErr, err)
	assert.Equal(t, conf, connected)
	assert.Zero(t, probes.Load())
}
