package emails

import (
	"context"
	"encoding/xml"
	"fmt"
	"io"
	"net"
	"net/http"

	"github.com/joeguo/tldextract"
	"github.com/rs/zerolog"

	"github.com/oxygem/kanmail/internal/types"
)

const (
	autoconfURL = "https://autoconfig.%s/mail/config-v1.1.xml?emailaddress=%s"
	ispdbURL    = "https://ispdb.kanmail.io/%s/v1.1/config.xml"
)

var tldCache *tldextract.TLDExtract

func InitTLDCache(path string) {
	c, err := tldextract.New(path, false)
	if err != nil {
		panic(err)
	}
	tldCache = c
}

func GetAutoconfigSettingsForDomain(ctx context.Context, username, domain string) (types.AccountSettings, error) {
	// First try the domain directly
	if settings := getAutconfigForDomain(ctx, username, domain); settings != nil {
		return *settings, nil
	}

	// If nothing, lookup MX records and use those
	// TODO: order records by preference
	mx, err := net.DefaultResolver.LookupMX(ctx, domain)
	if err != nil {
		return types.AccountSettings{}, err
	} else {
		for _, d := range mx {
			host := d.Host[:len(d.Host)-1]
			if settings := getAutconfigForDomain(ctx, username, host); settings != nil {
				return *settings, nil
			}
		}
	}

	return types.AccountSettings{}, fmt.Errorf(
		"failed to autoconfigure username/domain: %s/%s",
		username, domain,
	)
}

func getAutconfigForDomain(ctx context.Context, username, domain string) *types.AccountSettings {
	domainBits := tldCache.Extract(domain)
	domain = domainBits.Root + "." + domainBits.Tld

	ispdbURL := fmt.Sprintf(ispdbURL, domain)
	if settings, err := getAutoconfFromURL(ctx, ispdbURL); settings != nil {
		zerolog.Ctx(ctx).Debug().Msgf("Got autoconf from ISPB: %s", ispdbURL)
		return settings
	} else {
		zerolog.Ctx(ctx).Warn().Err(err).Msgf("Failed to get autoconf from ISPB: %s", ispdbURL)
	}

	providerURL := fmt.Sprintf(autoconfURL, domain, username)
	if settings, err := getAutoconfFromURL(ctx, providerURL); settings != nil {
		zerolog.Ctx(ctx).Debug().Msgf("Got autoconf from provider: %s", ispdbURL)
		return settings
	} else {
		zerolog.Ctx(ctx).Warn().Err(err).Msgf("Failed to get autoconf from provider: %s", providerURL)
	}

	return nil
}

func getAutoconfFromURL(ctx context.Context, url string) (*types.AccountSettings, error) {
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

	settings := parseAutoconf(data)
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

func parseAutoconf(data autoconfData) types.AccountSettings {
	var settings types.AccountSettings

	for _, server := range data.EmailProvider.IncomingServer {
		if server.Type != "imap" {
			continue
		}

		settings.IMAPSettings.Host = server.Hostname
		settings.IMAPSettings.Port = server.Port
		settings.IMAPSettings.SSL = server.SocketType == "SSL"
	}

	for _, server := range data.EmailProvider.OutgoingServer {
		if server.Type != "smtp" {
			continue
		}

		settings.SMTPSettings.Host = server.Hostname
		settings.SMTPSettings.Port = server.Port
		settings.SMTPSettings.SSL = server.SocketType == "SSL"
		settings.SMTPSettings.TLS = server.SocketType == "STARTTLS"
	}

	return settings
}
