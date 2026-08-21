package types

import (
	"bytes"
	"encoding/json"
	"maps"
	"reflect"
	"slices"
)

// AccountID is the stable identity of an account, generated at creation and
// invariant for its lifetime. AccountName is display-only and need not be unique.
type AccountID string
type AccountName string

type AccountSettings struct {
	ID   AccountID   `json:"id"`
	Name AccountName `json:"name"`

	IMAPSettings ConnectionSettings `json:"imapSettings"`
	SMTPSettings ConnectionSettings `json:"smtpSettings"`

	Settings struct {
		// Discovered when the account is tested; legacy folderPrefix and
		// folderSeparator keys are migrated into it by MigrateSettingsJSON
		Namespaces     Namespaces `json:"namespaces"`
		SaveSentCopies bool       `json:"saveSentCopies"`
		DeleteOnTrash  bool       `json:"deleteOnTrash"`
		CopyFromInbox  bool       `json:"copyFromInbox"`
		AccentColor    string     `json:"accentColor"`

		// nil = never set (so apply default), blank = user intentionally set blank
		Signature *string `json:"signature"`
	} `json:"settings"`

	Folders FolderSettings `json:"folders"`

	Contacts []Address `json:"contacts"`
}

const DefaultSignatureHTML = `<div>--</div><div>Sent via <a href="https://kanmail.io">Kanmail</a></div>`

func (a AccountSettings) NeedsReconnect(b AccountSettings) bool {
	a.Settings.AccentColor, b.Settings.AccentColor = "", ""
	a.Settings.Signature, b.Settings.Signature = nil, nil
	return !reflect.DeepEqual(a, b)
}

type ConnectionSettings struct {
	Username string `json:"username"`
	Host     string `json:"host"`
	Port     int    `json:"port"`

	Password          string `json:"password,omitempty"`
	OAuthProvider     string `json:"oauthProvider,omitempty"`
	OAuthRefreshToken string `json:"oauthRefreshToken,omitempty"`

	// HasCredentials is set on redacted copies sent to the frontend, indicating a
	// secret exists without exposing it. Always false on internal copies.
	HasCredentials bool `json:"hasCredentials,omitempty"`

	// SSL or implicit TLS
	SSL bool `json:"ssl"`
	// Start TLS
	StartTLS bool `json:"startTls"`

	// Total connection pool budget (IMAP: partitioned across
	// regular/priority/background; SMTP: regular pool size). Zero uses the default.
	Connections int `json:"connections,omitempty"`
}

type KeyboardBinding struct {
	Key   string `json:"key"`
	Shift bool   `json:"shift,omitempty"`
	Alt   bool   `json:"alt,omitempty"`
	Meta  bool   `json:"meta,omitempty"`
	Ctrl  bool   `json:"ctrl,omitempty"`
}

type SystemSettings struct {
	BatchSize    int `json:"batchSize"`
	SyncInterval int `json:"syncInterval"`
	UndoMS       int `json:"undoMS"`

	LoadContactIcons bool `json:"loadContactIcons"`
	ShareAnalytics   bool `json:"shareAnalytics"`

	Theme struct {
		Dark  string `json:"dark"`
		Light string `json:"light"`

		// Both used by frontend only
		PerSenderThreadBackgrounds  bool `json:"perSenderThreadBackgrounds,omitzero"`
		AlwaysShowThreadBackgrounds bool `json:"alwaysShowThreadBackgrounds,omitzero"`
	} `json:"theme"`

	ShowHelpButton bool `json:"showHelpButton"`

	// Show the app-generated welcome email pinned at the top of the inbox, set
	// when onboarding completes and cleared when the user dismisses it
	ShowWelcomeEmail bool `json:"showWelcomeEmail"`

	// Whether the sync status list (bottom of the sidebar footer) is expanded
	StatusBarOpen bool `json:"statusBarOpen"`

	// UI zoom factor (1.0 = 100%). Applied client-side via CSS zoom on the
	// document root so the whole interface, including rendered email, scales.
	Zoom float64 `json:"zoom"`

	// Experimental
	GroupThreadsBySubject    bool `json:"groupThreadsBySubject"`
	GroupSingleSenderThreads bool `json:"groupSingleSenderThreads"`
	DisableRemoteSearch      bool `json:"disableRemoteSearch"`

	// Debugging / license holder specials
	ShowHiddenAttachments bool `json:"showHiddenAttachments"`

	// Thread colors (global, applies across all accounts)
	SenderColors map[string]string `json:"senderColors"`

	// Per-shortcut binding overrides (shortcut id → list of bindings).
	// Missing entries fall back to the frontend's registered defaults.
	KeyboardShortcuts map[string][]KeyboardBinding `json:"keyboardShortcuts,omitempty"`
}

type ColumnGroup struct {
	Name    string       `json:"name"`
	Columns []FolderName `json:"columns"`
}

type Settings struct {
	Accounts       []AccountSettings `json:"accounts"`
	SidebarFolders []FolderName      `json:"sidebarFolders"`
	System         SystemSettings    `json:"system"`

	ColumnGroups            []ColumnGroup `json:"columnGroups"`
	CurrentColumnGroupIndex int           `json:"currentColumnGroupIndex"`
	// CurrentAccount holds an AccountID ("" = all accounts)
	CurrentAccount string `json:"currentAccount"`
}

func NewDefaultSettings() Settings {
	s := Settings{}
	s.ApplyDefaults()

	s.System.LoadContactIcons = true
	s.System.ShareAnalytics = true
	s.System.ShowHelpButton = true

	s.System.Theme.Light = "theme-default-light"
	s.System.Theme.Dark = "theme-default-dark"

	// Default enable per-sender thread backgrounds (on hover only)
	s.System.Theme.PerSenderThreadBackgrounds = true

	s.System.UndoMS = 10000

	return s
}

func (s *Settings) ApplyDefaults() {
	if s.System.BatchSize == 0 {
		s.System.BatchSize = 25
	}
	if s.System.SyncInterval == 0 {
		s.System.SyncInterval = 30000
	}

	if len(s.ColumnGroups) == 0 {
		s.ColumnGroups = []ColumnGroup{{Name: "Default", Columns: []FolderName{"inbox"}}}
	}
	if s.CurrentColumnGroupIndex < 0 || s.CurrentColumnGroupIndex >= len(s.ColumnGroups) {
		s.CurrentColumnGroupIndex = 0
	}
	if s.System.Zoom == 0 {
		s.System.Zoom = 1.0
	}

	for i := range s.Accounts {
		if s.Accounts[i].Settings.Signature == nil {
			sig := DefaultSignatureHTML
			s.Accounts[i].Settings.Signature = &sig
		}
	}
}

// MigrateSettingsJSON upgrades a legacy settings file in place, before it is
// decoded: columnGroups from a name -> columns map to an ordered list, and
// each account's folderPrefix/folderSeparator into namespaces. Returns the
// rewritten JSON and whether a migration was performed.
func MigrateSettingsJSON(b []byte) ([]byte, bool, error) {
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(b, &raw); err != nil {
		return b, false, err
	}

	migratedGroups, err := migrateColumnGroups(raw)
	if err != nil {
		return b, false, err
	}
	migratedNamespaces, err := migrateAccountNamespaces(raw)
	if err != nil {
		return b, false, err
	}
	if !migratedGroups && !migratedNamespaces {
		return b, false, nil
	}

	out, err := json.Marshal(raw)
	if err != nil {
		return b, false, err
	}
	return out, true, nil
}

// migrateColumnGroups rewrites columnGroups from a name -> columns map (with ""
// as the default group) and currentColumnGroup from a name to an index.
func migrateColumnGroups(raw map[string]json.RawMessage) (bool, error) {
	groupsRaw := bytes.TrimSpace(raw["columnGroups"])
	if len(groupsRaw) == 0 || groupsRaw[0] != '{' {
		return false, nil
	}

	var oldGroups map[string][]FolderName
	if err := json.Unmarshal(groupsRaw, &oldGroups); err != nil {
		return false, err
	}

	// Go always marshalled the map with sorted keys, so sorted order is the
	// order the file already had. "" sorts first, so the old default group
	// lands at index 0 as "Default".
	names := slices.Sorted(maps.Keys(oldGroups))

	newGroups := make([]ColumnGroup, 0, len(names))
	for _, name := range names {
		outName := name
		if outName == "" {
			outName = "Default"
		}
		newGroups = append(newGroups, ColumnGroup{Name: outName, Columns: oldGroups[name]})
	}

	currentIndex := 0
	if currentRaw, ok := raw["currentColumnGroup"]; ok {
		var currentName string
		if err := json.Unmarshal(currentRaw, &currentName); err == nil {
			if i := slices.Index(names, currentName); i >= 0 {
				currentIndex = i
			}
		}
	}
	delete(raw, "currentColumnGroup")

	var err error
	if raw["columnGroups"], err = json.Marshal(newGroups); err != nil {
		return false, err
	}
	if raw["currentColumnGroupIndex"], err = json.Marshal(currentIndex); err != nil {
		return false, err
	}
	return true, nil
}

// migrateAccountNamespaces turns each account's folderPrefix and
// folderSeparator into its personal namespace, so an account working today
// keeps its delimiter (and so its nested folder listing) without being
// re-tested. A NUL separator was only ever stored for servers reporting NIL.
// Accounts that already have namespaces are left alone.
func migrateAccountNamespaces(raw map[string]json.RawMessage) (bool, error) {
	accountsRaw := bytes.TrimSpace(raw["accounts"])
	if len(accountsRaw) == 0 || accountsRaw[0] != '[' {
		return false, nil
	}
	var accounts []map[string]json.RawMessage
	if err := json.Unmarshal(accountsRaw, &accounts); err != nil {
		return false, err
	}

	var migrated bool
	for _, account := range accounts {
		settingsRaw := bytes.TrimSpace(account["settings"])
		if len(settingsRaw) == 0 || settingsRaw[0] != '{' {
			continue
		}
		var settings map[string]json.RawMessage
		if err := json.Unmarshal(settingsRaw, &settings); err != nil {
			return false, err
		}
		if _, ok := settings["namespaces"]; ok {
			continue
		}
		prefixRaw, hasPrefix := settings["folderPrefix"]
		separatorRaw, hasSeparator := settings["folderSeparator"]
		if !hasPrefix && !hasSeparator {
			continue
		}

		var namespace Namespace
		if hasPrefix {
			if err := json.Unmarshal(prefixRaw, &namespace.Prefix); err != nil {
				return false, err
			}
		}
		if hasSeparator {
			if err := json.Unmarshal(separatorRaw, &namespace.Delim); err != nil {
				return false, err
			}
		}
		if namespace.Delim == "\x00" {
			namespace.Delim = ""
		}

		var err error
		if settings["namespaces"], err = json.Marshal(Namespaces{Personal: []Namespace{namespace}}); err != nil {
			return false, err
		}
		delete(settings, "folderPrefix")
		delete(settings, "folderSeparator")
		if account["settings"], err = json.Marshal(settings); err != nil {
			return false, err
		}
		migrated = true
	}

	if !migrated {
		return false, nil
	}
	var err error
	if raw["accounts"], err = json.Marshal(accounts); err != nil {
		return false, err
	}
	return true, nil
}
