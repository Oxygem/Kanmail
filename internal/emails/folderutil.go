package emails

import (
	"bufio"
	"bytes"
	"context"
	"encoding/base64"
	"errors"
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
		AccountID:       f.AccountID,
		FolderName:      f.Name,
		FolderAliasName: f.AliasName,
		UID:             msg.UID,
		Flags:           msg.Flags,
		Size:            msg.RFC822Size,
	}

	if msg.Envelope != nil {
		email.Date = msg.Envelope.Date
		email.Subject = msg.Envelope.Subject
		email.MessageID = msg.Envelope.MessageID
		email.From = imapAddrsToAddrs(msg.Envelope.From)
		email.To = imapAddrsToAddrs(msg.Envelope.To)
		email.Sender = imapAddrsToAddrs(msg.Envelope.Sender)
		email.CC = imapAddrsToAddrs(msg.Envelope.Cc)
		email.BCC = imapAddrsToAddrs(msg.Envelope.Bcc)
		email.ReplyTo = imapAddrsToAddrs(msg.Envelope.ReplyTo)
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
				refs := strings.Fields(refHeader)
				for _, ref := range refs {
					if strings.HasPrefix(ref, "=?") {
						// Skip RFC2047 "name" parts of the header
						// https://stackoverflow.com/questions/20032959
						continue
					}
					ref = strings.Trim(ref, "<>")
					if ref == "" {
						continue
					}
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
		}
	}

	// For each in-reply-to value append to the references list if it doesn't already exist. This
	// assumes that the in-reply-to values are "later" in the thread. Ultimately the order should
	// not make a significant difference when calculating the thread.
	if msg.Envelope != nil {
		for _, msgid := range slices.Backward(msg.Envelope.InReplyTo) {
			if msgid == "" || slices.Contains(email.References, msgid) {
				continue
			}
			zerolog.Ctx(ctx).Warn().
				Strs("in_reply_to", msg.Envelope.InReplyTo).
				Strs("references", email.References).
				Msg("Found in-reply-to msgid that is not in references")
			email.References = append(email.References, msgid)
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

// Mail base64 is line wrapped, so DecodedLen (which counts the CRLFs the decoder skips) is
// only an upper bound and the output must be trimmed to the bytes actually written. Padding
// is normal here, but some senders omit it, which StdEncoding rejects - hence the raw retry.
func decodeBase64(in []byte) ([]byte, error) {
	d := make([]byte, base64.StdEncoding.DecodedLen(len(in)))
	n, err := base64.StdEncoding.Decode(d, in)
	if err == nil {
		return d[:n], nil
	}

	unpadded := bytes.TrimRight(in, "=\r\n\t ")
	raw := make([]byte, base64.RawStdEncoding.DecodedLen(len(unpadded)))
	if rawN, rawErr := base64.RawStdEncoding.Decode(raw, unpadded); rawErr == nil {
		return raw[:rawN], nil
	}

	// Both failed: return the partial decode from the padded attempt
	return d[:n], err
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
		d, err = decodeBase64(in.Bytes)
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
			// Full HTML doc: strip script vectors but keep untrusted so the
			// frontend renders it in the isolated iframe
			out.Data = string(fullHTMLCleaner.SanitizeBytes(decoded))
			log.Debug().Msg("Sanitized full HTML document (untrusted)")
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
		// Pass as base64, but not trusted
		out.Data = base64.RawStdEncoding.EncodeToString(decoded)
		log.Warn().Msg("Unknown type for frontend content, passing as-is")
	}

	return out
}

var errMailboxMissing = errors.New("mailbox does not exist")

var missingMailboxTexts = []string{
	"doesn't exist",   // Dovecot <2.4, Exchange online
	"does not exist",  // Cyrus, Courier, Dbmail
	"no such mailbox", // UW-IMAP/MailEnable/Apache James
	"unknown mailbox", // Gmail/Yahoo
}

// isMissingMailboxErr reports a "that mailbox isn't there" failure: the
// NONEXISTENT (SELECT, RFC 5530) or TRYCREATE (APPEND/COPY/MOVE, RFC 9051)
// response codes, or a codeless NO whose text matches known server wordings.
// Any other response code is trusted over the text.
func isMissingMailboxErr(err error) bool {
	if errors.Is(err, errMailboxMissing) {
		return true
	}
	var imapErr *imap.Error
	if !errors.As(err, &imapErr) {
		return false
	}
	if imapErr.Code != "" {
		return imapErr.Code == imap.ResponseCodeNonExistent || imapErr.Code == imap.ResponseCodeTryCreate
	}
	if imapErr.Type != imap.StatusResponseTypeNo {
		return false
	}
	text := strings.ToLower(imapErr.Text)
	return slices.ContainsFunc(missingMailboxTexts, func(fragment string) bool {
		return strings.Contains(text, fragment)
	})
}

func selectFolder(
	ctx context.Context,
	conn imapinterface.IMAPClient,
	name types.FolderName,
) (data *imap.SelectData, missing bool, err error) {
	data, err = conn.Select(string(name), nil).Wait()
	if err == nil {
		return data, false, nil
	}
	if isMissingMailboxErr(err) {
		return nil, true, nil
	}
	return nil, false, err
}
