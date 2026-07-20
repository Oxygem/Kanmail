package util

import (
	"context"
	"crypto/tls"
	"errors"
	"io"
	"net"
	"slices"
	"sync"
	"syscall"
	"time"

	"github.com/rs/zerolog"
	"go.mau.fi/util/exhttp"

	"github.com/oxygem/kanmail/internal/backend"
)

const (
	networkErrorMaxSamples = 3
	networkErrorFlushEvery = time.Hour
)

type networkErrorKey struct {
	account string
	class   string
}

type networkErrorBucket struct {
	Account   string    `json:"account"`
	Class     string    `json:"class"`
	Count     int       `json:"count"`
	Recovered int       `json:"recovered"`
	Exhausted int       `json:"exhausted"`
	Samples   []string  `json:"samples"`
	FirstSeen time.Time `json:"firstSeen"`
	LastSeen  time.Time `json:"lastSeen"`
}

var (
	networkErrorsMu          sync.Mutex
	networkErrors            = map[networkErrorKey]*networkErrorBucket{}
	networkErrorTLSEscalated = map[string]bool{}
	networkErrorFlusherOnce  sync.Once
)

// IsRetryableNetworkError reports whether err looks like a transient network
// failure worth retrying (and aggregating) rather than surfacing directly.
func IsRetryableNetworkError(err error) bool {
	return exhttp.IsNetworkError(err) || errors.Is(err, io.EOF) || errors.Is(err, io.ErrUnexpectedEOF)
}

// classifyNetworkError sorts an error into a coarse class used only for
// bucketing - samples carry the full message, so an imprecise match degrades
// grouping, never data.
func classifyNetworkError(err error) string {
	var dnsErr *net.DNSError
	var certErr *tls.CertificateVerificationError
	var recordErr tls.RecordHeaderError
	var netErr net.Error
	switch {
	case errors.As(err, &dnsErr):
		return "dns"
	case errors.As(err, &certErr), errors.As(err, &recordErr):
		return "tls"
	case errors.Is(err, syscall.ECONNRESET):
		return "reset"
	case errors.Is(err, syscall.ECONNREFUSED):
		return "refused"
	case errors.Is(err, io.EOF), errors.Is(err, io.ErrUnexpectedEOF):
		return "eof"
	case errors.As(err, &netErr) && netErr.Timeout():
		return "timeout"
	default:
		return "other"
	}
}

// RecordNetworkError aggregates an episode of network errors (err being the
// most recent, occurrences how many the episode saw) for the periodic summary,
// rather than reporting each one - network errors are noisy and repetitive, so
// we keep counts plus a few distinct sample messages per (account, class).
// TLS failures are the exception: they indicate misconfiguration or
// interception, so the first per account is reported immediately.
func RecordNetworkError(ctx context.Context, account string, err error, occurrences int, recovered bool) {
	if err == nil || occurrences <= 0 {
		return
	}
	class := classifyNetworkError(err)
	msg := err.Error()
	now := time.Now()

	networkErrorsMu.Lock()
	key := networkErrorKey{account: account, class: class}
	bucket, ok := networkErrors[key]
	if !ok {
		bucket = &networkErrorBucket{Account: account, Class: class, FirstSeen: now}
		networkErrors[key] = bucket
	}
	bucket.Count += occurrences
	if recovered {
		bucket.Recovered++
	} else {
		bucket.Exhausted++
	}
	bucket.LastSeen = now
	if len(bucket.Samples) < networkErrorMaxSamples && !slices.Contains(bucket.Samples, msg) {
		bucket.Samples = append(bucket.Samples, msg)
	}
	escalateTLS := class == "tls" && !networkErrorTLSEscalated[account]
	if escalateTLS {
		networkErrorTLSEscalated[account] = true
	}
	networkErrorsMu.Unlock()

	networkErrorFlusherOnce.Do(func() {
		go func() {
			for range time.Tick(networkErrorFlushEvery) {
				FlushNetworkErrors(context.Background())
			}
		}()
	})

	if escalateTLS {
		go sendNetworkErrorEvent(ctx, "backend:NetworkErrorTLS", map[string]any{
			"account": account,
			"error":   msg,
		})
	}
}

// FlushNetworkErrors sends any aggregated network errors as a single summary
// event. Called hourly and at shutdown.
func FlushNetworkErrors(ctx context.Context) {
	networkErrorsMu.Lock()
	buckets := networkErrors
	networkErrors = map[networkErrorKey]*networkErrorBucket{}
	networkErrorsMu.Unlock()

	if len(buckets) == 0 {
		return
	}

	summary := make([]*networkErrorBucket, 0, len(buckets))
	for _, bucket := range buckets {
		summary = append(summary, bucket)
	}
	sendNetworkErrorEvent(ctx, "backend:NetworkErrorSummary", map[string]any{
		"buckets": summary,
	})
}

func sendNetworkErrorEvent(ctx context.Context, event string, properties map[string]any) {
	if !analyticsEnabled || deviceID == "" {
		return
	}
	sendCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := backend.SendAnalytics(sendCtx, deviceID, event, properties); err != nil {
		zerolog.Ctx(ctx).Warn().Err(err).Str("event", event).Msg("Failed to send network error event")
	}
}
