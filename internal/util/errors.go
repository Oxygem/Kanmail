package util

import (
	"context"
	"crypto/tls"
	"errors"
	"io"
	"net"
	"slices"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/emersion/go-imap/v2"
	"github.com/rs/zerolog"
	"go.mau.fi/util/exhttp"

	"github.com/oxygem/kanmail/internal/backend"
)

// transientIMAPCodes are NO response codes that mean "not right now" rather than
// "never": the server is unavailable, hit an internal bug, or the mailbox is
// momentarily locked by another session.
var transientIMAPCodes = []imap.ResponseCode{
	imap.ResponseCodeUnavailable,
	imap.ResponseCodeServerBug,
	imap.ResponseCodeInUse,
}

// transientIMAPTexts cover servers that report a transient failure with no
// response code at all - Gmail's "NO System Error (Failure)" being the common
// one. Only consulted when there's no code to go on, so a permanent code like
// AUTHENTICATIONFAILED is never overridden by its wording.
var transientIMAPTexts = []string{
	"system error",
	"temporary failure",
	"temporarily unavailable",
	"server busy",
	"try again later",
}

// IsRetryableIMAPError reports whether err is a NO response the server is likely
// to answer differently on a second attempt. A NO means the command was rejected
// outright, so unlike a network error there's no risk it half-applied. BAD is
// excluded: that's a protocol error, ie our bug, and will fail identically.
func IsRetryableIMAPError(err error) bool {
	var imapErr *imap.Error
	if !errors.As(err, &imapErr) || imapErr.Type != imap.StatusResponseTypeNo {
		return false
	}
	if imapErr.Code != "" {
		return slices.Contains(transientIMAPCodes, imapErr.Code)
	}
	text := strings.ToLower(imapErr.Text)
	return slices.ContainsFunc(transientIMAPTexts, func(fragment string) bool {
		return strings.Contains(text, fragment)
	})
}

// Network error sampling
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
	Episodes  int       `json:"episodes"`
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

// IsRetryableError reports whether err is transient for any reason - the network
// blipped, or the server itself said it couldn't do this right now.
func IsRetryableError(err error) bool {
	return IsRetryableNetworkError(err) || IsRetryableIMAPError(err)
}

// classifyNetworkError sorts an error into a coarse class used only for
// bucketing - samples carry the full message, so an imprecise match degrades
// grouping, never data.
func classifyNetworkError(err error) string {
	var imapErr *imap.Error
	var dnsErr *net.DNSError
	var certErr *tls.CertificateVerificationError
	var recordErr tls.RecordHeaderError
	var netErr net.Error
	switch {
	case errors.As(err, &imapErr):
		return "imap"
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

// RecordNetworkError aggregates a failed episode of network errors (err being
// the most recent, occurrences how many the episode saw) for the periodic
// summary, rather than reporting each one - network errors are noisy and
// repetitive, so we keep counts plus a few distinct sample messages per
// (account, class). Episodes the retries recovered from aren't recorded at all:
// the work succeeded, so there's nothing to act on. TLS failures are the
// exception: they indicate misconfiguration or interception, so the first per
// account is reported immediately.
func RecordNetworkError(ctx context.Context, account string, err error, occurrences int) {
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
	bucket.Episodes++
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
