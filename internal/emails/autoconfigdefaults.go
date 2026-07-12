package emails

import (
	"github.com/oxygem/kanmail/internal/types"
)

// Map of domains to settings handler for applying provider specific defaults that fall outside of
// the regular host/port connection settings ISPDB/autoconfig provides. Applied *before* any auto
// config from ISPDB/DNS.
var domainDefaultSettingHandlers = map[string]func(*types.AccountSettings){
	"gmail.com": func(s *types.AccountSettings) {
		// Label style handling of non-inbox folders
		s.Settings.CopyFromInbox = true
		// Gmail supports 15 max connections
		s.IMAPSettings.Connections = 10
	},
}
