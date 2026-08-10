package util

import (
	"errors"
	"slices"
	"testing"
)

func TestParseMailto(t *testing.T) {
	for _, tc := range []struct {
		name string
		url  string
		want Mailto
	}{
		{
			"address only",
			"mailto:nick@fizzadar.com",
			Mailto{To: []string{"nick@fizzadar.com"}},
		},
		{
			"multiple addresses",
			"mailto:one@example.com,two@example.com",
			Mailto{To: []string{"one@example.com", "two@example.com"}},
		},
		{
			"headers",
			"mailto:nick@fizzadar.com?subject=Hello%20there&body=Line%20one%0ALine%20two&cc=cc@example.com",
			Mailto{
				To:      []string{"nick@fizzadar.com"},
				CC:      []string{"cc@example.com"},
				Subject: "Hello there",
				Body:    "Line one\nLine two",
			},
		},
		{
			"plus is a literal plus, not a space",
			"mailto:nick+kanmail@fizzadar.com?subject=one+two",
			Mailto{To: []string{"nick+kanmail@fizzadar.com"}, Subject: "one+two"},
		},
		{
			"to header appends to the path addresses",
			"mailto:one@example.com?to=two@example.com",
			Mailto{To: []string{"one@example.com", "two@example.com"}},
		},
		{
			"duplicate addresses are dropped",
			"mailto:One@example.com?to=one@example.com&cc=cc@example.com&cc=cc@example.com",
			Mailto{To: []string{"One@example.com"}, CC: []string{"cc@example.com"}},
		},
		{
			"bcc is dropped",
			"mailto:nick@fizzadar.com?bcc=secret@example.com",
			Mailto{To: []string{"nick@fizzadar.com"}},
		},
		{
			"encoded comma in a display name isn't an address separator",
			"mailto:%22Doe%2C%20John%22%20%3Cjohn@example.com%3E",
			Mailto{To: []string{`"Doe, John" <john@example.com>`}},
		},
		{
			"uppercase scheme",
			"MAILTO:nick@fizzadar.com",
			Mailto{To: []string{"nick@fizzadar.com"}},
		},
		{
			"empty",
			"mailto:",
			Mailto{},
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got, err := ParseMailto(tc.url)
			if err != nil {
				t.Fatalf("ParseMailto(%q) errored: %v", tc.url, err)
			}
			if !slices.Equal(got.To, tc.want.To) {
				t.Errorf("to = %q, want %q", got.To, tc.want.To)
			}
			if !slices.Equal(got.CC, tc.want.CC) {
				t.Errorf("cc = %q, want %q", got.CC, tc.want.CC)
			}
			if got.Subject != tc.want.Subject {
				t.Errorf("subject = %q, want %q", got.Subject, tc.want.Subject)
			}
			if got.Body != tc.want.Body {
				t.Errorf("body = %q, want %q", got.Body, tc.want.Body)
			}
		})
	}
}

func TestParseMailtoNotMailto(t *testing.T) {
	for _, url := range []string{"https://kanmail.io", "nick@fizzadar.com", ""} {
		if _, err := ParseMailto(url); !errors.Is(err, ErrNotMailto) {
			t.Errorf("ParseMailto(%q) error = %v, want ErrNotMailto", url, err)
		}
	}
}

func TestTextToHTML(t *testing.T) {
	for _, tc := range []struct {
		name string
		text string
		want string
	}{
		{"empty", "", ""},
		{"single line", "hello", "<div>hello</div>"},
		{"escapes markup", "<b> & \"quoted\"", "<div>&lt;b&gt; &amp; &#34;quoted&#34;</div>"},
		{"blank lines", "one\n\ntwo", "<div>one</div><div><br></div><div>two</div>"},
		{"crlf", "one\r\ntwo", "<div>one</div><div>two</div>"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := TextToHTML(tc.text); got != tc.want {
				t.Fatalf("TextToHTML(%q) = %q, want %q", tc.text, got, tc.want)
			}
		})
	}
}
