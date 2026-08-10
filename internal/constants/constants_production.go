//go:build production

package constants

// Production builds ignore the KANMAIL_DEBUG_* environment entirely - the
// debug switches (fake IMAP/licensing, offline mode, IMAP IO dumps, ...) must
// not be reachable in a shipped binary.
var (
	ENV_DEBUG_PRETTY_LOGS    = ""
	ENV_DEBUG_TRACE_LOGS     = ""
	ENV_DEBUG_NO_AUTOCLOSE   = ""
	ENV_DEBUG_CACHES_DISABLE = ""
	ENV_DEBUG_OFFLINE        = ""
	ENV_DEBUG_FAKE_IMAP      = ""
	ENV_DEBUG_FAKE_FOLDERS   = ""
	ENV_DEBUG_START_APP      = ""
	ENV_DEBUG_FAKE_JITTER    = ""
	ENV_DEBUG_FAKE_KEYRING   = ""
	ENV_DEBUG_FAKE_LICENSED  = ""
	ENV_DEBUG_IMAP_IO        = ""
	ENV_DEBUG_WINDOW_WIDTH   int
	ENV_DEBUG_WINDOW_HEIGHT  int
)
