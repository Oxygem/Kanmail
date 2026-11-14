package emails

import (
	"context"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/rs/zerolog"
	"golang.org/x/net/publicsuffix"

	"github.com/oxygem/kanmail/internal/constants"
	"github.com/oxygem/kanmail/internal/types"
	"github.com/oxygem/kanmail/internal/util"
)

const (
	autoconfURL  = "https://autoconfig.%s/mail/config-v1.1.xml?emailaddress=%s"
	wellKnownURL = "https://%s/.well-known/autoconfig/mail/config-v1.1.xml?emailaddress=%s"
	ispdbURL     = "https://ispdb.kanmail.io/%s/v1.1/config.xml"
)

var (
	lookupMX  = net.DefaultResolver.LookupMX
	lookupSRV = net.DefaultResolver.LookupSRV
)

var autoconfHTTPClient = &http.Client{
	Timeout: 10 * time.Second,
}

// Long enough for ISPDB to answer before asking the domain itself
var autoconfStagger = 2 * time.Second

// GetAutoconfigSettingsForDomain also says whether the servers were found by
// trying them, so already known to work.
func GetAutoconfigSettingsForDomain(
	ctx context.Context,
	username, domain string,
) (types.AccountSettings, bool, error) {
	settings, discovered, err := autoconfigureDomain(ctx, username, domain)
	// After autoconfig so the servers it found can identify the provider too
	applyProviderDefaults(&settings, domain)
	return settings, discovered, err
}

func autoconfigureDomain(ctx context.Context, username, domain string) (types.AccountSettings, bool, error) {
	// Make some sensible defaults, the client will fallback to these if we fail to autoconf
	defaultSettings := types.AccountSettings{
		Name: types.AccountName(username),
		IMAPSettings: types.ConnectionSettings{
			Username: username,
			Host:     domain,
			Port:     993,
			SSL:      true,
		},
		SMTPSettings: types.ConnectionSettings{
			Username: username,
			Host:     domain,
			Port:     465,
			SSL:      true,
		},
	}

	// First try the domain directly
	emailDomain := autoconfigDomain(domain)
	if settings, err := getAutconfigForDomain(ctx, username, emailDomain, defaultSettings); err == nil {
		return *settings, false, nil
	}

	// If nothing, lookup MX records and use those
	mx, mxErr := lookupMX(ctx, domain)
	if mxErr != nil {
		zerolog.Ctx(ctx).Warn().Err(mxErr).Msgf("Failed to lookup MX records: %s", domain)
	}
	var mxHosts, mxDomains []string
	for _, d := range mx {
		// A host of "." says the domain accepts no mail at all
		host := strings.TrimSuffix(d.Host, ".")
		if host == "" {
			continue
		}
		mxHosts = append(mxHosts, host)
		// Several MX hosts tend to share a domain, often the email's own
		if mxDomain := autoconfigDomain(host); mxDomain != emailDomain && !slices.Contains(mxDomains, mxDomain) {
			mxDomains = append(mxDomains, mxDomain)
		}
	}
	// Only ISPDB, the MX domain's own autoconfig would be sent the email address
	// and is anyone's when the MX record is faked
	mxSettings, ok, _ := util.FirstSuccess(ctx, len(mxDomains), 0,
		func(ctx context.Context, i int) (*types.AccountSettings, error) {
			return getAutoconfFromURL(ctx, fmt.Sprintf(ispdbURL, mxDomains[i]), defaultSettings)
		},
	)
	if ok {
		return *mxSettings, false, nil
	}

	settings, found := discoverServers(ctx, domain, mxHosts, defaultSettings)
	switch {
	case found[protocolIMAP] && found[protocolSMTP]:
		return settings, true, nil
	case found[protocolIMAP]:
		return settings, false, fmt.Errorf("failed to find the SMTP server for domain: %s", domain)
	case found[protocolSMTP]:
		return settings, false, fmt.Errorf("failed to find the IMAP server for domain: %s", domain)
	}

	err := fmt.Errorf("failed to autoconfigure username/domain: %s/%s", username, domain)
	if mxErr != nil {
		err = fmt.Errorf("%w (MX lookup: %w)", err, mxErr)
	}
	return defaultSettings, false, err
}

func autoconfigDomain(host string) string {
	if domain, err := publicsuffix.EffectiveTLDPlusOne(host); err == nil {
		return domain
	}
	return host
}

func getAutconfigForDomain(
	ctx context.Context,
	username, domain string,
	defaults types.AccountSettings,
) (*types.AccountSettings, error) {
	email := url.QueryEscape(username)
	sourceURLs := []string{
		fmt.Sprintf(ispdbURL, domain),
		fmt.Sprintf(autoconfURL, domain, email),
		fmt.Sprintf(wellKnownURL, domain, email),
	}
	settings, ok, errs := util.FirstSuccess(
		ctx, len(sourceURLs), autoconfStagger,
		func(ctx context.Context, i int) (*types.AccountSettings, error) {
			settings, err := getAutoconfFromURL(ctx, sourceURLs[i], defaults)
			if err == nil {
				zerolog.Ctx(ctx).Debug().Msgf("Got autoconf from: %s", sourceURLs[i])
			} else if ctx.Err() == nil {
				zerolog.Ctx(ctx).Warn().Err(err).Msgf("Failed to get autoconf from: %s", sourceURLs[i])
			}
			return settings, err
		},
	)
	if !ok {
		return nil, errors.Join(errs...)
	}
	return settings, nil
}

// RFC 6186 (and RFC 8314 for implicit TLS submission) SRV services, in order
// of preference, with whether each uses implicit TLS rather than STARTTLS
var srvServices = map[serverProtocol][]struct {
	service string
	ssl     bool
}{
	protocolIMAP: {{"imaps", true}, {"imap", false}},
	protocolSMTP: {{"submissions", true}, {"submission", false}},
}

var guessedHostPrefixes = map[serverProtocol][]string{
	protocolIMAP: {"imap.", "mail.", ""},
	protocolSMTP: {"smtp.", "mail.", ""},
}

// discoverServers finds the servers for a domain that publishes no autoconfig
// by trying them: where its SRV records point, then the usual hostnames and its
// MX hosts on the standard ports. Settings are only filled in for the servers
// found.
func discoverServers(
	ctx context.Context,
	domain string,
	mxHosts []string,
	settings types.AccountSettings,
) (types.AccountSettings, map[serverProtocol]bool) {
	found := map[serverProtocol]bool{}
	if constants.ENV_DEBUG_FAKE_IMAP != "" || constants.ENV_DEBUG_OFFLINE != "" {
		return settings, found
	}

	var lock sync.Mutex
	var discovering sync.WaitGroup
	for proto, conf := range map[serverProtocol]*types.ConnectionSettings{
		protocolIMAP: &settings.IMAPSettings,
		protocolSMTP: &settings.SMTPSettings,
	} {
		discovering.Go(func() {
			candidates := candidateServers(ctx, proto, domain, mxHosts)
			s, ok := locateServer(ctx, proto, candidates, domain, false, 0)
			if !ok {
				return
			}
			zerolog.Ctx(ctx).Info().Stringer("server", s).Msgf("Discovered %s server", proto)
			lock.Lock()
			defer lock.Unlock()
			s.apply(conf)
			found[proto] = true
		})
	}
	discovering.Wait()
	return settings, found
}

func candidateServers(ctx context.Context, proto serverProtocol, domain string, mxHosts []string) []server {
	var servers []server
	for _, srv := range srvServices[proto] {
		// Records with invalid targets are left out and reported in the error,
		// alongside the rest
		_, records, _ := lookupSRV(ctx, srv.service, "tcp", domain)
		for _, record := range records {
			// A target of "." says the service isn't offered at all
			if host := strings.TrimSuffix(record.Target, "."); host != "" {
				servers = appendNew(servers, server{host: host, port: int(record.Port), ssl: srv.ssl, startTLS: !srv.ssl})
			}
		}
	}

	for _, prefix := range guessedHostPrefixes[proto] {
		servers = appendNew(servers, standardServersOn(proto, prefix+domain)...)
	}
	// Smaller providers serve mail from the host receiving it, but that can be
	// another company's (a mail filter's) and is often firewalled
	for _, host := range mxHosts {
		servers = appendNew(servers, standardServersOn(proto, host)...)
	}
	return servers
}

func getAutoconfFromURL(
	ctx context.Context,
	url string,
	defaults types.AccountSettings,
) (*types.AccountSettings, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}

	resp, err := autoconfHTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("invalid status code returned: %d", resp.StatusCode)
	}

	b, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var data autoconfData
	if err := xml.Unmarshal(b, &data); err != nil {
		return nil, err
	}

	settings, err := parseAutoconf(data, defaults)
	if err != nil {
		return nil, err
	}
	return &settings, nil
}

type autoConfServer struct {
	Type           string   `xml:"type,attr"`
	Hostname       string   `xml:"hostname"`
	Port           int      `xml:"port"`
	SocketType     string   `xml:"socketType"`
	Username       string   `xml:"username"`
	Authentication []string `xml:"authentication"`
}

type autoconfData struct {
	EmailProvider struct {
		ID string `xml:"id,attr"`

		DisplayName      string `xml:"displayName"`
		DisplayShortName string `xml:"displayShortName"`

		Domains []struct {
			Value string `xml:",chardata"`
		} `xml:"domain"`

		IncomingServer []autoConfServer `xml:"incomingServer"`
		OutgoingServer []autoConfServer `xml:"outgoingServer"`
	} `xml:"emailProvider"`
}

func parseAutoconf(data autoconfData, settings types.AccountSettings) (types.AccountSettings, error) {
	imap, err := findAutoconfServer(data.EmailProvider.IncomingServer, "imap")
	if err != nil {
		return settings, err
	}

	smtp, err := findAutoconfServer(data.EmailProvider.OutgoingServer, "smtp")
	if err != nil {
		return settings, err
	}

	applyAutoconfServer(&settings.IMAPSettings, imap)
	applyAutoconfServer(&settings.SMTPSettings, smtp)

	return settings, nil
}

func findAutoconfServer(servers []autoConfServer, serverType string) (autoConfServer, error) {
	err := fmt.Errorf("no %s server in autoconfig", serverType)

	for _, server := range servers {
		if server.Type != serverType {
			continue
		}

		switch {
		case server.Hostname == "":
			err = fmt.Errorf("%s server has no hostname", serverType)
		case server.Port <= 0 || server.Port > 65535:
			err = fmt.Errorf("%s server has invalid port: %d", serverType, server.Port)
		case server.SocketType != "SSL" && server.SocketType != "STARTTLS":
			err = fmt.Errorf("%s server is unencrypted: %q", serverType, server.SocketType)
		default:
			return server, nil
		}
	}

	return autoConfServer{}, err
}

func applyAutoconfServer(conn *types.ConnectionSettings, server autoConfServer) {
	conn.Host = server.Hostname
	conn.Port = server.Port
	conn.SSL = server.SocketType == "SSL"
	conn.StartTLS = server.SocketType == "STARTTLS"
}
