package types

type EventName string

const SettingsChangedEvent EventName = "SettingsChangedEvent"
const LicenseChangedEvent EventName = "LicenseChangedEvent"

// FolderSyncEvent is emitted when a watched (IDLE) folder changes server-side.
// The frontend responds by syncing that account's folder.
const FolderSyncEvent EventName = "FolderSyncEvent"

type FolderSync struct {
	Account string `json:"account"`
	Folder  string `json:"folder"`
}
