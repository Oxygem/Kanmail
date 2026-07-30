package util

import (
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"syscall"
	"testing"

	"github.com/emersion/go-imap/v2"
)

// wsaConnReset is the error Windows produces when the peer drops the
// connection, as it reaches us through go-imap: WSAECONNRESET, which Go keeps
// distinct from its own syscall.ECONNRESET.
func wsaConnReset() error {
	return fmt.Errorf("failed to fetch email flags: %w",
		fmt.Errorf("in response-data: %w", &net.OpError{
			Op:  "read",
			Net: "tcp",
			Err: &os.SyscallError{Syscall: "wsarecv", Err: syscall.Errno(10054)},
		}))
}

func TestIsRetryableNetworkError(t *testing.T) {
	for _, tc := range []struct {
		name string
		err  error
		want bool
	}{
		{"windows connection reset", wsaConnReset(), true},
		{"connection reset", &net.OpError{Op: "read", Err: syscall.ECONNRESET}, true},
		{"unexpected eof", fmt.Errorf("in response: %w", io.ErrUnexpectedEOF), true},
		{"eof", io.EOF, true},
		{"nil", nil, false},
		{"other", errors.New("nope"), false},
		{"imap no", &imap.Error{Type: imap.StatusResponseTypeNo}, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := IsRetryableNetworkError(tc.err); got != tc.want {
				t.Fatalf("IsRetryableNetworkError(%v) = %v, want %v", tc.err, got, tc.want)
			}
		})
	}
}

func TestClassifyNetworkError(t *testing.T) {
	for _, tc := range []struct {
		name string
		err  error
		want string
	}{
		{"windows connection reset", wsaConnReset(), "reset"},
		{"connection reset", &net.OpError{Op: "read", Err: syscall.ECONNRESET}, "reset"},
		{"windows connection refused", &net.OpError{Op: "dial", Err: syscall.Errno(10061)}, "refused"},
		{"windows timeout", &net.OpError{Op: "dial", Err: syscall.Errno(10060)}, "timeout"},
		{"eof", io.EOF, "eof"},
		{"dns", &net.DNSError{Err: "no such host"}, "dns"},
		{"imap", &imap.Error{Type: imap.StatusResponseTypeNo}, "imap"},
		{"other", errors.New("nope"), "other"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := classifyNetworkError(tc.err); got != tc.want {
				t.Fatalf("classifyNetworkError(%v) = %q, want %q", tc.err, got, tc.want)
			}
		})
	}
}
