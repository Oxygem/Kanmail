package emails

import (
	"math"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/emersion/go-imap/v2"
)

// queryToken is a single term of a search query: either plain text (key is
// empty) or a key:value operator. raw preserves the original token text
// (minus any leading '-') so unrecognised operators can degrade to a plain
// text search.
type queryToken struct {
	negated bool
	key     string
	value   string
	raw     string
}

func tokenizeSearchQuery(query string) []queryToken {
	var tokens []queryToken
	i := 0

	skipSpace := func() {
		for i < len(query) {
			r, size := utf8.DecodeRuneInString(query[i:])
			if !unicode.IsSpace(r) {
				break
			}
			i += size
		}
	}

	// Assumes query[i] == '"'; reads to the closing quote, or the end of the
	// query if unterminated
	readQuoted := func() string {
		i++
		start := i
		for i < len(query) && query[i] != '"' {
			i++
		}
		value := query[start:i]
		if i < len(query) {
			i++
		}
		return value
	}

	readUntil := func(stop func(rune) bool) string {
		start := i
		for i < len(query) {
			r, size := utf8.DecodeRuneInString(query[i:])
			if stop(r) {
				break
			}
			i += size
		}
		return query[start:i]
	}

	isWordEnd := func(r rune) bool {
		return unicode.IsSpace(r) || r == '"' || r == ':'
	}
	isTermEnd := func(r rune) bool {
		return unicode.IsSpace(r) || r == '"'
	}

	for {
		skipSpace()
		if i >= len(query) {
			break
		}

		tok := queryToken{}

		if query[i] == '-' && i+1 < len(query) {
			if r, _ := utf8.DecodeRuneInString(query[i+1:]); !unicode.IsSpace(r) {
				tok.negated = true
				i++
			}
		}

		rawStart := i

		if query[i] == '"' {
			phrase := readQuoted()
			if phrase == "" {
				continue
			}
			tok.value = phrase
			tok.raw = phrase
			tokens = append(tokens, tok)
			continue
		}

		word := readUntil(isWordEnd)

		if word != "" && i < len(query) && query[i] == ':' {
			i++
			tok.key = strings.ToLower(word)
			if i < len(query) && query[i] == '"' {
				tok.value = readQuoted()
			} else {
				tok.value = readUntil(isTermEnd)
			}
			tok.raw = query[rawStart:i]
		} else if word == "" {
			// Stray leading ':' - consume the rest as plain text
			text := readUntil(isTermEnd)
			tok.value = text
			tok.raw = text
		} else {
			tok.value = word
			tok.raw = word
		}

		tokens = append(tokens, tok)
	}

	return tokens
}

var searchHeaderKeys = map[string]string{
	"from":    "From",
	"to":      "To",
	"cc":      "Cc",
	"bcc":     "Bcc",
	"subject": "Subject",
}

// tokenCriteria maps a single token to IMAP search criteria. ok=false means
// the token couldn't be interpreted (unknown operator or malformed value) and
// should degrade to a plain text term.
func tokenCriteria(tok queryToken, now time.Time) (imap.SearchCriteria, bool) {
	if tok.key == "" {
		return imap.SearchCriteria{Text: []string{tok.value}}, true
	}

	if headerKey, isHeader := searchHeaderKeys[tok.key]; isHeader {
		if tok.value == "" {
			return imap.SearchCriteria{}, false
		}
		return imap.SearchCriteria{
			Header: []imap.SearchCriteriaHeaderField{{Key: headerKey, Value: tok.value}},
		}, true
	}

	switch tok.key {
	case "is":
		switch strings.ToLower(tok.value) {
		case "read", "seen":
			return imap.SearchCriteria{Flag: []imap.Flag{imap.FlagSeen}}, true
		case "unread":
			return imap.SearchCriteria{NotFlag: []imap.Flag{imap.FlagSeen}}, true
		case "starred", "flagged":
			return imap.SearchCriteria{Flag: []imap.Flag{imap.FlagFlagged}}, true
		case "unstarred", "unflagged":
			return imap.SearchCriteria{NotFlag: []imap.Flag{imap.FlagFlagged}}, true
		}

	case "has":
		if strings.ToLower(tok.value) == "attachment" {
			// IMAP has no attachment search key; matching the multipart/mixed
			// content type catches most attachments (Gmail servers get exact
			// behaviour via X-GM-RAW)
			return imap.SearchCriteria{
				Header: []imap.SearchCriteriaHeaderField{{Key: "Content-Type", Value: "multipart/mixed"}},
			}, true
		}

	case "before":
		if date, ok := parseSearchDate(tok.value); ok {
			return imap.SearchCriteria{Before: date}, true
		}

	case "after":
		if date, ok := parseSearchDate(tok.value); ok {
			return imap.SearchCriteria{Since: date}, true
		}

	case "older_than":
		if date, ok := parseRelativeAge(tok.value, now); ok {
			return imap.SearchCriteria{Before: date}, true
		}

	case "newer_than":
		if date, ok := parseRelativeAge(tok.value, now); ok {
			return imap.SearchCriteria{Since: date}, true
		}

	case "larger", "size":
		if size, ok := parseSearchSize(tok.value); ok {
			return imap.SearchCriteria{Larger: size}, true
		}

	case "smaller":
		if size, ok := parseSearchSize(tok.value); ok {
			return imap.SearchCriteria{Smaller: size}, true
		}
	}

	return imap.SearchCriteria{}, false
}

var searchDateLayouts = []string{"2006/1/2", "2006-1-2"}

func parseSearchDate(value string) (time.Time, bool) {
	for _, layout := range searchDateLayouts {
		if date, err := time.Parse(layout, value); err == nil {
			return date, true
		}
	}
	return time.Time{}, false
}

var relativeAgeRegex = regexp.MustCompile(`^(\d+)([dmy])$`)

func parseRelativeAge(value string, now time.Time) (time.Time, bool) {
	match := relativeAgeRegex.FindStringSubmatch(strings.ToLower(value))
	if match == nil {
		return time.Time{}, false
	}

	n, err := strconv.Atoi(match[1])
	if err != nil {
		return time.Time{}, false
	}

	var date time.Time
	switch match[2] {
	case "d":
		date = now.AddDate(0, 0, -n)
	case "m":
		date = now.AddDate(0, -n, 0)
	case "y":
		date = now.AddDate(-n, 0, 0)
	}

	year, month, day := date.Date()
	return time.Date(year, month, day, 0, 0, 0, 0, date.Location()), true
}

var searchSizeRegex = regexp.MustCompile(`^(\d+)(kb?|mb?|gb?)?$`)

func parseSearchSize(value string) (int64, bool) {
	match := searchSizeRegex.FindStringSubmatch(strings.ToLower(value))
	if match == nil {
		return 0, false
	}

	n, err := strconv.ParseInt(match[1], 10, 64)
	if err != nil {
		return 0, false
	}

	var mult int64 = 1
	switch {
	case strings.HasPrefix(match[2], "k"):
		mult = 1024
	case strings.HasPrefix(match[2], "m"):
		mult = 1024 * 1024
	case strings.HasPrefix(match[2], "g"):
		mult = 1024 * 1024 * 1024
	}

	if n > math.MaxInt64/mult {
		return 0, false
	}
	return n * mult, true
}

// parseSearchQuery converts a Gmail-style search query into standard IMAP
// search criteria for servers without X-GM-EXT-1. Tokens are ANDed together;
// unrecognised or malformed operators degrade to plain text terms, so every
// query produces usable criteria. OR and parenthesised grouping are not
// supported (yet).
func parseSearchQuery(query string, now time.Time) *imap.SearchCriteria {
	tokens := tokenizeSearchQuery(query)
	if len(tokens) == 0 {
		return &imap.SearchCriteria{Text: []string{query}}
	}

	criteria := &imap.SearchCriteria{}
	for _, tok := range tokens {
		tokCriteria, ok := tokenCriteria(tok, now)
		if !ok {
			tokCriteria = imap.SearchCriteria{Text: []string{tok.raw}}
		}
		if tok.negated {
			criteria.And(&imap.SearchCriteria{Not: []imap.SearchCriteria{tokCriteria}})
		} else {
			criteria.And(&tokCriteria)
		}
	}
	return criteria
}
