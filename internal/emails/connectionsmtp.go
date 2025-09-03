package emails

import (
	"context"
	"fmt"

	"github.com/emersion/go-sasl"
	"github.com/emersion/go-smtp"
	"github.com/rs/zerolog"

	"github.com/oxygem/kanmail/internal/emails/oauth"
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
	fn func(conn *smtp.Client) error,
) error {
	return c.GetConnection(ctx, func(wrapper *SMTPConnectionWrapper) error {
		if conn, err := wrapper.Get(ctx); err != nil {
			return err
		} else {
			return fn(conn)
		}
	})
}

// Lazily loaded smtp.Client - not safe for use by concurrent goroutines, use the pool!
type SMTPConnectionWrapper struct {
	client *smtp.Client
	conf   types.ConnectionSettings
}

func (c *SMTPConnectionWrapper) Close() error {
	if c.client == nil {
		return nil
	}
	return c.client.Close()
}

func (c *SMTPConnectionWrapper) Get(ctx context.Context) (*smtp.Client, error) {
	log := zerolog.Ctx(ctx)

	if c.client == nil {
		addr := fmt.Sprintf("%s:%d", c.conf.Host, c.conf.Port)
		client, err := smtp.DialTLS(addr, nil)
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
			if err := client.Auth(auth); err != nil {
				return nil, fmt.Errorf("failed imap oauth login: %w", err)
			}
		} else {
			return nil, fmt.Errorf("no authentication methods configured")
		}

		log.Debug().Msg("Authenticated")
		c.client = client
	}

	return c.client, nil
}
