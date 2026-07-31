package emails

import (
	"context"
	"fmt"
	"os"

	"github.com/emersion/go-imap/v2"
	"github.com/emersion/go-imap/v2/imapclient"
	"github.com/rs/zerolog"

	"github.com/oxygem/kanmail/internal/constants"
	"github.com/oxygem/kanmail/internal/emails/imapinterface"
	"github.com/oxygem/kanmail/internal/emails/oauth"
	"github.com/oxygem/kanmail/internal/types"
	"github.com/oxygem/kanmail/internal/util"
)

type IMAPConnectionPool struct {
	*ConnectionPool[*IMAPConnectionWrapper]
}

func NewIMAPConnectionPool(options ConnectionPoolOptions, conf types.ConnectionSettings) *IMAPConnectionPool {
	return &IMAPConnectionPool{
		ConnectionPool: NewConnectionPool(options, func() *IMAPConnectionWrapper {
			return &IMAPConnectionWrapper{
				conf:     conf,
				notifyCh: make(chan struct{}, 1),
			}
		}),
	}
}

func (c *IMAPConnectionPool) WithConnection(
	ctx context.Context,
	fn func(conn imapinterface.IMAPClient) error,
) error {
	return c.withConnection(ctx, func(wrapper *IMAPConnectionWrapper) error {
		if conn, err := wrapper.Get(ctx); err != nil {
			return err
		} else {
			return fn(conn)
		}
	})
}

func (c *IMAPConnectionPool) WithFolderConnection(
	ctx context.Context,
	folderName types.FolderName,
	fn func(conn imapinterface.IMAPClient) error,
) error {
	return c.withConnection(ctx, func(wrapper *IMAPConnectionWrapper) error {
		if conn, err := wrapper.Get(ctx); err != nil {
			return err
		} else {
			if _, err := conn.Select(string(folderName), nil).Wait(); err != nil {
				return err
			}
			defer zerolog.Ctx(ctx).Trace().Str("folder", string(folderName)).Msg("Unselected folder")
			defer func() {
				if err := conn.Unselect().Wait(); err != nil {
					zerolog.Ctx(ctx).Err(err).Str("folder", string(folderName)).Msg("Failed to unselect folder")
				}
			}()
			zerolog.Ctx(ctx).Trace().Str("folder", string(folderName)).Msg("Selected folder")

			return fn(conn)
		}
	})
}

func (c *IMAPConnectionPool) WithPriorityConnection(
	ctx context.Context,
	fn func(conn imapinterface.IMAPClient) error,
) error {
	return c.withPriorityConnection(ctx, func(wrapper *IMAPConnectionWrapper) error {
		if conn, err := wrapper.Get(ctx); err != nil {
			return err
		} else {
			return fn(conn)
		}
	})
}

func (c *IMAPConnectionPool) WithFolderPriorityConnection(
	ctx context.Context,
	folderName types.FolderName,
	fn func(conn imapinterface.IMAPClient) error,
) error {
	return c.withPriorityConnection(ctx, func(wrapper *IMAPConnectionWrapper) error {
		if conn, err := wrapper.Get(ctx); err != nil {
			return err
		} else {
			if _, err := conn.Select(string(folderName), nil).Wait(); err != nil {
				return err
			}
			defer zerolog.Ctx(ctx).Trace().Str("folder", string(folderName)).Msg("Unselected folder")
			defer func() { conn.Unselect().Wait() }()
			zerolog.Ctx(ctx).Trace().Str("folder", string(folderName)).Msg("Selected folder")

			return fn(conn)
		}
	})
}

func (c *IMAPConnectionPool) WithBackgroundConnection(
	ctx context.Context,
	fn func(conn imapinterface.IMAPClient) error,
) error {
	return c.withBackgroundConnection(ctx, func(wrapper *IMAPConnectionWrapper) error {
		if conn, err := wrapper.Get(ctx); err != nil {
			return err
		} else {
			return fn(conn)
		}
	})
}

func (c *IMAPConnectionPool) WithFolderBackgroundConnection(
	ctx context.Context,
	folderName types.FolderName,
	fn func(conn imapinterface.IMAPClient) error,
) error {
	return c.withBackgroundConnection(ctx, func(wrapper *IMAPConnectionWrapper) error {
		if conn, err := wrapper.Get(ctx); err != nil {
			return err
		} else {
			if _, err := conn.Select(string(folderName), nil).Wait(); err != nil {
				return err
			}
			defer zerolog.Ctx(ctx).Trace().Str("folder", string(folderName)).Msg("Unselected folder")
			defer func() { conn.Unselect().Wait() }()
			zerolog.Ctx(ctx).Trace().Str("folder", string(folderName)).Msg("Selected folder")

			return fn(conn)
		}
	})
}

// WithIdleConnection borrows a spare regular-pool connection for IDLE watching.
// notify receives a coalesced ping whenever the server pushes unilateral data
// while fn holds the connection; fn must stop IDLE once preempt is closed.
// Returns errNoIdleConnection when no connection is spare right now.
func (c *IMAPConnectionPool) WithIdleConnection(
	ctx context.Context,
	fn func(conn imapinterface.IMAPClient, notify, preempt <-chan struct{}) error,
) error {
	return c.withIdleConnection(ctx, func(wrapper *IMAPConnectionWrapper, preempt <-chan struct{}) error {
		conn, err := wrapper.Get(ctx)
		if err != nil {
			return err
		}
		// The connection pings notifyCh on any unilateral data, watched or not.
		// Drop anything that accumulated while it was doing other pool work -
		// the watcher's mark comparison decides freshness, not stale pings.
		wrapper.drainNotify()
		return fn(conn, wrapper.notifyCh, preempt)
	})
}

// Lazily loaded imapclient.Client - not safe for use by concurrent goroutines, use the pool!
type IMAPConnectionWrapper struct {
	client imapinterface.IMAPClient
	conf   types.ConnectionSettings

	// notifyCh receives a coalesced ping whenever the server pushes unilateral
	// data on this connection; consumed (and drained) by WithIdleConnection.
	notifyCh chan struct{}
}

func (c *IMAPConnectionWrapper) drainNotify() {
	select {
	case <-c.notifyCh:
	default:
	}
}

// unilateralHandler is installed on every dialed connection so any pooled
// connection can serve as a watcher. Mailbox/Expunge run inline on the read loop
// and must not block; Fetch runs on its own goroutine and must drain its data.
func (c *IMAPConnectionWrapper) unilateralHandler() *imapclient.UnilateralDataHandler {
	notify := func() {
		select {
		case c.notifyCh <- struct{}{}:
		default:
		}
	}
	return &imapclient.UnilateralDataHandler{
		Expunge: func(seqNum uint32) { notify() },
		Mailbox: func(data *imapclient.UnilateralDataMailbox) { notify() },
		Fetch: func(msg *imapclient.FetchMessageData) {
			for msg.Next() != nil {
			}
			notify()
		},
	}
}

func (c *IMAPConnectionWrapper) Close() error {
	if c.client == nil {
		return nil
	}
	return c.client.Close()
}

func (c *IMAPConnectionWrapper) Get(ctx context.Context) (imapinterface.IMAPClient, error) {
	log := zerolog.Ctx(ctx)

	// Check if fake IMAP mode is enabled
	if constants.ENV_DEBUG_FAKE_IMAP != "" {
		if c.client == nil {
			log.Info().Msg("Using fake IMAP client for debugging")
			c.client = imapinterface.NewFakeIMAPClientWithHandler(c.conf.Username, c.unilateralHandler())
		}
		return c.client, nil
	}

	if c.client != nil {
		cClose := func() {
			if err := c.client.Close(); err != nil {
				log.Warn().Err(err).Msg("Client close failed")
			}
			c.client = nil
		}
		// Watch connections keep their folder selected between uses, so both
		// authenticated and selected are healthy states.
		if state := c.client.State(); state != imap.ConnStateAuthenticated && state != imap.ConnStateSelected {
			// If we're connected (have a client) but not authenticated
			log.Warn().Stringer("state", state).Msg("Connection is in wrong state")
			cClose()
		} else if err := c.client.Noop().Wait(); err != nil {
			// If we're connected/authed but cannot NOOP, retry
			log.Warn().Err(err).Msg("NOOP failed, re-creating client")
			cClose()
		}
	}

	if c.client == nil {
		options := &imapclient.Options{
			UnilateralDataHandler: c.unilateralHandler(),
		}
		if constants.ENV_DEBUG_IMAP_IO != "" {
			options.DebugWriter = os.Stdout
		}

		dialFn := imapclient.DialInsecure
		if c.conf.SSL {
			dialFn = imapclient.DialTLS
		} else if c.conf.StartTLS {
			dialFn = imapclient.DialStartTLS
		}

		addr := fmt.Sprintf("%s:%d", c.conf.Host, c.conf.Port)
		log.Trace().Str("address", addr).Msg("Connecting")
		client, err := dialFn(addr, options)
		if err != nil {
			return nil, fmt.Errorf("failed imap dial: %w", err)
		} else {
			log.Debug().Msg("Connected")
		}

		if c.conf.Password != "" {
			if err := client.Login(c.conf.Username, c.conf.Password).Wait(); err != nil {
				client.Close()
				return nil, fmt.Errorf("failed imap password login: %w %s@%s:%d", err, c.conf.Username, c.conf.Host, c.conf.Port)
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
				client, err = dialFn(addr, options)
				if err != nil {
					return nil, fmt.Errorf("failed imap redial: %w", err)
				} else {
					log.Debug().Msg("Connected")
				}
				if err := c.doOAuthLogin(ctx, client); err != nil {
					client.Close()
					return nil, fmt.Errorf("failed imap oauth login (twice): %w", err)
				}
			}
		} else {
			client.Close()
			return nil, fmt.Errorf("no authentication methods configured")
		}

		log.Debug().Msg("Authenticated")
		c.client = &imapinterface.IMAPClientWrapper{Client: client}
	}

	return c.client, nil
}

func (c *IMAPConnectionWrapper) doOAuthLogin(ctx context.Context, client *imapclient.Client) error {
	accessToken, err := oauth.GetOAuthAccessToken(ctx, c.conf.OAuthProvider, c.conf.OAuthRefreshToken)
	if err != nil {
		return fmt.Errorf("failed to get access token: %w", err)
	}

	if err := client.Authenticate(oauth.MakeSASLClient(c.conf, accessToken)); err != nil {
		oauth.ClearOAuthAccessToken(c.conf.OAuthRefreshToken, accessToken)
		return err
	}

	return nil
}
