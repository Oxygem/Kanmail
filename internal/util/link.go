package util

import (
	"fmt"
	"net/url"
	"os/exec"
	"runtime"
	"slices"
	"strings"
)

var allowedURLSchemes = []string{"http", "https", "mailto", "tel", "sms"}

func OpenInBrowser(rawURL string) error {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return fmt.Errorf("invalid URL: %w", err)
	}
	if !slices.Contains(allowedURLSchemes, strings.ToLower(parsed.Scheme)) {
		return fmt.Errorf("refusing to open URL with scheme: %q", parsed.Scheme)
	}
	return openWithOS(rawURL)
}

// Bypasses the allowed schemes above, only safe on known safe files
func OpenFile(filename string) error {
	return openWithOS(filename)
}

func openWithOS(target string) error {
	var cmd string
	var args []string

	os := runtime.GOOS
	if isWSL() {
		os = "windows"
	}

	switch os {
	case "windows":
		cmd = "rundll32.exe"
		args = []string{"url.dll,FileProtocolHandler"}
	case "darwin":
		cmd = "open"
	default: // "linux", "freebsd", "openbsd", "netbsd"
		cmd = "xdg-open"
	}
	args = append(args, target)
	return exec.Command(cmd, args...).Start()
}

func isWSL() bool {
	data, err := exec.Command("uname", "-r").Output()
	if err != nil {
		return false
	}
	return strings.Contains(strings.ToLower(string(data)), "microsoft")
}
