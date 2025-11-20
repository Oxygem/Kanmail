package smtpinterface

import (
	"io"

	"github.com/emersion/go-smtp"
)

// Ensure SMTP interface matches the upstream package
var _ SMTPClient = (*smtp.Client)(nil)

type SMTPClient interface {
	Close() error
	Noop() error
	SendMail(string, []string, io.Reader) error
}
