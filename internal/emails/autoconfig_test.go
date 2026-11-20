package emails

import (
	"context"
	"encoding/xml"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/oxygem/kanmail/internal/types"
)

func testDefaults() types.AccountSettings {
	settings := types.AccountSettings{
		Name: "nick@example.com",
		IMAPSettings: types.ConnectionSettings{
			Username: "nick@example.com",
			Host:     "example.com",
			Port:     993,
			SSL:      true,
		},
		SMTPSettings: types.ConnectionSettings{
			Username: "nick@example.com",
			Host:     "example.com",
			Port:     465,
			SSL:      true,
		},
	}
	settings.Settings.CopyFromInbox = true
	return settings
}

func parseAutoconfXML(t *testing.T, doc string) autoconfData {
	t.Helper()
	var data autoconfData
	require.NoError(t, xml.Unmarshal([]byte(doc), &data))
	return data
}

func TestParseAutoconfAppliesServersOverDefaults(t *testing.T) {
	data := parseAutoconfXML(t, `
		<clientConfig version="1.1">
			<emailProvider id="example.com">
				<incomingServer type="imap">
					<hostname>imap.example.com</hostname>
					<port>143</port>
					<socketType>STARTTLS</socketType>
				</incomingServer>
				<outgoingServer type="smtp">
					<hostname>smtp.example.com</hostname>
					<port>587</port>
					<socketType>SSL</socketType>
				</outgoingServer>
			</emailProvider>
		</clientConfig>`)

	settings, err := parseAutoconf(data, testDefaults())
	require.NoError(t, err)

	assert.Equal(t, "imap.example.com", settings.IMAPSettings.Host)
	assert.Equal(t, 143, settings.IMAPSettings.Port)
	assert.False(t, settings.IMAPSettings.SSL)
	assert.True(t, settings.IMAPSettings.StartTLS)

	assert.Equal(t, "smtp.example.com", settings.SMTPSettings.Host)
	assert.Equal(t, 587, settings.SMTPSettings.Port)
	assert.True(t, settings.SMTPSettings.SSL)
	assert.False(t, settings.SMTPSettings.StartTLS)

	// Everything the document doesn't describe comes from the defaults
	assert.Equal(t, types.AccountName("nick@example.com"), settings.Name)
	assert.Equal(t, "nick@example.com", settings.IMAPSettings.Username)
	assert.Equal(t, "nick@example.com", settings.SMTPSettings.Username)
	assert.True(t, settings.Settings.CopyFromInbox)
}

func TestParseAutoconfSkipsUnusableServers(t *testing.T) {
	data := parseAutoconfXML(t, `
		<clientConfig version="1.1">
			<emailProvider id="example.com">
				<incomingServer type="pop3">
					<hostname>pop.example.com</hostname>
					<port>995</port>
					<socketType>SSL</socketType>
				</incomingServer>
				<incomingServer type="imap">
					<hostname></hostname>
					<port>993</port>
					<socketType>SSL</socketType>
				</incomingServer>
				<incomingServer type="imap">
					<hostname>imap.example.com</hostname>
					<port>993</port>
					<socketType>SSL</socketType>
				</incomingServer>
				<outgoingServer type="smtp">
					<hostname>smtp.example.com</hostname>
					<port>587</port>
					<socketType>STARTTLS</socketType>
				</outgoingServer>
			</emailProvider>
		</clientConfig>`)

	settings, err := parseAutoconf(data, testDefaults())
	require.NoError(t, err)
	assert.Equal(t, "imap.example.com", settings.IMAPSettings.Host)
}

func TestParseAutoconfRejectsUnusableDocuments(t *testing.T) {
	for name, doc := range map[string]string{
		"empty": `<clientConfig version="1.1"></clientConfig>`,
		"no servers": `
			<clientConfig version="1.1">
				<emailProvider id="example.com">
					<displayName>Example</displayName>
				</emailProvider>
			</clientConfig>`,
		"imap only": `
			<clientConfig version="1.1">
				<emailProvider id="example.com">
					<incomingServer type="imap">
						<hostname>imap.example.com</hostname>
						<port>993</port>
						<socketType>SSL</socketType>
					</incomingServer>
				</emailProvider>
			</clientConfig>`,
		"missing port": `
			<clientConfig version="1.1">
				<emailProvider id="example.com">
					<incomingServer type="imap">
						<hostname>imap.example.com</hostname>
						<socketType>SSL</socketType>
					</incomingServer>
					<outgoingServer type="smtp">
						<hostname>smtp.example.com</hostname>
						<port>587</port>
						<socketType>SSL</socketType>
					</outgoingServer>
				</emailProvider>
			</clientConfig>`,
		"plaintext": `
			<clientConfig version="1.1">
				<emailProvider id="example.com">
					<incomingServer type="imap">
						<hostname>imap.example.com</hostname>
						<port>143</port>
						<socketType>plain</socketType>
					</incomingServer>
					<outgoingServer type="smtp">
						<hostname>smtp.example.com</hostname>
						<port>25</port>
						<socketType>plain</socketType>
					</outgoingServer>
				</emailProvider>
			</clientConfig>`,
	} {
		t.Run(name, func(t *testing.T) {
			data := parseAutoconfXML(t, doc)

			settings, err := parseAutoconf(data, testDefaults())
			require.Error(t, err)
			assert.Equal(t, testDefaults(), settings)
		})
	}
}

func useTestSRV(t *testing.T, records map[string][]*net.SRV) {
	t.Helper()
	original := lookupSRV
	t.Cleanup(func() { lookupSRV = original })
	lookupSRV = func(_ context.Context, service, proto, name string) (string, []*net.SRV, error) {
		key := "_" + service + "._" + proto + "." + name
		if found, ok := records[key]; ok {
			return key, found, nil
		}
		return "", nil, &net.DNSError{Err: "no such host", Name: key, IsNotFound: true}
	}
}

func TestDiscoverServersOnGuessedHostnames(t *testing.T) {
	ca := newTestCA(t)
	cert := ca.issue(t, "mail.example.com")
	useTestSRV(t, nil)
	useTestNetwork(t, ca, map[string]string{
		"mail.example.com:993": startTestServer(t, protocolIMAP, modeSSL, cert),
		"mail.example.com:587": startTestServer(t, protocolSMTP, modeStartTLS, cert),
	})

	settings, found := discoverServers(t.Context(), "example.com", nil, testDefaults())
	assert.True(t, found[protocolIMAP])
	assert.True(t, found[protocolSMTP])
	assert.Equal(t, server{host: "mail.example.com", port: 993, ssl: true}, serverFromSettings(settings.IMAPSettings))
	assert.Equal(t, server{host: "mail.example.com", port: 587, startTLS: true}, serverFromSettings(settings.SMTPSettings))
	// Only the servers change, not who's logging in
	assert.Equal(t, testDefaults().IMAPSettings.Username, settings.IMAPSettings.Username)
}

func TestDiscoverServersPrefersSRVRecords(t *testing.T) {
	ca := newTestCA(t)
	useTestSRV(t, map[string][]*net.SRV{
		"_imaps._tcp.example.com":       {{Target: "imap.provider.net.", Port: 993}},
		"_submission._tcp.example.com":  {{Target: "smtp.provider.net.", Port: 2525}},
		"_submissions._tcp.example.com": {{Target: ".", Port: 0}},
	})
	useTestNetwork(t, ca, map[string]string{
		"imap.provider.net:993":  startTestServer(t, protocolIMAP, modeSSL, ca.issue(t, "imap.provider.net")),
		"imap.example.com:993":   startTestServer(t, protocolIMAP, modeSSL, ca.issue(t, "imap.example.com")),
		"smtp.provider.net:2525": startTestServer(t, protocolSMTP, modeStartTLS, ca.issue(t, "smtp.provider.net")),
	})

	settings, found := discoverServers(t.Context(), "example.com", nil, testDefaults())
	assert.True(t, found[protocolIMAP])
	assert.True(t, found[protocolSMTP])
	assert.Equal(t, server{host: "imap.provider.net", port: 993, ssl: true}, serverFromSettings(settings.IMAPSettings))
	assert.Equal(t, server{host: "smtp.provider.net", port: 2525, startTLS: true}, serverFromSettings(settings.SMTPSettings))
}

func TestDiscoverServersUsesSRVRecordsReturnedWithAnError(t *testing.T) {
	ca := newTestCA(t)
	original := lookupSRV
	t.Cleanup(func() { lookupSRV = original })
	lookupSRV = func(_ context.Context, service, proto, name string) (string, []*net.SRV, error) {
		if service != "imaps" {
			return "", nil, &net.DNSError{Err: "no such host", Name: name, IsNotFound: true}
		}
		return "", []*net.SRV{{Target: "imap.provider.net.", Port: 993}},
			&net.DNSError{Err: "DNS response contained records which contain invalid names", Name: name}
	}
	useTestNetwork(t, ca, map[string]string{
		"imap.provider.net:993": startTestServer(t, protocolIMAP, modeSSL, ca.issue(t, "imap.provider.net")),
		"imap.example.com:993":  startTestServer(t, protocolIMAP, modeSSL, ca.issue(t, "imap.example.com")),
	})

	settings, found := discoverServers(t.Context(), "example.com", nil, testDefaults())
	assert.True(t, found[protocolIMAP])
	assert.Equal(t, server{host: "imap.provider.net", port: 993, ssl: true}, serverFromSettings(settings.IMAPSettings))
}

func TestDiscoverServersReportsWhatWasntFound(t *testing.T) {
	ca := newTestCA(t)
	useTestSRV(t, nil)
	useTestNetwork(t, ca, map[string]string{
		"imap.example.com:143": startTestServer(t, protocolIMAP, modeStartTLS, ca.issue(t, "imap.example.com")),
	})

	settings, found := discoverServers(t.Context(), "example.com", nil, testDefaults())
	assert.True(t, found[protocolIMAP])
	assert.False(t, found[protocolSMTP])
	assert.Equal(t, server{host: "imap.example.com", port: 143, startTLS: true}, serverFromSettings(settings.IMAPSettings))
	assert.Equal(t, testDefaults().SMTPSettings, settings.SMTPSettings)
}

func TestDiscoverServersPrefersGuessedHostnamesToMXHosts(t *testing.T) {
	ca := newTestCA(t)
	useTestSRV(t, nil)
	useTestNetwork(t, ca, map[string]string{
		"imap.example.com:143": startTestServer(t, protocolIMAP, modeStartTLS, ca.issue(t, "imap.example.com")),
		"mx.example.net:993":   startTestServer(t, protocolIMAP, modeSSL, ca.issue(t, "mx.example.net")),
	})

	settings, found := discoverServers(t.Context(), "example.com", []string{"mx.example.net"}, testDefaults())
	assert.True(t, found[protocolIMAP])
	assert.Equal(t, server{host: "imap.example.com", port: 143, startTLS: true}, serverFromSettings(settings.IMAPSettings))
}

func TestDiscoverServersFallsBackToMXHosts(t *testing.T) {
	ca := newTestCA(t)
	useTestSRV(t, nil)
	useTestNetwork(t, ca, map[string]string{
		"mx.example.net:993": startTestServer(t, protocolIMAP, modeSSL, ca.issue(t, "mx.example.net")),
	})

	settings, found := discoverServers(t.Context(), "example.com", []string{"mx.example.net"}, testDefaults())
	assert.True(t, found[protocolIMAP])
	assert.Equal(t, server{host: "mx.example.net", port: 993, ssl: true}, serverFromSettings(settings.IMAPSettings))
}

func TestDiscoverServersIgnoresCertificateSubdomainName(t *testing.T) {
	ca := newTestCA(t)
	addr := startTestServer(t, protocolIMAP, modeSSL, ca.issue(t, "box.example.com"))
	useTestSRV(t, nil)
	useTestNetwork(t, ca, map[string]string{
		"imap.example.com:993": addr,
		"box.example.com:993":  addr,
	})

	_, found := discoverServers(t.Context(), "example.com", nil, testDefaults())
	assert.False(t, found[protocolIMAP])
}

func TestDiscoverServersIgnoresLegacyTLSOnlySSLHost(t *testing.T) {
	ca := newTestCA(t)
	useTestSRV(t, nil)
	useTestNetwork(t, ca, map[string]string{
		"example.com:993": startTestServer(t, protocolIMAP, modeLegacySSL, ca.issue(t, "example.com")),
	})

	_, found := discoverServers(t.Context(), "example.com", nil, testDefaults())
	assert.False(t, found[protocolIMAP])
}

func TestDiscoverServersIgnoresCertificateNameOutsideEmailDomain(t *testing.T) {
	ca := newTestCA(t)
	addr := startTestServer(t, protocolIMAP, modeSSL, ca.issue(t, "server1.hostco.net"))
	useTestSRV(t, nil)
	useTestNetwork(t, ca, map[string]string{
		"imap.example.com:993":   addr,
		"server1.hostco.net:993": addr,
	})

	_, found := discoverServers(t.Context(), "example.com", nil, testDefaults())
	assert.False(t, found[protocolIMAP])
}

// useTestAutoconf answers every autoconfig request with a 404, returning the
// URLs requested
func useTestAutoconf(t *testing.T) *[]string {
	t.Helper()
	original := autoconfHTTPClient
	t.Cleanup(func() { autoconfHTTPClient = original })

	var lock sync.Mutex
	var requested []string
	autoconfHTTPClient = &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		lock.Lock()
		defer lock.Unlock()
		requested = append(requested, req.URL.String())
		return &http.Response{StatusCode: http.StatusNotFound, Body: http.NoBody, Request: req}, nil
	})}
	return &requested
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) { return f(req) }

func useTestMX(t *testing.T, records []*net.MX, err error) {
	t.Helper()
	original := lookupMX
	t.Cleanup(func() { lookupMX = original })
	lookupMX = func(context.Context, string) ([]*net.MX, error) { return records, err }
}

func TestAutoconfigFetchedOncePerDomain(t *testing.T) {
	requested := useTestAutoconf(t)
	useTestMX(t, []*net.MX{{Host: "mx1.example.com."}, {Host: "mx2.example.com."}, {Host: "mx.provider.net."}}, nil)
	useTestSRV(t, nil)
	useTestNetwork(t, newTestCA(t), map[string]string{})

	_, _, err := GetAutoconfigSettingsForDomain(t.Context(), "nick@example.com", "example.com")
	require.Error(t, err)

	hosts := map[string]int{}
	for _, requestedURL := range *requested {
		parsed, err := url.Parse(requestedURL)
		require.NoError(t, err)
		hosts[parsed.Host+parsed.Path]++
	}
	assert.Equal(t, map[string]int{
		"ispdb.kanmail.io/example.com/v1.1/config.xml":            1,
		"autoconfig.example.com/mail/config-v1.1.xml":             1,
		"example.com/.well-known/autoconfig/mail/config-v1.1.xml": 1,
		"ispdb.kanmail.io/provider.net/v1.1/config.xml":           1,
	}, hosts)
}

func TestAutoconfigDiscoversServersWithoutMXRecords(t *testing.T) {
	ca := newTestCA(t)
	cert := ca.issue(t, "imap.example.com", "smtp.example.com")
	useTestAutoconf(t)
	useTestMX(t, nil, &net.DNSError{Err: "no such host", Name: "example.com", IsNotFound: true})
	useTestSRV(t, nil)
	useTestNetwork(t, ca, map[string]string{
		"imap.example.com:993": startTestServer(t, protocolIMAP, modeSSL, cert),
		"smtp.example.com:465": startTestServer(t, protocolSMTP, modeSSL, cert),
	})

	settings, probed, err := GetAutoconfigSettingsForDomain(t.Context(), "nick@example.com", "example.com")
	require.NoError(t, err)
	assert.True(t, probed)
	assert.Equal(t, server{host: "imap.example.com", port: 993, ssl: true}, serverFromSettings(settings.IMAPSettings))
	assert.Equal(t, server{host: "smtp.example.com", port: 465, ssl: true}, serverFromSettings(settings.SMTPSettings))
}

func TestAutoconfigReportsFailedMXLookup(t *testing.T) {
	useTestAutoconf(t)
	mxErr := &net.DNSError{Err: "no such host", Name: "example.invalid", IsNotFound: true}
	useTestMX(t, nil, mxErr)
	useTestSRV(t, nil)
	useTestNetwork(t, newTestCA(t), map[string]string{})

	_, probed, err := GetAutoconfigSettingsForDomain(t.Context(), "nick@example.invalid", "example.invalid")
	assert.False(t, probed)
	assert.ErrorIs(t, err, mxErr)
}

func TestAutoconfigAsksMXDomainsAtOnce(t *testing.T) {
	original := autoconfHTTPClient
	t.Cleanup(func() { autoconfHTTPClient = original })
	secondAsked := make(chan struct{})
	var once sync.Once
	autoconfHTTPClient = &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		switch {
		case req.URL.Host == "ispdb.kanmail.io" && strings.HasPrefix(req.URL.Path, "/second.net/"):
			once.Do(func() { close(secondAsked) })
			return &http.Response{
				StatusCode: http.StatusOK,
				Body: io.NopCloser(strings.NewReader(`<clientConfig version="1.1">
					<emailProvider id="second.net">
						<incomingServer type="imap">
							<hostname>imap.second.net</hostname><port>993</port><socketType>SSL</socketType>
						</incomingServer>
						<outgoingServer type="smtp">
							<hostname>smtp.second.net</hostname><port>465</port><socketType>SSL</socketType>
						</outgoingServer>
					</emailProvider>
				</clientConfig>`)),
				Request: req,
			}, nil
		case strings.Contains(req.URL.String(), "first.net"):
			select {
			case <-secondAsked:
			case <-time.After(time.Second):
				t.Error("MX domains asked one after another")
			}
		}
		return &http.Response{StatusCode: http.StatusNotFound, Body: http.NoBody, Request: req}, nil
	})}
	useTestMX(t, []*net.MX{{Host: "mx.first.net."}, {Host: "mx.second.net."}}, nil)
	useTestSRV(t, nil)
	useTestNetwork(t, newTestCA(t), map[string]string{})

	settings, probed, err := GetAutoconfigSettingsForDomain(t.Context(), "nick@example.com", "example.com")
	require.NoError(t, err)
	assert.False(t, probed)
	assert.Equal(t, "imap.second.net", settings.IMAPSettings.Host)
}
