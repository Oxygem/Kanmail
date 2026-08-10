package util

import (
	"path/filepath"
	"strings"
	"unicode"
)

// isWindowsReservedName reports whether the stem (before the first dot) is a
// DOS device name - on Windows these resolve to devices even inside
// subdirectories, so they must never be used as filenames.
func isWindowsReservedName(name string) bool {
	stem := name
	if i := strings.IndexByte(stem, '.'); i >= 0 {
		stem = stem[:i]
	}
	stem = strings.ToUpper(strings.TrimRight(stem, " "))

	switch stem {
	case "CON", "PRN", "AUX", "NUL":
		return true
	}
	if len(stem) == 4 && (strings.HasPrefix(stem, "COM") || strings.HasPrefix(stem, "LPT")) {
		return stem[3] >= '1' && stem[3] <= '9'
	}
	return false
}

// SanitizeFilename reduces an attacker-controllable string (eg a MIME part
// filename from an email) to a safe basename for save dialogs and disk writes:
// no path components, no control or bidi-override characters (which would let
// "report‮gpj.exe" display as "report exe.jpg"), no Windows device names,
// never empty or dot-relative.
func SanitizeFilename(name string) string {
	// Handle both separator conventions regardless of host OS
	if i := strings.LastIndexAny(name, `/\`); i >= 0 {
		name = name[i+1:]
	}
	name = filepath.Base(name)

	var out strings.Builder
	for _, r := range name {
		if r < 0x20 || r == 0x7f || strings.ContainsRune(`<>:"|?*`, r) {
			continue
		}
		// Format characters (Cf) include every bidi override/embedding mark
		if unicode.Is(unicode.Cf, r) {
			continue
		}
		out.WriteRune(r)
	}

	cleaned := strings.TrimSpace(out.String())
	cleaned = strings.TrimLeft(cleaned, ".")
	// Windows silently drops trailing dots/spaces, changing the effective name
	cleaned = strings.TrimRight(cleaned, ". ")
	if cleaned == "" {
		return "attachment"
	}
	if isWindowsReservedName(cleaned) {
		return "_" + cleaned
	}
	return cleaned
}
