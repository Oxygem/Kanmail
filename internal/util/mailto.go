package util

import (
	"errors"
	"html"
	"net/url"
	"strings"
)

type Mailto struct {
	To      []string
	CC      []string
	Subject string
	Body    string
}

var ErrNotMailto = errors.New("not a mailto link")

const mailtoPrefix = "mailto:"

// Parses a mailto: link (RFC 6068) into the fields the send window takes. Note
// that "+" is a literal plus here rather than a space, so none of this can go
// through url.ParseQuery - addresses like "foo+tag@bar.com" are common.
func ParseMailto(rawURL string) (Mailto, error) {
	trimmed := strings.TrimSpace(rawURL)
	if !strings.HasPrefix(strings.ToLower(trimmed), mailtoPrefix) {
		return Mailto{}, ErrNotMailto
	}

	path, query, _ := strings.Cut(trimmed[len(mailtoPrefix):], "?")

	mailto := Mailto{To: parseMailtoAddresses(path)}

	for _, pair := range strings.Split(query, "&") {
		name, value, ok := strings.Cut(pair, "=")
		if !ok {
			continue
		}

		switch strings.ToLower(strings.TrimSpace(unescapeMailto(name))) {
		case "to":
			mailto.To = append(mailto.To, parseMailtoAddresses(value)...)
		case "cc":
			mailto.CC = append(mailto.CC, parseMailtoAddresses(value)...)
		case "subject":
			mailto.Subject = unescapeMailto(value)
		case "body":
			mailto.Body = unescapeMailto(value)
			// bcc is dropped - sending has no bcc support, and folding those
			// addresses into cc would expose them to every other recipient
		}
	}

	mailto.To = dedupeAddresses(mailto.To)
	mailto.CC = dedupeAddresses(mailto.CC)
	return mailto, nil
}

// PathUnescape rather than QueryUnescape, which would turn every "+" into a space
func unescapeMailto(value string) string {
	unescaped, err := url.PathUnescape(value)
	if err != nil {
		// Malformed percent escapes shouldn't lose the rest of the link
		return value
	}
	return unescaped
}

// Split before unescaping, so an encoded comma inside a display name doesn't
// get treated as an address separator
func parseMailtoAddresses(value string) []string {
	addresses := make([]string, 0, 1)
	for _, part := range strings.Split(value, ",") {
		if address := strings.TrimSpace(unescapeMailto(part)); address != "" {
			addresses = append(addresses, address)
		}
	}
	return addresses
}

func dedupeAddresses(addresses []string) []string {
	seen := make(map[string]struct{}, len(addresses))
	deduped := addresses[:0]
	for _, address := range addresses {
		key := strings.ToLower(address)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		deduped = append(deduped, address)
	}
	return deduped
}

// The mailto body is plain text, the composer is an HTML editor
func TextToHTML(text string) string {
	if text == "" {
		return ""
	}

	normalized := strings.ReplaceAll(strings.ReplaceAll(text, "\r\n", "\n"), "\r", "\n")

	var b strings.Builder
	for _, line := range strings.Split(normalized, "\n") {
		b.WriteString("<div>")
		if line == "" {
			// Squire collapses an otherwise empty block
			b.WriteString("<br>")
		} else {
			b.WriteString(html.EscapeString(line))
		}
		b.WriteString("</div>")
	}
	return b.String()
}
