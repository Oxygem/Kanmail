package smtpinterface

import (
	"context"
	"io"
	"slices"
	"sync"

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

// FakeSentMail is a message the fake client was asked to deliver, as it went
// over the wire
type FakeSentMail struct {
	From string
	To   []string
	Data []byte
}

var (
	fakeSentMail     []FakeSentMail
	fakeSentMailLock sync.Mutex
)

// FakeSentMails returns everything fake clients have delivered, oldest first
func FakeSentMails() []FakeSentMail {
	fakeSentMailLock.Lock()
	defer fakeSentMailLock.Unlock()
	return slices.Clone(fakeSentMail)
}

func (s *FakeSMTPClient) SendMail(from string, to []string, msg io.Reader) error {
	data, err := io.ReadAll(msg)
	if err != nil {
		return err
	}

	fakeSentMailLock.Lock()
	defer fakeSentMailLock.Unlock()
	fakeSentMail = append(fakeSentMail, FakeSentMail{From: from, To: to, Data: data})
	return nil
}
