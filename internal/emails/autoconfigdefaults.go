package emails

import (
	"slices"
	"strings"

	"github.com/oxygem/kanmail/internal/types"
)

// Provider specific defaults that fall outside of the regular host/port connection settings
// ISPDB/autoconfig provides. Matched on the email domain or the IMAP host, so accounts on a
// custom domain (Google Workspace) get them too.
var providerDefaultSettings = []struct {
	domains []string
	apply   func(*types.AccountSettings)
}{
	{
		domains: []string{"gmail.com", "googlemail.com"},
		apply: func(s *types.AccountSettings) {
			// Label style handling of non-inbox folders
			s.Settings.CopyFromInbox = true
			// Gmail supports 15 max connections
			s.IMAPSettings.Connections = 10
		},
	},
}

func applyProviderDefaults(settings *types.AccountSettings, emailDomain string) {
	for _, provider := range providerDefaultSettings {
		if slices.ContainsFunc(provider.domains, func(domain string) bool {
			return isDomainOrSubdomain(emailDomain, domain) ||
				isDomainOrSubdomain(settings.IMAPSettings.Host, domain)
		}) {
			provider.apply(settings)
		}
	}
}

func isDomainOrSubdomain(host, domain string) bool {
	host = strings.ToLower(strings.TrimSuffix(host, "."))
	return host == domain || strings.HasSuffix(host, "."+domain)
}
