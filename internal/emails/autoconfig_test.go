package emails

import (
	"encoding/xml"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/oxygem/kanmail/internal/types"
)

func testDefaults() types.AccountSettings {
	settings := types.AccountSettings{
		Name: "nick@example.com",
		IMAPSettings: types.ConnectionSettings{
			Username: "nick@example.com",
			Host:     "example.com",
			Port:     993,
			SSL:      true,
		},
		SMTPSettings: types.ConnectionSettings{
			Username: "nick@example.com",
			Host:     "example.com",
			Port:     465,
			SSL:      true,
		},
	}
	settings.Settings.CopyFromInbox = true
	return settings
}

func parseAutoconfXML(t *testing.T, doc string) autoconfData {
	t.Helper()
	var data autoconfData
	require.NoError(t, xml.Unmarshal([]byte(doc), &data))
	return data
}

func TestParseAutoconfAppliesServersOverDefaults(t *testing.T) {
	data := parseAutoconfXML(t, `
		<clientConfig version="1.1">
			<emailProvider id="example.com">
				<incomingServer type="imap">
					<hostname>imap.example.com</hostname>
					<port>143</port>
					<socketType>STARTTLS</socketType>
				</incomingServer>
				<outgoingServer type="smtp">
					<hostname>smtp.example.com</hostname>
					<port>587</port>
					<socketType>SSL</socketType>
				</outgoingServer>
			</emailProvider>
		</clientConfig>`)

	settings, err := parseAutoconf(data, testDefaults())
	require.NoError(t, err)

	assert.Equal(t, "imap.example.com", settings.IMAPSettings.Host)
	assert.Equal(t, 143, settings.IMAPSettings.Port)
	assert.False(t, settings.IMAPSettings.SSL)
	assert.True(t, settings.IMAPSettings.StartTLS)

	assert.Equal(t, "smtp.example.com", settings.SMTPSettings.Host)
	assert.Equal(t, 587, settings.SMTPSettings.Port)
	assert.True(t, settings.SMTPSettings.SSL)
	assert.False(t, settings.SMTPSettings.StartTLS)

	// Everything the document doesn't describe comes from the defaults
	assert.Equal(t, types.AccountName("nick@example.com"), settings.Name)
	assert.Equal(t, "nick@example.com", settings.IMAPSettings.Username)
	assert.Equal(t, "nick@example.com", settings.SMTPSettings.Username)
	assert.True(t, settings.Settings.CopyFromInbox)
}

func TestParseAutoconfSkipsUnusableServers(t *testing.T) {
	data := parseAutoconfXML(t, `
		<clientConfig version="1.1">
			<emailProvider id="example.com">
				<incomingServer type="pop3">
					<hostname>pop.example.com</hostname>
					<port>995</port>
					<socketType>SSL</socketType>
				</incomingServer>
				<incomingServer type="imap">
					<hostname></hostname>
					<port>993</port>
					<socketType>SSL</socketType>
				</incomingServer>
				<incomingServer type="imap">
					<hostname>imap.example.com</hostname>
					<port>993</port>
					<socketType>SSL</socketType>
				</incomingServer>
				<outgoingServer type="smtp">
					<hostname>smtp.example.com</hostname>
					<port>587</port>
					<socketType>STARTTLS</socketType>
				</outgoingServer>
			</emailProvider>
		</clientConfig>`)

	settings, err := parseAutoconf(data, testDefaults())
	require.NoError(t, err)
	assert.Equal(t, "imap.example.com", settings.IMAPSettings.Host)
}

func TestParseAutoconfRejectsUnusableDocuments(t *testing.T) {
	for name, doc := range map[string]string{
		"empty": `<clientConfig version="1.1"></clientConfig>`,
		"no servers": `
			<clientConfig version="1.1">
				<emailProvider id="example.com">
					<displayName>Example</displayName>
				</emailProvider>
			</clientConfig>`,
		"imap only": `
			<clientConfig version="1.1">
				<emailProvider id="example.com">
					<incomingServer type="imap">
						<hostname>imap.example.com</hostname>
						<port>993</port>
						<socketType>SSL</socketType>
					</incomingServer>
				</emailProvider>
			</clientConfig>`,
		"missing port": `
			<clientConfig version="1.1">
				<emailProvider id="example.com">
					<incomingServer type="imap">
						<hostname>imap.example.com</hostname>
						<socketType>SSL</socketType>
					</incomingServer>
					<outgoingServer type="smtp">
						<hostname>smtp.example.com</hostname>
						<port>587</port>
						<socketType>SSL</socketType>
					</outgoingServer>
				</emailProvider>
			</clientConfig>`,
		"plaintext": `
			<clientConfig version="1.1">
				<emailProvider id="example.com">
					<incomingServer type="imap">
						<hostname>imap.example.com</hostname>
						<port>143</port>
						<socketType>plain</socketType>
					</incomingServer>
					<outgoingServer type="smtp">
						<hostname>smtp.example.com</hostname>
						<port>25</port>
						<socketType>plain</socketType>
					</outgoingServer>
				</emailProvider>
			</clientConfig>`,
	} {
		t.Run(name, func(t *testing.T) {
			data := parseAutoconfXML(t, doc)

			settings, err := parseAutoconf(data, testDefaults())
			require.Error(t, err)
			assert.Equal(t, testDefaults(), settings)
		})
	}
}
