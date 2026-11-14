package emails

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"errors"
	"fmt"
	"net"
	"slices"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/emersion/go-imap/v2/imapclient"
	"github.com/emersion/go-smtp"
	"github.com/rs/zerolog"

	"github.com/oxygem/kanmail/internal/constants"
	"github.com/oxygem/kanmail/internal/types"
	"github.com/oxygem/kanmail/internal/util"
)

type serverProtocol string

const (
	protocolIMAP serverProtocol = "imap"
	protocolSMTP serverProtocol = "smtp"
)

// server is where and how to reach an IMAP/SMTP server, everything about a
// connection that can be worked out by trying it
type server struct {
	host     string
	port     int
	ssl      bool
	startTLS bool
}

func serverFromSettings(conf types.ConnectionSettings) server {
	// Connections ignore STARTTLS when SSL is also set
	return server{host: conf.Host, port: conf.Port, ssl: conf.SSL, startTLS: conf.StartTLS && !conf.SSL}
}

func (s server) apply(conf *types.ConnectionSettings) {
	conf.Host = s.host
	conf.Port = s.port
	conf.SSL = s.ssl
	conf.StartTLS = s.startTLS
}

// CopyServer copies where and how to reach a server, leaving everything else
func CopyServer(to *types.ConnectionSettings, from types.ConnectionSettings) {
	serverFromSettings(from).apply(to)
}

func (s server) String() string {
	mode := "insecure"
	if s.ssl {
		mode = "SSL"
	} else if s.startTLS {
		mode = "STARTTLS"
	}
	return fmt.Sprintf("%s:%d (%s)", s.host, s.port, mode)
}

var standardServers = map[serverProtocol][]server{
	protocolIMAP: {{port: 993, ssl: true}, {port: 143, startTLS: true}},
	protocolSMTP: {{port: 465, ssl: true}, {port: 587, startTLS: true}},
}

func standardServersOn(proto serverProtocol, host string) []server {
	servers := slices.Clone(standardServers[proto])
	for i := range servers {
		servers[i].host = host
	}
	return servers
}

// secureServersOn returns both security modes on the port, just the one a
// standard port always uses, and then the standard ports
func secureServersOn(proto serverProtocol, host string, port int) []server {
	servers := slices.DeleteFunc(
		[]server{{host: host, port: port, ssl: true}, {host: host, port: port, startTLS: true}},
		func(s server) bool { return usesOtherStandardMode(proto, s) },
	)
	return appendNew(servers, standardServersOn(proto, host)...)
}

// usesOtherStandardMode is the other security mode on a standard port, which
// never works and for SMTP's STARTTLS waits out the timeout, each side waiting
// for the other to speak
func usesOtherStandardMode(proto serverProtocol, s server) bool {
	return (s.ssl || s.startTLS) && slices.ContainsFunc(standardServers[proto], func(standard server) bool {
		return standard.port == s.port && (standard.ssl != s.ssl || standard.startTLS != s.startTLS)
	})
}

func appendNew(servers []server, more ...server) []server {
	for _, s := range more {
		if !slices.Contains(servers, s) {
			servers = append(servers, s)
		}
	}
	return servers
}

var (
	// Long enough for a slow server, short enough that a port expecting the
	// other security mode (each side waiting for the other to speak) gives up
	probeTimeout = 10 * time.Second

	probeDial = func(ctx context.Context, address string) (net.Conn, error) {
		var dialer net.Dialer
		return dialer.DialContext(ctx, "tcp", address)
	}

	// Set by tests to trust their own certificates, nil uses the system roots
	probeRootCAs *x509.CertPool

	// Long enough for the configured server to answer before the alternatives
	// are tried alongside it, rather than connecting to all of them every time
	probeStagger = time.Second
)

// deadlineConn caps every deadline at the probe's own: the protocol libraries
// set and clear deadlines as they go, using timeouts measured in minutes.
type deadlineConn struct {
	net.Conn
	limit time.Time
}

func (c *deadlineConn) clamp(t time.Time) time.Time {
	if t.IsZero() || t.After(c.limit) {
		return c.limit
	}
	return t
}

func (c *deadlineConn) SetDeadline(t time.Time) error     { return c.Conn.SetDeadline(c.clamp(t)) }
func (c *deadlineConn) SetReadDeadline(t time.Time) error { return c.Conn.SetReadDeadline(c.clamp(t)) }
func (c *deadlineConn) SetWriteDeadline(t time.Time) error {
	return c.Conn.SetWriteDeadline(c.clamp(t))
}

// probeServer connects and secures a connection without logging in, to check
// the server speaks the protocol on that port with that security mode.
func probeServer(ctx context.Context, proto serverProtocol, s server, allowLegacyTLS bool) error {
	ctx, cancel := context.WithTimeout(ctx, probeTimeout)
	defer cancel()
	deadline, _ := ctx.Deadline()

	rawConn, err := probeDial(ctx, net.JoinHostPort(s.host, strconv.Itoa(s.port)))
	if err != nil {
		return err
	}
	// The protocol libraries only watch the connection's deadline, closing it
	// stops them as soon as the probe is cancelled
	stop := context.AfterFunc(ctx, func() { rawConn.Close() })
	defer stop()
	var conn net.Conn = &deadlineConn{Conn: rawConn, limit: deadline}
	defer conn.Close()
	if err := conn.SetDeadline(deadline); err != nil {
		return err
	}

	tlsConfig := newTLSConfig(allowLegacyTLS)
	tlsConfig.ServerName = s.host
	tlsConfig.RootCAs = probeRootCAs

	if s.ssl {
		tlsConn := tls.Client(conn, tlsConfig)
		if err := tlsConn.HandshakeContext(ctx); err != nil {
			return err
		}
		conn = tlsConn
	}

	if proto == protocolSMTP {
		return probeSMTP(conn, s, tlsConfig)
	}
	return probeIMAP(conn, s, tlsConfig)
}

func probeIMAP(conn net.Conn, s server, tlsConfig *tls.Config) error {
	if s.startTLS {
		client, err := imapclient.NewStartTLS(conn, &imapclient.Options{TLSConfig: tlsConfig})
		if err != nil {
			return err
		}
		return client.Close()
	}
	client := imapclient.New(conn, nil)
	defer client.Close()
	return client.WaitGreeting()
}

func probeSMTP(conn net.Conn, s server, tlsConfig *tls.Config) error {
	var client *smtp.Client
	if s.startTLS {
		var err error
		if client, err = smtp.NewClientStartTLS(conn, tlsConfig); err != nil {
			return err
		}
	} else {
		client = smtp.NewClient(conn)
	}
	defer client.Close()
	// Greets and runs EHLO, and finishes the STARTTLS handshake which go-smtp
	// defers to the next command
	return client.Noop()
}

// findServer probes the servers and returns the first, in the order given,
// that works, or each server's error when none do.
func findServer(
	ctx context.Context,
	proto serverProtocol,
	servers []server,
	allowLegacyTLS bool,
	stagger time.Duration,
) (server, bool, []error) {
	return util.FirstSuccess(ctx, len(servers), stagger, func(ctx context.Context, i int) (server, error) {
		err := probeServer(ctx, proto, servers[i], allowLegacyTLS)
		zerolog.Ctx(ctx).Debug().Err(err).Stringer("server", servers[i]).Msg("Probed server")
		return servers[i], err
	})
}

// locateServer returns the first of the servers that works or, when none do,
// the first on the domain itself when their certificates name it: only whoever
// controls the domain can get a certificate for it, where any other name could
// be anyone's, subdomains included as those get handed out (see
// WithCertificateHostHint). Failing that it settles for the first STARTTLS
// server refusing only our TLS version, its greeting having shown it's a mail
// server, for connecting to it to explain how to allow legacy TLS - unless the
// first server failed on its certificate, the error worth reporting.
func locateServer(
	ctx context.Context,
	proto serverProtocol,
	servers []server,
	domain string,
	allowLegacyTLS bool,
	stagger time.Duration,
) (server, bool) {
	found, ok, errs := findServer(ctx, proto, servers, allowLegacyTLS, stagger)
	if ok {
		return found, true
	}

	domain = strings.ToLower(domain)
	tried := slices.Clone(servers)
	for i, err := range errs {
		if domain != "" && slices.Contains(certificateHostnames(err), domain) {
			tried = appendNew(tried, secureServersOn(proto, domain, servers[i].port)...)
		}
	}
	found, ok, certErrs := findServer(ctx, proto, tried[len(servers):], allowLegacyTLS, stagger)
	if ok {
		return found, true
	}

	if len(errs) > 0 && errors.As(errs[0], new(*tls.CertificateVerificationError)) {
		return server{}, false
	}
	allErrs := slices.Concat(errs, certErrs)
	for i, s := range tried {
		if s.startTLS && isTLSVersionError(allErrs[i]) {
			return s, true
		}
	}
	return server{}, false
}

// ServerConnect connects to one of an account's servers with the settings,
// returning the account it made whether or not that worked
type ServerConnect func(
	ctx context.Context,
	conf types.ConnectionSettings,
	authenticated func(),
) (*Account, error)

func ConnectIMAPServer(
	ctx context.Context,
	conf types.ConnectionSettings,
	connect ServerConnect,
) (types.ConnectionSettings, *Account, error) {
	return connectServer(ctx, protocolIMAP, conf, connect)
}

func ConnectSMTPServer(
	ctx context.Context,
	conf types.ConnectionSettings,
	connect ServerConnect,
) (types.ConnectionSettings, *Account, error) {
	return connectServer(ctx, protocolSMTP, conf, connect)
}

// isLoginFailure means the server was reached, so its settings work
func isLoginFailure(err error) bool {
	return errors.As(err, new(LoginError)) || errors.As(err, new(AccessTokenError))
}

type serverConnection interface {
	CloseConnections(ctx context.Context)
}

// connectServer connects with the settings and, should that fail or not log in
// within probeStagger, looks for settings that work alongside it (see
// resolveServerSettings). When those differ it gives up on the connection,
// which can take minutes to time out on a server that never answers, and
// connects with them instead.
func connectServer[C serverConnection](
	ctx context.Context,
	proto serverProtocol,
	conf types.ConnectionSettings,
	connect func(ctx context.Context, conf types.ConnectionSettings, authenticated func()) (C, error),
) (types.ConnectionSettings, C, error) {
	type attempt struct {
		connection C
		err        error
	}
	connectCtx, abandon := context.WithCancel(ctx)
	defer abandon()
	probeCtx, stopProbing := context.WithCancel(ctx)
	var probing sync.WaitGroup
	defer probing.Wait()
	defer stopProbing()

	var authenticated atomic.Bool
	attempts := make(chan attempt, 1)
	go func() {
		connection, err := connect(connectCtx, conf, func() {
			authenticated.Store(true)
			stopProbing()
		})
		attempts <- attempt{connection, err}
	}()

	resolved := make(chan types.ConnectionSettings, 1)
	probe := sync.OnceFunc(func() {
		probing.Go(func() { resolved <- resolveServerSettings(probeCtx, proto, conf) })
	})
	stagger := time.NewTimer(probeStagger)
	defer stagger.Stop()

	var connected *attempt
	for {
		select {
		case <-stagger.C:
			probe()
		case got := <-attempts:
			if got.err == nil || authenticated.Load() || isLoginFailure(got.err) {
				return conf, got.connection, got.err
			}
			connected = &got
			probe()
		case found := <-resolved:
			if !authenticated.Load() && serverFromSettings(found) != serverFromSettings(conf) {
				abandon()
				if connected != nil {
					connected.connection.CloseConnections(ctx)
				} else {
					go func() { (<-attempts).connection.CloseConnections(context.WithoutCancel(ctx)) }()
				}
				connection, err := connect(ctx, found, func() {})
				return found, connection, err
			}
			if connected == nil {
				got := <-attempts
				connected = &got
			}
			return conf, connected.connection, connected.err
		}
	}
}

// resolveServerSettings checks the settings reach a server speaking the
// protocol, trying the other security mode and the standard ports on the same
// host when they don't (see locateServer). Nobody cares which port and mode are
// used as long as they work. When nothing does the settings come back
// unchanged, for the real connection to report what's wrong with them.
func resolveServerSettings(
	ctx context.Context,
	proto serverProtocol,
	conf types.ConnectionSettings,
) types.ConnectionSettings {
	if constants.ENV_DEBUG_FAKE_IMAP != "" || constants.ENV_DEBUG_OFFLINE != "" || conf.Host == "" {
		return conf
	}

	configured := serverFromSettings(conf)
	var servers []server
	// Credentials are never sent without TLS, so an insecure server is only
	// worth trying without any
	insecureAllowed := conf.Password == "" && conf.OAuthRefreshToken == ""
	if (configured.ssl || configured.startTLS || insecureAllowed) && !usesOtherStandardMode(proto, configured) {
		servers = append(servers, configured)
	}
	servers = appendNew(servers, secureServersOn(proto, configured.host, configured.port)...)

	log := zerolog.Ctx(ctx)
	found, ok := locateServer(ctx, proto, servers, emailDomain(conf.Username), conf.AllowLegacyTLS, probeStagger)
	if !ok {
		if ctx.Err() == nil {
			log.Warn().Stringer("server", configured).Msg("Found no working server settings")
		}
		return conf
	}
	if found != configured {
		log.Info().Stringer("from", configured).Stringer("to", found).Msg("Found working server settings")
	}
	found.apply(&conf)
	return conf
}

// certificateHostnames returns the names on a certificate rejected for not
// covering the host connected to
func certificateHostnames(err error) []string {
	var hostErr x509.HostnameError
	if !errors.As(err, &hostErr) || hostErr.Certificate == nil {
		return nil
	}
	var names []string
	for _, name := range hostErr.Certificate.DNSNames {
		name = strings.ToLower(name)
		if strings.Contains(name, "*") || name == strings.ToLower(hostErr.Host) || slices.Contains(names, name) {
			continue
		}
		names = append(names, name)
	}
	return names
}

func emailDomain(email string) string {
	at := strings.LastIndex(email, "@")
	if at < 0 {
		return ""
	}
	return strings.ToLower(email[at+1:])
}

// WithCertificateHostHint adds the names a server's certificate is valid for
// to an error about it not covering the host: on shared hosting the server to
// use is often the provider's own name rather than one in the email's domain.
func WithCertificateHostHint(err error) error {
	names := certificateHostnames(err)
	if len(names) == 0 || !certificateChainTrusted(err) {
		return err
	}
	if len(names) > 3 {
		names = names[:3]
	}
	advice := "try that as the server"
	if len(names) > 1 {
		advice = "try one of those as the server"
	}
	return fmt.Errorf("%w (the server's certificate is for %s, %s)", err, strings.Join(names, ", "), advice)
}

// certificateChainTrusted says whether a certificate rejected for its hostname
// is otherwise valid. The hostname is checked first, so the rejected one could
// be anyone's self-signed certificate naming any host they like.
func certificateChainTrusted(err error) bool {
	var verifyErr *tls.CertificateVerificationError
	if !errors.As(err, &verifyErr) || len(verifyErr.UnverifiedCertificates) == 0 {
		return false
	}
	intermediates := x509.NewCertPool()
	for _, cert := range verifyErr.UnverifiedCertificates[1:] {
		intermediates.AddCert(cert)
	}
	_, err = verifyErr.UnverifiedCertificates[0].Verify(x509.VerifyOptions{
		Roots:         probeRootCAs,
		Intermediates: intermediates,
	})
	return err == nil
}
