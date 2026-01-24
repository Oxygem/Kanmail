package emails

import (
	"context"
	"crypto/tls"
	"fmt"

	"github.com/emersion/go-sasl"
	"github.com/emersion/go-smtp"
	"github.com/rs/zerolog"

	"github.com/oxygem/kanmail/internal/constants"
	"github.com/oxygem/kanmail/internal/emails/oauth"
	"github.com/oxygem/kanmail/internal/emails/smtpinterface"
	"github.com/oxygem/kanmail/internal/types"
)

type SMTPConnectionPool struct {
	*ConnectionPool[*SMTPConnectionWrapper]
}

func NewSMTPConnectionPool(options ConnectionPoolOptions, conf types.ConnectionSettings) *SMTPConnectionPool {
	return &SMTPConnectionPool{
		ConnectionPool: NewConnectionPool(options, func() *SMTPConnectionWrapper {
			return &SMTPConnectionWrapper{
				conf: conf,
			}
		}),
	}
}

func (c *SMTPConnectionPool) WithConnection(
	ctx context.Context,
	fn func(conn smtpinterface.SMTPClient) error,
) error {
	return c.withConnection(ctx, func(wrapper *SMTPConnectionWrapper) error {
		if conn, err := wrapper.Get(ctx); err != nil {
			return err
		} else {
			return fn(conn)
		}
	})
}

// Lazily loaded smtp.Client - not safe for use by concurrent goroutines, use the pool!
type SMTPConnectionWrapper struct {
	client smtpinterface.SMTPClient
	conf   types.ConnectionSettings
}

func (c *SMTPConnectionWrapper) Close() error {
	if c.client == nil {
		return nil
	}
	return c.client.Close()
}

func (c *SMTPConnectionWrapper) Get(ctx context.Context) (smtpinterface.SMTPClient, error) {
	log := zerolog.Ctx(ctx)

	// Check if fake IMAP??? mode is enabled
	if constants.ENV_DEBUG_FAKE_IMAP != "" {
		if c.client == nil {
			log.Info().Msg("Using fake SMTP client for debugging")
			c.client = smtpinterface.NewFakeSMTPClient()
		}
		return c.client, nil
	}

	if c.client == nil {
		dialFn := func(addr string, _ *tls.Config) (*smtp.Client, error) {
			return smtp.Dial(addr)
		}

		if c.conf.SSL {
			dialFn = smtp.DialTLS
		} else if c.conf.StartTLS {
			dialFn = smtp.DialStartTLS
		}

		addr := fmt.Sprintf("%s:%d", c.conf.Host, c.conf.Port)
		client, err := dialFn(addr, nil)
		if err != nil {
			return nil, fmt.Errorf("failed smtp dial: %w", err)
		} else {
			log.Debug().Msg("Connected")
		}

		var auth sasl.Client
		if c.conf.Password != "" {
			auth = sasl.NewPlainClient("", c.conf.Username, c.conf.Password)
		} else if c.conf.OAuthProvider != "" {
			accessToken, err := oauth.GetOAuthAccessToken(ctx, c.conf.OAuthProvider, c.conf.OAuthRefreshToken)
			if err != nil {
				return nil, fmt.Errorf("failed to get oauth access token: %w", err)
			}
			auth = oauth.MakeSASLClient(c.conf, accessToken)
		} else {
			return nil, fmt.Errorf("no authentication methods configured")
		}

		if err := client.Auth(auth); err != nil {
			return nil, fmt.Errorf("failed imap oauth login: %w", err)
		}

		log.Debug().Msg("Authenticated")
		c.client = client
	}

	return c.client, nil
}
