package services

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"maps"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/emersion/go-imap/v2"
	"github.com/google/uuid"
	"github.com/rs/zerolog"
	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/zalando/go-keyring"

	"github.com/oxygem/kanmail/internal/backend"
	"github.com/oxygem/kanmail/internal/caches"
	"github.com/oxygem/kanmail/internal/constants"
	"github.com/oxygem/kanmail/internal/emails"
	"github.com/oxygem/kanmail/internal/types"
	"github.com/oxygem/kanmail/internal/util"
)

// 24h timeout to re-checking license
const licenseCheckTimeout = 24 * time.Hour

// 7 days timeout on checking licenses as show in UI
const licenseCheckCachedTimeout = 7 * 24 * time.Hour

// Cap how long shutdown waits on the exit analytics event
const appExitTrackTimeout = 5 * time.Second

type AppService struct {
	log              zerolog.Logger
	lock             sync.Mutex
	app              *application.App
	caches           *caches.Caches
	cacheDir         string
	keyring          *util.CachedKeyring
	analyticsEnabled bool
	startedAt        time.Time

	mainWindow     *application.WebviewWindow
	settingsWindow *application.WebviewWindow
	metaWindow     *application.WebviewWindow

	accountsNeedingReauth map[types.AccountID]string

	sendWindowPayloads     map[string]OpenSendWindowOptions
	sendWindowPayloadsLock sync.Mutex

	// Track files we're allowed to open (log file, downloaded attachments)
	openableFiles     map[string]struct{}
	openableFilesLock sync.Mutex

	AppVersion int
	DeviceID   string
}

func NewAppService(log zerolog.Logger, version int, keyring *util.CachedKeyring) *AppService {
	if version > 0 {
		backend.SetAppVersion(fmt.Sprintf("2.%d", version))
	}
	return &AppService{
		log:                   log.With().Str("component", "app").Logger(),
		keyring:               keyring,
		accountsNeedingReauth: map[types.AccountID]string{},
		sendWindowPayloads:    map[string]OpenSendWindowOptions{},
		AppVersion:            version,
		openableFiles:         map[string]struct{}{},
		startedAt:             time.Now(),

		// Default true, matching settings defaults
		analyticsEnabled: true,
	}
}

func (a *AppService) Bootstrap(app *application.App, caches *caches.Caches, cacheDir string) {
	a.app = app
	a.caches = caches
	a.cacheDir = cacheDir
}

func (a *AppService) SetMainWindow(window *application.WebviewWindow) {
	a.mainWindow = window
}

// ResizeWindow resizes + re-centers the main window, used after onboarding
func (a *AppService) ResizeWindow(ctx context.Context, width, height int) {
	if a.mainWindow == nil {
		return
	}
	a.mainWindow.SetSize(width, height)
	a.mainWindow.Center()
}

func (a *AppService) SetAnalyticsEnabled(enabled bool) {
	if a.analyticsEnabled == enabled {
		return
	}
	a.analyticsEnabled = enabled
	util.SetAnalyticsEnabled(enabled)
}

func (a *AppService) SetDeviceID(dirname string) {
	a.DeviceID = ensureDeviceIDFile(a.log, path.Join(dirname, "device-id"))
	util.SetDeviceID(a.DeviceID)
}

// FIXME: Exists only so the types.EventName type is exported to JS
func (a *AppService) GetEventNames() []types.EventName {
	return []types.EventName{}
}

func (a *AppService) OpenLink(ctx context.Context, url string) error {
	return util.OpenInBrowser(url)
}

func (a *AppService) allowOpenFile(filename string) {
	if filename == "" {
		return
	}

	abs, err := filepath.Abs(filename)
	if err != nil {
		a.log.Err(err).Str("file", filename).Msg("Failed to resolve openable file path")
		return
	}

	a.openableFilesLock.Lock()
	defer a.openableFilesLock.Unlock()
	a.openableFiles[abs] = struct{}{}
}

func (a *AppService) OpenFile(ctx context.Context, filename string) error {
	abs, err := filepath.Abs(filename)
	if err != nil {
		return fmt.Errorf("invalid file path: %w", err)
	}

	a.openableFilesLock.Lock()
	_, allowed := a.openableFiles[abs]
	a.openableFilesLock.Unlock()

	if !allowed {
		return fmt.Errorf("refusing to open file not written by Kanmail: %s", filename)
	}

	return util.OpenFile(abs)
}

func (a *AppService) GetCacheStats(ctx context.Context) (types.CacheStats, error) {
	return a.caches.GetStats(ctx)
}

func (a *AppService) GetExecutable() (string, error) {
	return os.Executable()
}

func (a *AppService) ClearCacheAndRestart(ctx context.Context) {
	if err := a.caches.CloseAndDelete(); err != nil {
		zerolog.Ctx(ctx).Err(err).Msg("Failed to close and delete caches database")
	}
	a.RestartApp()
}

type OpenSendWindowOptions struct {
	Mode       string           `json:"mode,omitempty"`
	AccountID  types.AccountID  `json:"accountID,omitempty"`
	FolderName types.FolderName `json:"folderName,omitempty"`
	UID        imap.UID         `json:"uid,omitempty"`

	// Prefilled fields for a new (non-reply) message
	To      []string `json:"to,omitempty"`
	Subject string   `json:"subject,omitempty"`
	Body    string   `json:"body,omitempty"`

	// Attachments already prepared on disk, carried over when popping a quick
	// reply out into the full editor. Non-nil (even empty) means "use exactly
	// these" — the send window then skips re-collecting forwarded parts.
	Attachments []emails.SendAttachment `json:"attachments,omitempty"`
}

func (a *AppService) OpenSendWindow(ctx context.Context, options OpenSendWindowOptions) {
	ctx = a.log.WithContext(ctx)
	defer util.LogAndPanic(ctx)

	a.lock.Lock()
	defer a.lock.Unlock()

	token := uuid.NewString()
	a.sendWindowPayloadsLock.Lock()
	a.sendWindowPayloads[token] = options
	a.sendWindowPayloadsLock.Unlock()

	v := url.Values{}
	v.Set("payload", token)

	util.MakeWindow(ctx, a.app, util.WindowOptions{
		Title:   "Kanmail v2 Send",
		AppName: "send",
		Compact: true,
		Values:  v,
	})
}

func (a *AppService) GetSendWindowPayload(ctx context.Context, token string) (*OpenSendWindowOptions, error) {
	a.sendWindowPayloadsLock.Lock()
	defer a.sendWindowPayloadsLock.Unlock()

	options, ok := a.sendWindowPayloads[token]
	if !ok {
		return nil, fmt.Errorf("no send window payload for token")
	}
	return &options, nil
}

func (a *AppService) OpenMetaWindow(ctx context.Context) {
	ctx = a.log.WithContext(ctx)
	defer util.LogAndPanic(ctx)

	a.lock.Lock()
	defer a.lock.Unlock()

	if a.metaWindow != nil {
		screen, err := a.metaWindow.GetScreen()
		if err != nil {
			panic(fmt.Errorf("failed to get window screeen: %w", err))
		} else if screen == nil {
			a.log.Warn().Msg("Meta window has been destroted, re-creating")
			a.metaWindow = nil
		} else {
			a.metaWindow.Show()
			a.metaWindow.Focus()
			return
		}
	}

	a.metaWindow = util.MakeWindow(ctx, a.app, util.WindowOptions{
		Title:   "Kanmail v2 Meta",
		AppName: "meta",
		Compact: true,
	})
}

type OpenDebugWindowOptions struct {
	AccountID  types.AccountID  `json:"accountID,omitempty"`
	FolderName types.FolderName `json:"folderName,omitempty"`
	UID        imap.UID         `json:"uid,omitempty"`
}

func (a *AppService) OpenDebugWindow(ctx context.Context, options OpenDebugWindowOptions) {
	v := make(url.Values, 5)

	if options.AccountID != "" {
		v["accountID"] = []string{string(options.AccountID)}
	}
	if options.FolderName != "" {
		v["folderName"] = []string{string(options.FolderName)}
	}
	if options.UID > 0 {
		v["uid"] = []string{strconv.Itoa(int(options.UID))}
	}

	util.MakeWindow(ctx, a.app, util.WindowOptions{
		Title:   "Kanmail v2 Debugger",
		AppName: "debug",
		Compact: true,
		Values:  v,
	})
}

// OpenSettingsWindow opens (or focuses) the settings window, optionally
// switching it to the given tab.
func (a *AppService) OpenSettingsWindow(ctx context.Context, tab string) {
	ctx = a.log.WithContext(ctx)
	defer util.LogAndPanic(ctx)

	a.lock.Lock()
	defer a.lock.Unlock()

	if a.settingsWindow != nil {
		screen, err := a.settingsWindow.GetScreen()
		if err != nil {
			panic(fmt.Errorf("failed to get window screeen: %w", err))
		} else if screen == nil {
			a.log.Warn().Msg("Settings window has been destroted, re-creating")
			a.settingsWindow = nil
		} else {
			a.settingsWindow.Show()
			a.settingsWindow.Focus()
			if tab != "" {
				a.app.Event.Emit(string(types.SettingsSelectTabEvent), tab)
			}
			return
		}
	}

	v := url.Values{}
	if tab != "" {
		v.Set("tab", tab)
	}

	a.settingsWindow = util.MakeWindow(ctx, a.app, util.WindowOptions{
		Title:   "Kanmail v2 Settings",
		AppName: "settings",
		Compact: true,
		Values:  v,
	})
}

func (a *AppService) SendSettingsChangedEvent(ctx context.Context, settings types.Settings) {
	a.lock.Lock()
	defer a.lock.Unlock()

	if a.app == nil {
		return
	}
	a.app.Event.Emit(string(types.SettingsChangedEvent), settings)
}

// EmitFolderSync tells the frontend a watched folder changed server-side so it
// syncs that account's folder.
func (a *AppService) EmitFolderSync(account types.AccountID, folder types.FolderName) {
	a.lock.Lock()
	defer a.lock.Unlock()

	a.mainWindow.DispatchWailsEvent(&application.CustomEvent{
		Name: string(types.FolderSyncEvent),
		Data: types.FolderSync{
			AccountID: string(account),
			Folder:    string(folder),
		},
	})
}

// EmitAccountAuthError records that an account's credentials were rejected
// outright and tells every window, so they can prompt the user to reconnect it.
func (a *AppService) EmitAccountAuthError(account types.AccountID, message string) {
	a.lock.Lock()
	defer a.lock.Unlock()

	if _, known := a.accountsNeedingReauth[account]; known {
		return
	}
	a.accountsNeedingReauth[account] = message

	if a.app == nil {
		return
	}
	a.app.Event.Emit(string(types.AccountAuthErrorEvent), types.AccountAuthError{
		AccountID: string(account),
		Message:   message,
	})
}

// GetAccountAuthErrors returns the accounts currently needing a reconnect,
// mapped to why. Windows call this on load to catch up on events that fired
// before they existed.
func (a *AppService) GetAccountAuthErrors() map[types.AccountID]string {
	a.lock.Lock()
	defer a.lock.Unlock()

	return maps.Clone(a.accountsNeedingReauth)
}

// clearAccountAuthErrors forgets every reconnect prompt on settings changes
func (a *AppService) clearAccountAuthErrors() {
	a.lock.Lock()
	defer a.lock.Unlock()

	clear(a.accountsNeedingReauth)
}

func (a *AppService) OpenSaveFileDialog(part types.BodyPart) (string, error) {
	dialog := application.Get().Dialog.SaveFile()
	// The description is the attacker-controlled MIME filename - never hand it
	// to the native dialog with path components or control characters intact
	dialog.SetFilename(util.SanitizeFilename(part.Description))

	if home, err := os.UserHomeDir(); err == nil {
		dialog.SetDirectory(filepath.Join(home, "Downloads"))
	}

	return dialog.PromptForSingleSelection()
}

func (a *AppService) OpenOpenFilesDialog() ([]string, error) {
	dialog := application.Get().Dialog.OpenFile()
	return dialog.PromptForMultipleSelection()
}

func (a *AppService) OpenPurchaseLicenseDialog(ctx context.Context) *struct{} {
	dialog := application.Get().Dialog.Question()
	dialog.SetTitle("Kanmail license")
	dialog.SetMessage("Kanmail may be evaluated for free, however a license must be purchased for continued use.")

	// Do nothing button
	dialog.AddButton("Close")

	// Open purchase page button
	purchaseButton := dialog.AddButton("Open license purchase").OnClick(func() {
		a.OpenLink(ctx, "https://kanmail.io/license")
	})
	dialog.SetDefaultButton(purchaseButton)

	dialog.AddButton("Enter license key").OnClick(func() {
		a.OpenSettingsWindow(ctx, "license")
	})

	dialog.Show()
	return nil
}

func (a *AppService) TrackAnalytics(ctx context.Context, event string, properties map[string]any) error {
	if !a.analyticsEnabled {
		return nil
	}

	ctx = a.log.With().Str("method", "TrackAnalytics").Logger().WithContext(ctx)
	defer util.LogAndPanic(ctx)

	// TODO: we should put this in a queue and batch
	return backend.SendAnalytics(ctx, a.DeviceID, event, properties)
}

// TrackAppExit reports the app shutting down, blocking (with a timeout) so the
// event is sent before the process goes away.
func (a *AppService) TrackAppExit(ctx context.Context) {
	ctx, cancel := context.WithTimeout(ctx, appExitTrackTimeout)
	defer cancel()

	if err := a.TrackAnalytics(ctx, "AppExit", map[string]any{
		"sessionSeconds": int(time.Since(a.startedAt).Seconds()),
	}); err != nil {
		a.log.Warn().Err(err).Msg("Failed to send app exit event")
	}
}

// Updates
//

func (a *AppService) getUpdate(ctx context.Context) (*backend.Version, error) {
	versions, err := backend.GetVersions(ctx, a.DeviceID)
	if err != nil {
		return nil, fmt.Errorf("failed to get versions from backend: %w", err)
	}

	// Backend stores os/arch as arbitrary strings, mapping to GOOS and GOARCH on Linux, or
	// hardcoded values on macOS/Windows.
	os := runtime.GOOS
	arch := runtime.GOARCH

	switch os {
	case "darwin":
		// macOS app is a universal binary, both arm64 + amd64
		arch = "universal"
	case "windows":
		// Windows builds are amd64 only, but work on arm64 under emulation
		arch = "amd64"
	}

	for _, v := range versions {
		if v.OS == os && v.Arch == arch {
			if v.Version == a.AppVersion {
				a.log.Debug().Int("version", v.Version).Msg("Latest version is our version, no update needed")
				return nil, nil
			} else if v.Version < a.AppVersion {
				a.log.Warn().
					Int("version", v.Version).
					Int("version_current", a.AppVersion).
					Msg("Backend has an older latest version")
			} else {
				a.log.Info().
					Int("version", v.Version).
					Int("version_current", a.AppVersion).
					Msg("New version found")
				return &v, nil
			}
		}
	}

	a.log.Error().
		Str("go_os", os).
		Str("go_arch", arch).
		Msg("No app versions found!")
	return nil, nil
}

func (a *AppService) GetCurrentVersion(ctx context.Context) string {
	return fmt.Sprintf("2.%d", a.AppVersion)
}

// Returns bool if we have an update as well as the current version string (for UI)
func (a *AppService) CheckUpdate(ctx context.Context) (*backend.Version, error) {
	ctx = a.log.With().Str("method", "CheckUpdate").Logger().WithContext(ctx)
	defer util.LogAndPanic(ctx)

	u, err := a.getUpdate(ctx)
	return u, types.WrapError(err)
}

func (a *AppService) DoUpdate(ctx context.Context) (*struct{}, error) {
	ctx = a.log.With().Str("method", "DoUpdate").Logger().WithContext(ctx)
	defer util.LogAndPanic(ctx)

	update, err := a.getUpdate(ctx)
	if err != nil {
		return nil, err
	} else if update == nil {
		return nil, errors.New("no update found")
	}

	downloadPath := filepath.Join(a.cacheDir, path.Base(update.Link))

	client := &http.Client{
		Timeout: 5 * time.Minute,
	}

	resp, err := client.Get(update.Link)
	if err != nil {
		return nil, types.WrapError(fmt.Errorf("failed to download update: %w", err))
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("download failed with status: %d", resp.StatusCode)
	}

	file, err := os.Create(downloadPath)
	if err != nil {
		return nil, fmt.Errorf("failed to create download file: %w", err)
	}
	// Close + remove any lefover file
	defer file.Close()
	defer os.Remove(downloadPath)

	hasher := sha256.New()

	// Write the file + hasher
	writer := io.MultiWriter(file, hasher)
	if _, err = io.Copy(writer, resp.Body); err != nil {
		return nil, fmt.Errorf("failed to write download data: %w", err)
	}

	if err := file.Close(); err != nil {
		return nil, fmt.Errorf("failed to close downloaded file: %w", err)
	}

	// Calculate and verify SHA256
	calculatedHash := hex.EncodeToString(hasher.Sum(nil))
	if calculatedHash != update.SHA256Sum {
		return nil, fmt.Errorf("SHA256 verification failed: expected %s, got %s", update.SHA256Sum, calculatedHash)
	}

	a.log.Info().
		Str("download_path", downloadPath).
		Str("sha256", calculatedHash).
		Msg("Update downloaded and verified successfully")

	currentPath, err := os.Executable()
	if err != nil {
		return nil, fmt.Errorf("cannot find executable to update: %w", err)
	}
	newPath := downloadPath

	switch runtime.GOOS {
	case "darwin":
		// Handle macOS .app folder structure
		currentPath = strings.TrimSuffix(currentPath, "/Contents/MacOS/Kanmail")
		newPath = path.Join(a.cacheDir, "Kanmail.app")

		// ditto merges into an existing bundle rather than replacing it, so remove any leftovers
		// from any previously failed update.
		if err := os.RemoveAll(newPath); err != nil {
			return nil, fmt.Errorf("failed to remove previous update: %w", err)
		}

		// Extract .zip -> .app and then un-quarantine
		if err := exec.Command("ditto", "-xk", downloadPath, a.cacheDir).Run(); err != nil {
			return nil, fmt.Errorf("ditto error: %w", err)
		} else if err := exec.Command("xattr", "-d", "com.apple.quarantine", newPath).Run(); err != nil {
			// Only log this, the app will still work user may need to re-allow it
			a.log.Err(err).Msg("Removing quarantine xattr failed")
		}
	case "linux":
		// Ensure the new AppImage is executable
		if err := os.Chmod(downloadPath, 0755); err != nil {
			return nil, fmt.Errorf("failed to set permissions on downloaded AppImage")
		}
		// Use APPIMAGE env on Linux (where set) since the exe is mounted in a tmpfs
		appImagePath := os.Getenv("APPIMAGE")
		if appImagePath == "" {
			return nil, fmt.Errorf("unable to find AppImage path")
		}
		currentPath = appImagePath
	}

	if a.app.Env.Info().Debug {
		return nil, errors.New("refusing to self update in debug mode")
	}

	err = a.applyUpdate(currentPath, newPath)
	if err != nil {
		a.log.Err(err).Msg("Error applying update")
	}
	return nil, err
}

// Apply the update by replacing $currentPath with $newPath. This works by:
// 1. move $current -> $current.old
// 2. move $new -> $current
// 3. delete $current.old
func (a *AppService) applyUpdate(currentPath, newPath string) error {
	a.log.Info().
		Str("current_path", currentPath).
		Str("new_path", newPath).
		Msg("Applying update")

	oldPath := fmt.Sprintf("%s.old", currentPath)

	if err := os.Rename(currentPath, oldPath); err != nil {
		return fmt.Errorf("failed to move current path: %w", err)
	} else if err := os.Rename(newPath, currentPath); err != nil {
		if rollbackErr := os.Rename(oldPath, currentPath); rollbackErr != nil {
			a.log.Err(rollbackErr).
				Str("old_path", oldPath).
				Msg("Failed to roll back update, no app at install path")
		}
		return fmt.Errorf("failed to move new to current path: %w", err)
	}

	if err := os.RemoveAll(oldPath); err != nil {
		a.log.Err(err).Msg("Failed to remove old app path")
	}
	return nil
}

// Restarts the current process using the same executable, panics on any errors so we do nuke the
// current process.
func (a *AppService) RestartApp() {
	a.log.Info().Msg("Restarting Kanmail...")

	bin := os.Args[0]
	if !filepath.IsAbs(bin) {
		var err error
		bin, err = os.Executable()
		if err != nil {
			panic(fmt.Errorf("cannot get path to binary %q (launch with absolute path): %w", os.Args[0], err))
		}
	}

	switch runtime.GOOS {
	case "linux":
		appImagePath := os.Getenv("APPIMAGE")
		if appImagePath == "" {
			panic(fmt.Errorf("unable to find AppImage path"))
		}
		bin = appImagePath
	case "windows":
		// Windows has no exec syscall to replace the process, so just start a new Kanmail exe and
		// then exit this one.
		cmd := exec.Command(os.Args[0], os.Args[1:]...)
		cmd.Stdin = os.Stdin
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		if err := cmd.Start(); err != nil {
			panic(err)
		}
		os.Exit(0)
		panic("goodbye")
	}

	if err := syscall.Exec(bin, append([]string{bin}, os.Args[1:]...), os.Environ()); err != nil {
		panic(fmt.Errorf("cannot restart: %w", err))
	}
}

// License
//

func (a *AppService) getKeyringLicenseUser() string {
	return a.DeviceID + "." + "licensekey"
}

func (a *AppService) emitLicenseChangedEvent() {
	a.lock.Lock()
	defer a.lock.Unlock()

	if a.app == nil {
		return
	}
	a.app.Event.Emit(string(types.LicenseChangedEvent))
}

func (a *AppService) RemoveLicense(ctx context.Context) error {
	ctx = a.log.With().Str("method", "RemoveLicense").Logger().WithContext(ctx)
	defer util.LogAndPanic(ctx)

	if err := a.keyring.Delete(appDirName, a.getKeyringLicenseUser()); err != nil {
		return types.WrapError(err)
	}
	a.emitLicenseChangedEvent()
	return nil
}

func (a *AppService) ValidateLicense(ctx context.Context, licenseKey string) (bool, error) {
	ctx = a.log.With().Str("method", "ValidateLicense").Logger().WithContext(ctx)
	defer util.LogAndPanic(ctx)

	isValid, err := backend.CheckLicense(ctx, a.DeviceID, licenseKey)
	if err != nil {
		return false, types.WrapError(err)
	} else if !isValid {
		return false, nil
	}

	if err := a.keyring.Set(appDirName, a.getKeyringLicenseUser(), licenseKey); err != nil {
		// We failed to store the key, so even though it's valid we must tell the frontend we failed
		return false, types.WrapError(err)
	}

	// Cache the key, ignore error here as will retry
	if err = a.caches.LicenseCache.Upsert(ctx, hashLicenseKey(licenseKey)); err != nil {
		return false, types.WrapError(err)
	}

	a.emitLicenseChangedEvent()
	return true, nil
}

// Fake licensed state only applies alongside the fake IMAP backend
func isFakeLicensed() bool {
	return constants.ENV_DEBUG_FAKE_IMAP != "" && constants.ENV_DEBUG_FAKE_LICENSED != ""
}

// Checks license key, called by frontend on startup + LicenseChangedEvent events
func (a *AppService) CheckLicense(ctx context.Context) (bool, error) {
	if isFakeLicensed() {
		return true, nil
	}

	ctx = a.log.With().Str("method", "CheckLicense").Logger().WithContext(ctx)
	defer util.LogAndPanic(ctx)

	val, err := a.keyring.Get(appDirName, a.getKeyringLicenseUser())
	if err != nil && !errors.Is(err, keyring.ErrNotFound) {
		return false, types.WrapError(err)
	} else if val == "" {
		return false, nil
	}

	hashedKey := hashLicenseKey(val)
	checkedAt, err := a.caches.LicenseCache.Get(ctx, hashedKey)
	if err != nil {
		return false, types.WrapError(err)
	} else if checkedAt.After(time.Now().Add(-licenseCheckTimeout)) {
		// If already checked in the timeout, we're good
		return true, nil
	}

	isValid, err := backend.CheckLicense(ctx, a.DeviceID, val)
	if err != nil {
		return false, types.WrapError(err)
	} else if isValid {
		return true, types.WrapError(a.caches.LicenseCache.Upsert(ctx, hashedKey))
	}
	err = a.caches.LicenseCache.Delete(ctx, hashedKey)
	return false, types.WrapError(err)
}

func (a *AppService) CheckCachedLicense(ctx context.Context) bool {
	if isFakeLicensed() {
		return true
	}

	ctx = a.log.With().Str("method", "CheckCachedLicense").Logger().WithContext(ctx)
	defer util.LogAndPanic(ctx)

	val, err := a.keyring.Get(appDirName, a.getKeyringLicenseUser())
	if err != nil && !errors.Is(err, keyring.ErrNotFound) {
		zerolog.Ctx(ctx).Err(err).Msg("Get license from keyring failed")
		return false
	} else if val == "" {
		return false
	}

	hashedKey := hashLicenseKey(val)
	checkedAt, err := a.caches.LicenseCache.Get(ctx, hashedKey)
	if err != nil {
		zerolog.Ctx(ctx).Err(err).Msg("Get license from cache failed")
		return false
	} else if checkedAt.After(time.Now().Add(-licenseCheckCachedTimeout)) {
		// If checked in the longer cached timeout, we're good, this is for the UI so we don't
		// immediately show unlicensed if backend is down or user has network issues.
		return true
	}

	return false
}
