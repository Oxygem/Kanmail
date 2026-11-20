package emails

import (
	"bytes"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/oxygem/kanmail/internal/emails/smtpinterface"
	"github.com/oxygem/kanmail/internal/types"
)

func TestSmtpRecipientsIncludesBcc(t *testing.T) {
	options := SendOptions{
		To:  types.Addresses{{Email: "to@example.com"}},
		Cc:  types.Addresses{{Email: "cc@example.com"}, {Email: "to@example.com"}},
		Bcc: types.Addresses{{Email: "bcc@example.com"}},
	}

	assert.Equal(t, []string{"bcc@example.com", "cc@example.com", "to@example.com"}, smtpRecipients(options))
}

func TestSendEmailKeepsBccOutOfSentHeaders(t *testing.T) {
	account, _, ctx := newTestAccount(t)
	account.Settings.SaveSentCopies = true

	sent, err := account.SendEmail(ctx, SendOptions{
		Subject: "Bcc test",
		HTML:    "<p>Hello</p>",
		From:    types.Address{Email: "me@example.com"},
		To:      types.Addresses{{Email: "to@example.com"}},
		Bcc:     types.Addresses{{Name: "Hidden", Email: "bcc@example.com"}},
	})
	require.NoError(t, err)
	assert.Equal(t, []types.Address{{Name: "Hidden", Email: "bcc@example.com"}}, sent.BCC)
	require.NotZero(t, sent.UID, "sent copy should be saved")

	saved, err := account.GetFolder("sent").FetchEmail(ctx, sent.UID)
	require.NoError(t, err)
	require.Len(t, saved.BCC, 1, "saved copy keeps the Bcc header")
	assert.Equal(t, "bcc@example.com", saved.BCC[0].Email)

	var transmitted *smtpinterface.FakeSentMail
	for _, mail := range smtpinterface.FakeSentMails() {
		if bytes.Contains(mail.Data, []byte("Subject: Bcc test")) {
			transmitted = &mail
		}
	}
	require.NotNil(t, transmitted)
	assert.Contains(t, transmitted.To, "bcc@example.com", "Bcc recipients are delivered to")
	assert.False(t, bytes.Contains(transmitted.Data, []byte("bcc@example.com")), "transmitted message never names Bcc recipients")
}
