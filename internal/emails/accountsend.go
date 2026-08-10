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
	"strings"
	"time"
	"unicode"

	"github.com/emersion/go-imap/v2"
	"github.com/emersion/go-message"
	"github.com/emersion/go-message/mail"
	"github.com/rs/zerolog"

	"github.com/oxygem/kanmail/internal/emails/smtpinterface"
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

	ReplyingTo *types.Email `json:"replyingTo,omitempty"`
}

func (a *Account) SendEmail(ctx context.Context, options SendOptions) (*types.Email, error) {
	if len(options.To) == 0 {
		return nil, errors.New("no to addresses specified")
	}

	var header mail.Header

	sentAt := time.Now()
	header.SetDate(sentAt)
	header.GenerateMessageIDWithHostname("com.oxygem.kanmail")

	header.SetSubject(options.Subject)

	header.SetAddressList("To", options.To.MailAddresses())
	header.SetAddressList("Cc", options.Cc.MailAddresses())
	header.SetAddressList("From", []*mail.Address{options.From.MailAddress()})

	// https://datatracker.ietf.org/doc/html/rfc5322#section-3.6.4
	if options.ReplyingTo != nil {
		// "The "In-Reply-To:" field will contain the contents of the "Message-ID:" field of the message to which this one is a reply (the "parent message")."
		header.SetMsgIDList("In-Reply-To", []string{options.ReplyingTo.MessageID})
		// "The "References:" field will contain the contents of the parent's "References:" field (if any) followed by the contents of the parent's "Message-ID:" field (if any).""
		header.SetMsgIDList("References", append(options.ReplyingTo.References, options.ReplyingTo.MessageID))
	}

	var b bytes.Buffer

	// Create top level multipart/mixed writer from header for inline + attachments
	mw, err := mail.CreateWriter(&b, header)
	if err != nil {
		return nil, err
	}

	// Create inline (text) writer for plain and html texts
	iw, err := mw.CreateInline()
	if err != nil {
		return nil, err
	}

	if options.Text != "" {
		var h mail.InlineHeader
		h.SetContentType("text/plain", nil)
		w, err := iw.CreatePart(h)
		if err != nil {
			return nil, err
		}
		if _, err := w.Write([]byte(options.Text)); err != nil {
			return nil, err
		} else if err := w.Close(); err != nil {
			return nil, err
		}
	}

	if options.HTML != "" {
		var h mail.InlineHeader
		h.SetContentType("text/html", nil)
		w, err := iw.CreatePart(h)
		if err != nil {
			return nil, err
		}
		if _, err := w.Write([]byte(options.HTML)); err != nil {
			return nil, err
		} else if err := w.Close(); err != nil {
			return nil, err
		}
	}

	if err := iw.Close(); err != nil {
		return nil, err
	}

	for _, attachment := range options.Attachments {
		var h mail.AttachmentHeader
		h.SetContentType(attachment.ContentType, nil)
		h.SetFilename(filepath.Base(attachment.Path))
		w, err := mw.CreateAttachment(h)
		if err != nil {
			return nil, fmt.Errorf("failed to create attachment: %w", err)
		}
		f, err := os.Open(attachment.Path)
		if err != nil {
			return nil, fmt.Errorf("failed to open attachment file: %s: %w", attachment.Path, err)
		}
		_, copyErr := io.Copy(w, f)
		closeErr := f.Close()
		if copyErr != nil {
			return nil, fmt.Errorf("failed to copy attachment: %w", copyErr)
		}
		if closeErr != nil {
			return nil, closeErr
		}
		if err := w.Close(); err != nil {
			return nil, fmt.Errorf("failed to close attachment writer: %w", err)
		}
	}

	if err := mw.Close(); err != nil {
		return nil, fmt.Errorf("failed to close multiwriter: %w", err)
	}

	// Derive an imap.BodyStructure from the bytes we just wrote, then reuse the
	// same extractor that folder.go runs on fetched mail — keeps Parts/PartText/
	// PartHTML/PartDisplay consistent so the frontend can reload the sent email.
	bodyStructure, err := bodyStructureFromMessage(b.Bytes())
	if err != nil {
		return nil, fmt.Errorf("failed to derive body structure from sent message: %w", err)
	}
	parts, textPart, htmlPart, displayPart := types.ExtractBodyParts(bodyStructure)

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

	if err := a.smtp.WithConnectionOnce(ctx, func(conn smtpinterface.SMTPClient) error {
		if err := conn.SendMail(options.From.Email, toAddrs, bytes.NewReader(b.Bytes())); err != nil {
			return fmt.Errorf("failed to send email: %w", err)
		}
		log.Info().Msg("Sent email")
		return nil
	}); err != nil {
		return nil, fmt.Errorf("failed to send email: %w", err)
	}

	messageID, _ := header.MessageID()
	sentFolder := a.Folders.GetFromName("sent")

	sentEmail := &types.Email{
		AccountID:       a.ID,
		FolderName:      sentFolder,
		FolderAliasName: "sent",
		UID:             0,
		Flags:           []imap.Flag{imap.FlagSeen},
		Size:            int64(b.Len()),
		Date:            sentAt,
		Subject:         options.Subject,
		Excerpt:         makeSentExcerpt(options.Text, options.HTML),
		From:            []types.Address{options.From},
		To:              options.To,
		CC:              options.Cc,
		ReplyTo:         []types.Address{options.From},
		MessageID:       messageID,
		Parts:           parts,
		PartText:        textPart,
		PartHTML:        htmlPart,
		PartDisplay:     displayPart,
	}
	if options.ReplyingTo != nil {
		sentEmail.References = append(sentEmail.References, options.ReplyingTo.References...)
		sentEmail.References = append(sentEmail.References, options.ReplyingTo.MessageID)
	}

	if a.Settings.SaveSentCopies && sentFolder != "" {
		log.Debug().Msg("Saving email")
		if uid, err := a.GetFolder("sent").AppendEmail(ctx, b); err != nil {
			// Log, but don't return an error here,  we don't want the user to re-try as it'll be
			// a double-send which is worse.
			zerolog.Ctx(ctx).Err(err).Msg("Failed to save email after sending")
		} else {
			sentEmail.UID = uid
		}
	}

	return sentEmail, nil
}

// makeSentExcerpt produces a short plain-text excerpt for the sent-email list view.
// Prefers the text part; falls back to a naive HTML strip.
func makeSentExcerpt(text, html string) string {
	src := text
	if src == "" {
		src = stripHTMLTags(html)
	}
	src = strings.Map(func(r rune) rune {
		if unicode.IsSpace(r) {
			return ' '
		}
		return r
	}, src)
	src = strings.TrimSpace(src)
	if len(src) > 200 {
		src = src[:200]
	}
	return src
}

// bodyStructureFromMessage parses an RFC822 message we just wrote and lifts it
// into an imap.BodyStructure tree — the same shape we'd otherwise receive from
// an IMAP server. Callers can then run types.ExtractBodyParts on it, the same
// way folder.go does for fetched mail.
func bodyStructureFromMessage(raw []byte) (imap.BodyStructure, error) {
	entity, err := message.Read(bytes.NewReader(raw))
	if err != nil && !message.IsUnknownCharset(err) {
		return nil, err
	}
	if entity == nil {
		return nil, nil
	}
	return entityToBodyStructure(entity)
}

func entityToBodyStructure(e *message.Entity) (imap.BodyStructure, error) {
	mediaType, params, _ := e.Header.ContentType()
	typ, subtype, _ := strings.Cut(mediaType, "/")

	if mr := e.MultipartReader(); mr != nil {
		var children []imap.BodyStructure
		for {
			part, err := mr.NextPart()
			if err == io.EOF {
				break
			}
			if err != nil && !message.IsUnknownCharset(err) {
				return nil, err
			}
			child, err := entityToBodyStructure(part)
			if err != nil {
				return nil, err
			}
			children = append(children, child)
		}
		return &imap.BodyStructureMultiPart{
			Subtype:  subtype,
			Children: children,
		}, nil
	}

	bodyBytes, err := io.ReadAll(e.Body)
	if err != nil {
		return nil, err
	}

	var ext *imap.BodyStructureSinglePartExt
	if disp, dispParams, dispErr := e.Header.ContentDisposition(); dispErr == nil && disp != "" {
		ext = &imap.BodyStructureSinglePartExt{
			Disposition: &imap.BodyStructureDisposition{
				Value:  disp,
				Params: dispParams,
			},
		}
	}

	return &imap.BodyStructureSinglePart{
		Type:        typ,
		Subtype:     subtype,
		Params:      params,
		ID:          strings.Trim(e.Header.Get("Content-ID"), "<>"),
		Description: e.Header.Get("Content-Description"),
		Encoding:    e.Header.Get("Content-Transfer-Encoding"),
		Size:        uint32(len(bodyBytes)),
		Extended:    ext,
	}, nil
}

func stripHTMLTags(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	inTag := false
	for _, r := range s {
		switch {
		case r == '<':
			inTag = true
		case r == '>':
			inTag = false
		case !inTag:
			b.WriteRune(r)
		}
	}
	return b.String()
}
