package types

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
}

type Signature struct {
	Name string `json:"name"`
	Text string `json:"text"`
	HTML string `json:"html"`
}

type SystemSettings struct {
	BatchSize    int `json:"batchSize"`
	SyncInterval int `json:"syncInterval"`
	UndoMS       int `json:"undoMS"`

	LoadContactIcons    bool `json:"loadContactIcons"`
	ShareCrashAnalytics bool `json:"shareCrashAnalytics"`

	Theme struct {
		Dark  string `json:"dark"`
		Light string `json:"light"`
	} `json:"theme"`

	ShowHelpButton bool `json:"showHelpButton"`

	// Experimental
	GroupThreadsBySubject    bool `json:"groupThreadsBySubject"`
	GroupSingleSenderThreads bool `json:"groupSingleSenderThreads"`

	// Debugging / license holder specials
	ShowHiddenAttachments bool `json:"showHiddenAttachments"`
}

type Settings struct {
	Accounts       []AccountSettings `json:"accounts"`
	SidebarFolders []FolderName      `json:"sidebarFolders"`
	Signatures     []Signature       `json:"signatures"`
	System         SystemSettings    `json:"system"`

	ColumnGroups       map[string][]FolderName `json:"columnGroups"`
	CurrentColumnGroup string                  `json:"currentColumnGroup"`
	CurrentAccount     string                  `json:"currentAccount"`
}

func NewDefaultSettings() Settings {
	s := Settings{}
	s.ApplyDefaults()

	s.System.LoadContactIcons = true
	s.System.ShareCrashAnalytics = true
	s.System.ShowHelpButton = true

	s.System.Theme.Light = "theme-default"
	s.System.Theme.Dark = "theme-default-dark"

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
}
