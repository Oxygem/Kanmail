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
	"github.com/oxygem/kanmail/internal/util"
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

// WithConnectionOnce runs fn without retries - see withConnectionOnce. Sending
// is not replayable: an error after the server accepted DATA means the message
// is already on its way, and retrying delivers it again.
func (c *SMTPConnectionPool) WithConnectionOnce(
	ctx context.Context,
	fn func(conn smtpinterface.SMTPClient) error,
) error {
	return c.withConnectionOnce(func(wrapper *SMTPConnectionWrapper) error {
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

	if c.client != nil {
		if err := c.client.Noop(); err != nil {
			// If we're connected/authed but cannot NOOP, retry
			log.Warn().Err(err).Msg("NOOP failed, re-creating client")
			c.client.Close()
			c.client = nil
		}
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

		if c.conf.Password != "" {
			auth := sasl.NewPlainClient("", c.conf.Username, c.conf.Password)
			if err := client.Auth(auth); err != nil {
				return nil, fmt.Errorf("failed smtp password login: %w", err)
			}
		} else if c.conf.OAuthProvider != "" && c.conf.OAuthRefreshToken != "" {
			// Attempt OAuth logins twice, allowing for any expired token to be updated
			if err := c.doOAuthLogin(ctx, client); err != nil {
				if util.IsReauthRequired(err) {
					client.Close()
					return nil, err
				}
				log.Warn().Err(err).Msg("OAuth login failed, recreating client")
				client.Close()
				client, err = dialFn(addr, nil)
				if err != nil {
					return nil, fmt.Errorf("failed smtp redial: %w", err)
				} else {
					log.Debug().Msg("Connected")
				}
				if err := c.doOAuthLogin(ctx, client); err != nil {
					return nil, fmt.Errorf("failed smtp oauth login (twice): %w", err)
				}
			}
		} else {
			return nil, fmt.Errorf("no authentication methods configured")
		}

		log.Debug().Msg("Authenticated")
		c.client = client
	}

	return c.client, nil
}

func (c *SMTPConnectionWrapper) doOAuthLogin(ctx context.Context, client *smtp.Client) error {
	accessToken, err := oauth.GetOAuthAccessToken(ctx, c.conf.OAuthProvider, c.conf.OAuthRefreshToken)
	if err != nil {
		return fmt.Errorf("failed to get access token: %w", err)
	}

	if err := client.Auth(oauth.MakeSASLClient(c.conf, accessToken)); err != nil {
		oauth.ClearOAuthAccessToken(c.conf.OAuthRefreshToken, accessToken)
		return err
	}

	return nil
}
