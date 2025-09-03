package emails

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"maps"
	"os"
	"path/filepath"
	"slices"
	"time"

	"github.com/emersion/go-message/mail"
	"github.com/emersion/go-smtp"
	"github.com/rs/zerolog"

	"github.com/oxygem/kanmail/internal/types"
)

type SendAttachment struct {
	Path        string `json:"path"`
	Filename    string `json:"filename"`
	ContentType string `json:"contentType"`
}

type SendOptions struct {
	Subject string `json:"subject,omitempty"`
	Text    string `json:"text,omitempty"`
	HTML    string `json:"html,omitempty"`

	To   types.Addresses `json:"to,omitempty"`
	Cc   types.Addresses `json:"cc,omitempty"`
	From types.Address   `json:"from,omitempty"`

	Attachments []SendAttachment `json:"attachments,omitempty"`
}

func (a *Account) SendEmail(ctx context.Context, options SendOptions) error {
	if len(options.To) == 0 {
		return errors.New("no to addresses specified")
	}

	var header mail.Header

	header.SetDate(time.Now())
	header.GenerateMessageIDWithHostname("com.oxygem.kanmail")

	header.SetSubject(options.Subject)

	header.SetAddressList("To", options.To.MailAddresses())
	header.SetAddressList("Cc", options.Cc.MailAddresses())
	header.SetAddressList("From", []*mail.Address{options.From.MailAddress()})

	var b bytes.Buffer

	// Mixed writer (text/html + attachments)
	var mw *mail.Writer
	// Inline writer (text/html)
	var iw *mail.InlineWriter

	var err error
	if len(options.Attachments) == 0 && false {
		// Just create inline multipart/alternative for the text/html
		iw, err = mail.CreateInlineWriter(&b, header)
		if err != nil {
			return err
		}
	} else {
		// Create top level multipart/mixed writer from header for inline + attachments
		mw, err = mail.CreateWriter(&b, header)
		if err != nil {
			return err
		}

		// Create inline (text) writer for plain and html texts
		iw, err = mw.CreateInline()
		if err != nil {
			return err
		}
	}

	if options.Text != "" {
		var h mail.InlineHeader
		h.SetContentType("text/plain", nil)
		w, err := iw.CreatePart(h)
		if err != nil {
			return err
		}
		if n, err := w.Write([]byte(options.Text)); err != nil {
			return err
		} else if err = w.Close(); err != nil {
			return err
		} else {
			zerolog.Ctx(ctx).Warn().Int("WRIT", n).Msg("WRITE TEXT BYTES")
		}
	}

	if options.HTML != "" {
		var h mail.InlineHeader
		h.SetContentType("text/html", nil)
		w, err := iw.CreatePart(h)
		if err != nil {
			return err
		}
		if n, err := w.Write([]byte(options.HTML)); err != nil {
			return err
		} else if err = w.Close(); err != nil {
			return err
		} else {
			zerolog.Ctx(ctx).Warn().Int("WRIT", n).Msg("WRITE HTML BYTES")
		}
	}

	if err := iw.Close(); err != nil {
		return err
	}

	for _, attachment := range options.Attachments {
		var h mail.AttachmentHeader
		h.SetContentType(attachment.ContentType, nil)
		h.SetFilename(filepath.Base(attachment.Path))
		w, err := mw.CreateAttachment(h)
		if err != nil {
			return fmt.Errorf("Failed to create attachment: %w", err)
		}
		f, err := os.Open(attachment.Path)
		if err != nil {
			return fmt.Errorf("failed to open attachment file: %s: %w", attachment.Path, err)
		} else if _, err := io.Copy(w, f); err != nil {
			return fmt.Errorf("failed to copy attachment: %w", err)
		}
		if err := f.Close(); err != nil {
			return err
		} else if err := w.Close(); err != nil {
			return fmt.Errorf("failed to close attachment writer: %w", err)
		}
	}

	if mw != nil {
		if err := mw.Close(); err != nil {
			return fmt.Errorf("failed to close multiwriter: %w", err)
		}
	}

	uniqueAddrs := make(map[string]struct{}, len(options.To)+len(options.Cc))
	for _, addr := range append(options.To, options.Cc...) {
		uniqueAddrs[addr.Email] = struct{}{}
	}
	toAddrs := slices.Collect(maps.Keys(uniqueAddrs))

	log := zerolog.Ctx(ctx).With().
		Any("from", options.From).
		Any("to", options.To).
		Any("cc", options.Cc).
		Int("text_bytes", len([]byte(options.Text))).
		Int("html_bytes", len([]byte(options.HTML))).
		Int("attachments", len(options.Attachments)).
		Logger()

	log.Debug().Msg("Sending email")

	return a.smtp.WithConnection(ctx, func(conn *smtp.Client) error {
		if err := conn.SendMail("", toAddrs, &b); err != nil {
			log.Err(err).Msg("Failed to send email")
			return err
		}
		log.Info().Msg("Sent email")
		return nil
	})
}
