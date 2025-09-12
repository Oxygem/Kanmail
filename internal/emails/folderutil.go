package emails

import (
	"bufio"
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"io"
	"mime/quotedprintable"
	"net/textproto"
	"os"
	"path"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/emersion/go-imap/v2"
	"github.com/emersion/go-imap/v2/imapclient"
	"github.com/rs/zerolog"

	"github.com/oxygem/kanmail/internal/emails/imapinterface"
	"github.com/oxygem/kanmail/internal/types"
)

var tempDirForFailedDecodes string

func InitTempDirForFailedDecodes(path string) {
	if err := os.MkdirAll(path, os.ModePerm); err != nil {
		panic(err)
	}
	tempDirForFailedDecodes = path
}

func connFunc(conn imapinterface.IMAPClient) func(context.Context, types.FolderName, func(conn imapinterface.IMAPClient) error) error {
	return func(_ context.Context, _ types.FolderName, fn func(conn imapinterface.IMAPClient) error) error {
		return fn(conn)
	}
}

func imapAddrsToAddrs(imapAddrs []imap.Address) []types.Address {
	addrs := make([]types.Address, len(imapAddrs))
	for i, iAddr := range imapAddrs {
		addrs[i] = types.Address{
			Name:  iAddr.Name,
			Email: iAddr.Mailbox + "@" + iAddr.Host,
		}
	}
	return addrs
}

func (f *Folder) imapMessageToEmail(ctx context.Context, msg *imapclient.FetchMessageBuffer) *types.Email {
	email := types.Email{
		AccountName: f.AccountName,

		FolderName:      f.Name,
		FolderAliasName: f.AliasName,

		UID:     msg.UID,
		Flags:   msg.Flags,
		Size:    msg.RFC822Size,
		Date:    msg.Envelope.Date,
		Subject: msg.Envelope.Subject,

		From:    imapAddrsToAddrs(msg.Envelope.From),
		To:      imapAddrsToAddrs(msg.Envelope.To),
		Sender:  imapAddrsToAddrs(msg.Envelope.Sender),
		CC:      imapAddrsToAddrs(msg.Envelope.Cc),
		BCC:     imapAddrsToAddrs(msg.Envelope.Bcc),
		ReplyTo: imapAddrsToAddrs(msg.Envelope.ReplyTo),

		MessageID: msg.Envelope.MessageID,
	}

	for _, data := range msg.BodySection {
		// Parse the headers body section in the response
		if data.Section.Specifier == imap.PartSpecifierHeader {
			tp := textproto.NewReader(bufio.NewReader(bytes.NewReader(data.Bytes)))
			hdr, err := tp.ReadMIMEHeader()
			if err != nil {
				zerolog.Ctx(ctx).Warn().Err(err).Msg("Failed to parse email headers")
				continue
			}

			// Extract reference headers, we want to pull a list of the messageIDs without <>
			refHeaders := hdr.Values("REFERENCES")
			for _, refHeader := range refHeaders {
				refs := strings.Split(refHeader, " ")
				for _, ref := range refs {
					if strings.HasPrefix(ref, "=?") {
						// Skip RFC2047 "name" parts of the header
						// https://stackoverflow.com/questions/20032959
						continue
					}
					ref = strings.Trim(ref, "<>")
					email.References = append(email.References, ref)
				}
			}

			unsubHeaders := hdr.Values("LIST-UNSUBSCRIBE")
			unsubPostHeaders := hdr.Values("LIST-UNSUBSCRIBE-POST")

			for _, unsubURLs := range unsubHeaders {
				for _, unsubURL := range strings.Split(unsubURLs, ",") {
					unsubURL = strings.Trim(unsubURL, "<>")
					if strings.HasPrefix(unsubURL, "https://") {
						email.ListUnsubscribeURL = unsubURL
						email.ListUnsubscribeOneclick = len(unsubPostHeaders) == 1 && unsubPostHeaders[0] == "List-Unsubscribe=One-Click"
					}
				}
			}

			zerolog.Ctx(context.TODO()).Error().Any("UNSUDB", unsubHeaders).Any("POSTHEADERS", unsubPostHeaders).Msg("UNSUBZzZzzz")
		}
	}

	// For each in reply to value prepend to the references list if it doesn't already exist, this
	// handles various clients using one or both fields in different ways.
	for _, msgid := range slices.Backward(msg.Envelope.InReplyTo) {
		if !slices.Contains(email.References, msgid) {
			email.References = append([]string{msgid}, email.References...)
		}
	}

	return &email
}

var isFullHTMLTokens = [][]byte{
	[]byte("<!DOCTYPE"),
	[]byte("<html"),
	[]byte("<HTML"),
	[]byte("<body"),
	[]byte("<BODY"),
}

func isFullHTML(b []byte) bool {
	for _, t := range isFullHTMLTokens {
		if bytes.Contains(b, t) {
			return true
		}
	}
	return false
}

func (f *Folder) decodePart(ctx context.Context, in bodyPartResp) []byte {
	var d []byte
	var err error

	// Decode body
	switch strings.ToUpper(in.Encoding) {
	case "7BIT", "8BIT":
		// ASCII, good as-is
		d = in.Bytes
	case "BASE64":
		d = make([]byte, base64.RawStdEncoding.DecodedLen(len(in.Bytes)))
		_, err = base64.RawStdEncoding.Decode(d, bytes.TrimRight(in.Bytes, "="))
	case "QUOTED-PRINTABLE":
		d, err = io.ReadAll(quotedprintable.NewReader(bytes.NewReader(in.Bytes)))
	default:
		err = fmt.Errorf("unknown encoding: %s", in.Encoding)
	}

	log := zerolog.Ctx(ctx).With().
		Str("encoding", in.Encoding).
		Str("media_type", in.Type).
		Uint32("size", in.Size).
		Logger()

	if err == nil {
		log.Trace().Msg("Body part decoded")
		return d
	}

	if tempDirForFailedDecodes == "" {
		zerolog.Ctx(ctx).Err(err).
			Str("encoding", in.Encoding).
			Str("media_type", in.Type).
			Uint32("size", in.Size).
			Msg("Body part decode failed")
	} else {
		timeStr := strconv.Itoa(int(time.Now().UnixMilli()))
		encoding := in.Encoding
		if encoding == "" {
			encoding = "unknown"
		}
		filename := path.Join(tempDirForFailedDecodes, timeStr+"."+encoding)
		if err := os.WriteFile(filename, in.Bytes, os.ModePerm); err != nil {
			panic(err)
		}
		zerolog.Ctx(ctx).Err(err).
			Str("encoding", in.Encoding).
			Str("media_type", in.Type).
			Uint32("size", in.Size).
			Msgf("Body part decode failed, file saved to: %s", filename)
	}

	// Decode failed: return whatever we got
	return d
}

func (f *Folder) makeBodyPartResp(ctx context.Context, in bodyPartResp) *BodyPartResp {
	log := zerolog.Ctx(ctx).With().
		Str("type", in.Type).
		Str("encoding", in.Encoding).
		Uint32("size", in.Size).
		Logger()

	out := &BodyPartResp{bodyPartResp: in}
	decoded := f.decodePart(ctx, in)

	switch in.Type {
	case "text/html":
		if isFullHTML(decoded) {
			// If full HTML doc, pass as-is
			out.Data = string(decoded)
			log.Debug().Msg("Not converting full HTML document (untrusted)")
		} else {
			// Otherwise sanitize it and flag trusted
			out.Data = string(htmlCleaner.SanitizeBytes(decoded))
			out.Trusted = true
			log.Debug().Msg("Converted HTML -> trusted HTML")
		}
	case "text/plain":
		// Convert any plain text -> HTML via Markdown
		var buf bytes.Buffer
		if err := markdownConverter.Convert(decoded, &buf); err == nil {
			out.Data = buf.String()
			out.Trusted = true
			log.Debug().Msg("Converted plaintext -> trusted markdown")
		} else {
			// Pass as-is, but not trusted so it gets wrapped in an iframe
			out.Data = string(decoded)
			log.Warn().Err(err).Msg("Failed to convert text as mardown -> HTML")
		}
	default:
		// Pass as-is, but not trusted
		out.Data = string(decoded)
		log.Warn().Msg("Unknown type for frontend content, passing as-is")
	}

	return out
}
