package services

import (
	"crypto/sha256"
	"encoding/base32"
	"encoding/hex"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/rs/zerolog"
	"go.mau.fi/util/random"
)

const deviceIDLength = 16

// Shared client for requests to external (avatar, unsubscribe, ...) endpoints which may
// never respond - http.DefaultClient has no timeout
var externalHTTPClient = &http.Client{
	Timeout: 30 * time.Second,
}

func validatePublicHTTPSURL(rawURL string) error {
	u, err := url.Parse(rawURL)
	if err != nil {
		return fmt.Errorf("invalid URL: %w", err)
	}
	if u.Scheme != "https" {
		return fmt.Errorf("URL is not https: %s", u.Scheme)
	}

	ips, err := net.LookupIP(u.Hostname())
	if err != nil {
		return fmt.Errorf("failed to resolve host: %w", err)
	}
	for _, ip := range ips {
		if ip.IsLoopback() || ip.IsPrivate() || ip.IsUnspecified() ||
			ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() {
			return fmt.Errorf("host %s resolves to non-public address: %s", u.Hostname(), ip)
		}
	}
	return nil
}

// publicHTTPSClient is externalHTTPClient plus per-hop redirect validation, for
// requests whose target URL comes from untrusted mail content.
var publicHTTPSClient = &http.Client{
	Timeout: 30 * time.Second,
	CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) >= 10 {
			return errors.New("stopped after 10 redirects")
		}
		return validatePublicHTTPSURL(req.URL.String())
	},
}

func generateDeviceID() string {
	return base32.HexEncoding.WithPadding(base32.NoPadding).EncodeToString(random.Bytes(deviceIDLength / 1.6))
}

func hashLicenseKey(key string) string {
	hasher := sha256.New()
	hasher.Write([]byte(key))
	return hex.EncodeToString(hasher.Sum(nil))
}

// Base32 hex strings: old versions were 8 long, more recent versions 16
func isValidDeviceID(id string) bool {
	if len(id) < 8 || len(id) > 64 {
		return false
	}
	for _, r := range id {
		if r != '-' && ('0' > r || r > '9') && ('a' > r || r > 'z') && ('A' > r || r > 'Z') {
			return false
		}
	}
	return true
}

func ensureDeviceIDFile(log zerolog.Logger, filename string) string {
	b, _ := os.ReadFile(filename)
	if id := strings.TrimSpace(string(b)); isValidDeviceID(id) {
		log.Info().Str("device_id", id).Msg("Read device ID from file")
		return id
	} else if len(b) > 0 {
		log.Warn().Str("content", string(b)).Msg("Ignoring corrupt device ID file, regenerating")
	}

	d := generateDeviceID()
	if err := os.WriteFile(filename, []byte(d), 0o644); err != nil {
		log.Err(err).Msg("Failed to write deviceID file")
	}

	log.Info().Str("device_id", d).Msg("Wrote device ID to file")
	return d
}
