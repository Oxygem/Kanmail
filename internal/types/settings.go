package types

import (
	"bytes"
	"encoding/json"
	"maps"
	"slices"
)

type AccountName string
type FolderName string

type FolderSettings struct {
	Inbox     FolderName `json:"inbox"`
	Flagged   FolderName `json:"flagged"`   // starred in gmail
	Important FolderName `json:"important"` // RFC 8457
	Sent      FolderName `json:"sent"`
	Drafts    FolderName `json:"drafts"`
	Archive   FolderName `json:"archive"`
	Trash     FolderName `json:"trash"`
	Junk      FolderName `json:"junk"`
}

func (f FolderSettings) GetFromName(name FolderName) FolderName {
	switch name {
	case "inbox":
		return f.Inbox
	case "flagged":
		return f.Flagged
	case "important":
		return f.Important
	case "sent":
		return f.Sent
	case "drafts":
		return f.Drafts
	case "archive":
		return f.Archive
	case "trash":
		return f.Trash
	case "junk":
		return f.Junk
	default:
		return ""
	}
}

type AccountSettings struct {
	Name AccountName `json:"name"`

	IMAPSettings ConnectionSettings `json:"imapSettings"`
	SMTPSettings ConnectionSettings `json:"smtpSettings"`

	Settings struct {
		FolderPrefix    string `json:"folderPrefix"`
		FolderSeparator string `json:"folderSeparator"`
		SaveSentCopies  bool   `json:"saveSentCopies"`
		DeleteOnTrash   bool   `json:"deleteOnTrash"`
		CopyFromInbox   bool   `json:"copyFromInbox"`
		AccentColor     string `json:"accentColor"`
	} `json:"settings"`

	Folders FolderSettings `json:"folders"`

	Contacts []Address `json:"contacts"`
}

type ConnectionSettings struct {
	Username string `json:"username"`
	Host     string `json:"host"`
	Port     int    `json:"port"`

	Password          string `json:"password,omitempty"`
	OAuthProvider     string `json:"oauthProvider,omitempty"`
	OAuthRefreshToken string `json:"oauthRefreshToken,omitempty"`

	// SSL or implicit TLS
	SSL bool `json:"ssl"`
	// Start TLS
	StartTLS bool `json:"startTls"`

	// Total connection pool budget (IMAP: partitioned across
	// regular/priority/background; SMTP: regular pool size). Zero uses the default.
	Connections int `json:"connections,omitempty"`
}

type Signature struct {
	Name string `json:"name"`
	Text string `json:"text"`
	HTML string `json:"html"`
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

	// Experimental
	GroupThreadsBySubject    bool `json:"groupThreadsBySubject"`
	GroupSingleSenderThreads bool `json:"groupSingleSenderThreads"`

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
	Signatures     []Signature       `json:"signatures"`
	System         SystemSettings    `json:"system"`

	ColumnGroups            []ColumnGroup `json:"columnGroups"`
	CurrentColumnGroupIndex int           `json:"currentColumnGroupIndex"`
	CurrentAccount          string        `json:"currentAccount"`
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
}

// MigrateSettingsJSON upgrades a legacy settings file where columnGroups was a
// name -> columns map (with "" as the default group) and currentColumnGroup was
// a name. Returns the rewritten JSON and whether a migration was performed.
func MigrateSettingsJSON(b []byte) ([]byte, bool, error) {
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(b, &raw); err != nil {
		return b, false, err
	}

	groupsRaw := bytes.TrimSpace(raw["columnGroups"])
	if len(groupsRaw) == 0 || groupsRaw[0] != '{' {
		return b, false, nil
	}

	var oldGroups map[string][]FolderName
	if err := json.Unmarshal(groupsRaw, &oldGroups); err != nil {
		return b, false, err
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
		return b, false, err
	}
	if raw["currentColumnGroupIndex"], err = json.Marshal(currentIndex); err != nil {
		return b, false, err
	}

	out, err := json.Marshal(raw)
	if err != nil {
		return b, false, err
	}
	return out, true, nil
}
