package emails

import (
	"context"
	"encoding/xml"
	"fmt"
	"io"
	"net"
	"net/http"

	"github.com/rs/zerolog"
	"golang.org/x/net/publicsuffix"

	"github.com/oxygem/kanmail/internal/types"
)

const (
	autoconfURL = "https://autoconfig.%s/mail/config-v1.1.xml?emailaddress=%s"
	ispdbURL    = "https://ispdb.kanmail.io/%s/v1.1/config.xml"
)

func GetAutoconfigSettingsForDomain(ctx context.Context, username, domain string) (types.AccountSettings, error) {
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

	// Apply any domain specific defaults
	if fn, ok := domainDefaultSettingHandlers[domain]; ok {
		fn(&defaultSettings)
	}

	// First try the domain directly
	if settings := getAutconfigForDomain(ctx, username, domain, defaultSettings); settings != nil {
		return *settings, nil
	}

	// If nothing, lookup MX records and use those
	// TODO: order records by preference
	mx, err := net.DefaultResolver.LookupMX(ctx, domain)
	if err != nil {
		return defaultSettings, fmt.Errorf("failed to lookup MX record: %w", err)
	} else {
		for _, d := range mx {
			host := d.Host[:len(d.Host)-1]
			if settings := getAutconfigForDomain(ctx, username, host, defaultSettings); settings != nil {
				return *settings, nil
			}
		}
	}

	return defaultSettings, fmt.Errorf(
		"failed to autoconfigure username/domain: %s/%s",
		username, domain,
	)
}

func getAutconfigForDomain(
	ctx context.Context,
	username, domain string,
	defaults types.AccountSettings,
) *types.AccountSettings {
	if rootDomain, err := publicsuffix.EffectiveTLDPlusOne(domain); err == nil {
		domain = rootDomain
	}

	ispdbURL := fmt.Sprintf(ispdbURL, domain)
	if settings, err := getAutoconfFromURL(ctx, ispdbURL, defaults); settings != nil {
		zerolog.Ctx(ctx).Debug().Msgf("Got autoconf from ISPB: %s", ispdbURL)
		return settings
	} else {
		zerolog.Ctx(ctx).Warn().Err(err).Msgf("Failed to get autoconf from ISPB: %s", ispdbURL)
	}

	providerURL := fmt.Sprintf(autoconfURL, domain, username)
	if settings, err := getAutoconfFromURL(ctx, providerURL, defaults); settings != nil {
		zerolog.Ctx(ctx).Debug().Msgf("Got autoconf from provider: %s", ispdbURL)
		return settings
	} else {
		zerolog.Ctx(ctx).Warn().Err(err).Msgf("Failed to get autoconf from provider: %s", providerURL)
	}

	return nil
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

	// TODO: don't use DefaultClient (why not?)
	resp, err := http.DefaultClient.Do(req)
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
