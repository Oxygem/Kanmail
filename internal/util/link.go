package util

import (
	"os/exec"
	"runtime"
	"strings"
)

func OpenInBrowser(url string) error {
	var cmd string
	var args []string

	os := runtime.GOOS
	if isWSL() {
		os = "windows"
	}

	switch os {
	case "windows":
		cmd = "cmd"
		args = []string{"/c", "start"}
	case "darwin":
		cmd = "open"
	default: // "linux", "freebsd", "openbsd", "netbsd"
		cmd = "xdg-open"
	}
	args = append(args, url)
	return exec.Command(cmd, args...).Start()
}

func isWSL() bool {
	data, err := exec.Command("uname", "-r").Output()
	if err != nil {
		return false
	}
	return strings.Contains(strings.ToLower(string(data)), "microsoft")
}
