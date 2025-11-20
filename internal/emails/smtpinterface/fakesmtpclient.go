package smtpinterface

import (
	"context"
	"io"

	"github.com/rs/zerolog"
)

var _ SMTPClient = (*FakeSMTPClient)(nil)

type FakeSMTPClient struct {
	log zerolog.Logger
}

// NewFakeSMTPClient creates a new fake IMAP client with sample data
func NewFakeSMTPClient() *FakeSMTPClient {
	log := zerolog.Ctx(context.TODO()).With().
		Str("component", "FakeSMTPClient").
		Logger()

	client := &FakeSMTPClient{
		log: log,
	}

	return client
}

func (s *FakeSMTPClient) Close() error {
	return nil
}

func (s *FakeSMTPClient) Noop() error {
	return nil
}

func (s *FakeSMTPClient) SendMail(from string, to []string, msg io.Reader) error {
	return nil
}
