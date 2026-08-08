package types

type EventName string

const SettingsChangedEvent EventName = "SettingsChangedEvent"
const LicenseChangedEvent EventName = "LicenseChangedEvent"

// SettingsSelectTabEvent tells an already-open settings window to switch tab.
const SettingsSelectTabEvent EventName = "SettingsSelectTabEvent"

// FolderSyncEvent is emitted when a watched (IDLE) folder changes server-side.
// The frontend responds by syncing that account's folder.
const FolderSyncEvent EventName = "FolderSyncEvent"

type FolderSync struct {
	AccountID string `json:"accountID"`
	Folder    string `json:"folder"`
}

const AccountAuthErrorEvent EventName = "AccountAuthErrorEvent"

type AccountAuthError struct {
	AccountID string `json:"accountID"`
	Message   string `json:"message"`
}
