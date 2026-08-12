//go:build !production

package constants

import (
	"fmt"
	"os"
	"strconv"
)

var (
	ENV_BACKEND_API_URL = "https://backend.kanmail.io"

	ENV_DEBUG_PRETTY_LOGS       = os.Getenv("KANMAIL_DEBUG_PRETTY_LOGS")
	ENV_DEBUG_TRACE_LOGS        = os.Getenv("KANMAIL_DEBUG_TRACE_LOGS")
	ENV_DEBUG_NO_AUTOCLOSE      = os.Getenv("KANMAIL_DEBUG_NO_AUTOCLOSE")
	ENV_DEBUG_CACHES_DISABLE    = os.Getenv("KANMAIL_DEBUG_CACHES_DISABLE")
	ENV_DEBUG_UID_CACHE_DISABLE = os.Getenv("KANMAIL_DEBUG_UID_CACHE_DISABLE")
	ENV_DEBUG_OFFLINE           = os.Getenv("KANMAIL_DEBUG_OFFLINE")
	ENV_DEBUG_FAKE_IMAP         = os.Getenv("KANMAIL_DEBUG_FAKE_IMAP")
	ENV_DEBUG_FAKE_FOLDERS      = os.Getenv("KANMAIL_DEBUG_FAKE_FOLDERS")
	ENV_DEBUG_START_APP         = os.Getenv("KANMAIL_DEBUG_START_APP")
	ENV_DEBUG_FAKE_JITTER       = os.Getenv("KANMAIL_DEBUG_FAKE_JITTER")
	ENV_DEBUG_FAKE_KEYRING      = os.Getenv("KANMAIL_DEBUG_FAKE_KEYRING")
	ENV_DEBUG_FAKE_LICENSED     = os.Getenv("KANMAIL_DEBUG_FAKE_LICENSED")
	ENV_DEBUG_IMAP_IO           = os.Getenv("KANMAIL_DEBUG_IMAP_IO")
	ENV_DEBUG_WINDOW_WIDTH      int
	ENV_DEBUG_WINDOW_HEIGHT     int
)

func init() {
	if u := os.Getenv("KANMAIL_BACKEND_API_URL"); u != "" {
		ENV_BACKEND_API_URL = u
	}
	if w := os.Getenv("KANMAIL_DEBUG_WINDOW_WIDTH"); w != "" {
		if wi, err := strconv.Atoi(w); err != nil {
			panic(fmt.Errorf("invalid KANMAIL_DEBUG_WINDOW_WIDTH env: %w", err))
		} else {
			ENV_DEBUG_WINDOW_WIDTH = wi
		}
	}
	if w := os.Getenv("KANMAIL_DEBUG_WINDOW_HEIGHT"); w != "" {
		if wi, err := strconv.Atoi(w); err != nil {
			panic(fmt.Errorf("invalid KANMAIL_DEBUG_WINDOW_HEIGHT env: %w", err))
		} else {
			ENV_DEBUG_WINDOW_HEIGHT = wi
		}
	}
}
