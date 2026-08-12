//go:build production

package internal

import "github.com/rs/zerolog"

// The debugger drives accounts directly and can print the embedded secret
// constants, so the real implementation (debugger.go) is development only.
func RunDebugger(log zerolog.Logger) {
	log.Error().Msg("The debugger is not available in production builds")
}
