package imaptest

import (
	"bytes"
	"fmt"
	"io"
	"time"

	"github.com/emersion/go-imap/v2"
	"github.com/emersion/go-message/mail"
	"github.com/google/uuid"
)

// message is a test email to append: a plain text one by default, a
// multipart/alternative one when html is set, multipart/mixed with an
// attachment when that is set.
type message struct {
	from, to       string
	subject        string
	messageID      string
	inReplyTo      string
	references     []string
	date           time.Time
	text, html     string
	attachment     []byte
	attachmentName string
	flags          []imap.Flag
}

func newMessageID() string {
	return fmt.Sprintf("<%s@imaptest.kanmail>", uuid.NewString())
}

func (m message) header() mail.Header {
	var header mail.Header
	if m.date.IsZero() {
		m.date = time.Now()
	}
	header.SetDate(m.date)
	header.SetSubject(m.subject)
	if m.from == "" {
		m.from = "Alice Example <alice@example.org>"
	}
	if m.to == "" {
		m.to = "Bob Example <bob@example.org>"
	}
	header.Set("From", m.from)
	header.Set("To", m.to)
	if m.messageID == "" {
		m.messageID = newMessageID()
	}
	header.Set("Message-ID", m.messageID)
	if m.inReplyTo != "" {
		header.Set("In-Reply-To", m.inReplyTo)
	}
	if len(m.references) > 0 {
		header.SetMsgIDList("References", m.references)
	}
	return header
}

func (m message) build() []byte {
	var b bytes.Buffer
	header := m.header()

	if m.html == "" && m.attachment == nil {
		header.SetContentType("text/plain", map[string]string{"charset": "utf-8"})
		w, err := mail.CreateSingleInlineWriter(&b, header)
		if err != nil {
			panic(err)
		}
		io.WriteString(w, m.text)
		w.Close()
		return b.Bytes()
	}

	writer, err := mail.CreateWriter(&b, header)
	if err != nil {
		panic(err)
	}
	inline, err := writer.CreateInline()
	if err != nil {
		panic(err)
	}
	for _, part := range []struct{ contentType, body string }{
		{"text/plain", m.text},
		{"text/html", m.html},
	} {
		if part.body == "" {
			continue
		}
		var partHeader mail.InlineHeader
		partHeader.SetContentType(part.contentType, map[string]string{"charset": "utf-8"})
		w, err := inline.CreatePart(partHeader)
		if err != nil {
			panic(err)
		}
		io.WriteString(w, part.body)
		w.Close()
	}
	inline.Close()
	if m.attachment != nil {
		var attachmentHeader mail.AttachmentHeader
		attachmentHeader.SetFilename(m.attachmentName)
		attachmentHeader.SetContentType("application/octet-stream", nil)
		w, err := writer.CreateAttachment(attachmentHeader)
		if err != nil {
			panic(err)
		}
		w.Write(m.attachment)
		w.Close()
	}
	writer.Close()
	return b.Bytes()
}
