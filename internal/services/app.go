package services

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"log"
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
	"github.com/rs/zerolog"
	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/zalando/go-keyring"

	"github.com/oxygem/kanmail/internal/backend"
	"github.com/oxygem/kanmail/internal/caches"
	"github.com/oxygem/kanmail/internal/types"
	"github.com/oxygem/kanmail/internal/util"
)

// 24h timeout to re-checking license
const licenseCheckTimeout = 24 * time.Hour

// 7 days timeout on checking licenses as show in UI
const licenseCheckCachedTimeout = 7 * 24 * time.Hour

type AppService struct {
	log      zerolog.Logger
	lock     sync.Mutex
	app      *application.App
	caches   *caches.Caches
	cacheDir string

	settingsWindow *application.WebviewWindow
	licenseWindow  *application.WebviewWindow
	metaWindow     *application.WebviewWindow
	sendWindows    []*application.WebviewWindow

	AppVersion int
	DeviceID   string
}

func NewAppService(log zerolog.Logger, version int) *AppService {
	return &AppService{
		log:         log.With().Str("component", "app").Logger(),
		sendWindows: make([]*application.WebviewWindow, 0),
		AppVersion:  version,
	}
}

func (a *AppService) Bootstrap(app *application.App, caches *caches.Caches, cacheDir string) {
	a.app = app
	a.caches = caches
	a.cacheDir = cacheDir
}

func (a *AppService) SetDeviceID(dirname string) {
	a.DeviceID = ensureDeviceIDFile(a.log, path.Join(dirname, "device-id"))
}

// FIXME: Exists only so the types.EventName type is exported to JS
func (a *AppService) GetEventNames() []types.EventName {
	return []types.EventName{}
}

func (a *AppService) OpenLink(ctx context.Context, url string) error {
	return util.OpenInBrowser(url)
}

type OpenSendWindowOptions struct {
	Mode        string            `json:"mode,omitempty"`
	AccountName types.AccountName `json:"accountName,omitempty"`
	FolderName  types.FolderName  `json:"folderName,omitempty"`
	UID         imap.UID          `json:"uid,omitempty"`
}

func (a *AppService) OpenSendWindow(options OpenSendWindowOptions) {
	a.lock.Lock()
	defer a.lock.Unlock()

	v := url.Values{
		"app": []string{"send"},
	}

	if options.Mode != "" {
		v["mode"] = []string{options.Mode}
	}
	if options.AccountName != "" {
		v["accountName"] = []string{(string(options.AccountName))}
	}
	if options.FolderName != "" {
		v["folderName"] = []string{string(options.FolderName)}
	}
	if options.UID > 0 {
		v["uid"] = []string{strconv.Itoa(int(options.UID))}
	}

	u := url.URL{
		Path:     "/index.html",
		RawQuery: v.Encode(),
	}

	window := util.MakeWindow(a.app, "Kanmail v2 Send", u.String())
	a.sendWindows = append(a.sendWindows, window)
}

func (a *AppService) OpenMetaWindow() {
	a.lock.Lock()
	defer a.lock.Unlock()

	if a.metaWindow != nil {
		screen, err := a.metaWindow.GetScreen()
		if err != nil {
			panic(fmt.Errorf("failed to get window screeen: %w", err))
		} else if screen == nil {
			a.log.Warn().Msg("License window has been destroted, re-creating")
			a.metaWindow = nil
		} else {
			a.metaWindow.Show()
			a.metaWindow.Focus()
			return
		}
	}

	a.metaWindow = util.MakeWindow(a.app, "Kanmail v2 License", "/index.html?app=meta")
}

func (a *AppService) OpenLicenseWindow() {
	a.lock.Lock()
	defer a.lock.Unlock()

	if a.licenseWindow != nil {
		screen, err := a.licenseWindow.GetScreen()
		if err != nil {
			panic(fmt.Errorf("failed to get window screeen: %w", err))
		} else if screen == nil {
			a.log.Warn().Msg("License window has been destroted, re-creating")
			a.licenseWindow = nil
		} else {
			a.licenseWindow.Show()
			a.licenseWindow.Focus()
			return
		}
	}

	a.licenseWindow = util.MakeWindow(a.app, "Kanmail v2 License", "/index.html?app=license")
}

func (a *AppService) OpenSettingsWindow() {
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
			return
		}
	}

	a.settingsWindow = util.MakeWindow(a.app, "Kanmail v2 Settings", "/index.html?app=settings")
}

func (a *AppService) SendSettingsChangedEvent(ctx context.Context, settings types.Settings) {
	a.lock.Lock()
	defer a.lock.Unlock()

	a.app.EmitEvent(string(types.SettingsChangedEvent), settings)
}

func (a *AppService) OpenSaveFileDialog(part types.BodyPart) string {
	dialog := application.SaveFileDialog()
	dialog.SetFilename(part.Description)
	dialog.SetDirectory("Downloads")

	if path, err := dialog.PromptForSingleSelection(); err == nil {
		// Save file to selected path
		return path
	} else {
		panic(err)
	}
}

func (a *AppService) OpenOpenFilesDialog() []string {
	dialog := application.OpenFileDialog()

	if paths, err := dialog.PromptForMultipleSelection(); err == nil {
		return paths
	} else {
		panic(err)
	}
}

func (a *AppService) OpenPurchaseLicenseDialog(ctx context.Context) {
	dialog := application.QuestionDialog()
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
		a.OpenLicenseWindow()
	})

	dialog.Show()
}

func (a *AppService) TrackAnalytics(ctx context.Context, event string, properties map[string]any) error {
	ctx = a.log.With().Str("method", "TrackAnalytics").Logger().WithContext(ctx)
	defer util.LogPanic(ctx)

	// TODO: we should put this in a queue and batch
	return backend.SendAnalytics(ctx, a.DeviceID, event, properties)
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
		// Send  Windows users to download the installer, amd64 only (works on arm via emulation)
		os = "windows-installer"
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

// Returns bool if we have an update as well as the current version string (for UI)
func (a *AppService) CheckUpdate(ctx context.Context) (*backend.Version, string, error) {
	ctx = a.log.With().Str("method", "CheckUpdate").Logger().WithContext(ctx)
	defer util.LogPanic(ctx)

	update, err := a.getUpdate(ctx)
	return update, fmt.Sprintf("2.%d", a.AppVersion), err
}

// UNUSED/WIP due to issues updating (ditto can't overwrite app), no win/linux implementation
func (a *AppService) DoUpdate(ctx context.Context) error {
	ctx = a.log.With().Str("method", "DoUpdate").Logger().WithContext(ctx)
	defer util.LogPanic(ctx)

	update, err := a.getUpdate(ctx)
	if err != nil {
		return err
	} else if update == nil {
		return errors.New("no update found")
	}

	downloadPath := filepath.Join(a.cacheDir, "Kanmail.zip")

	client := &http.Client{
		Timeout: 300 * time.Minute, // Generous timeout for large downloads
	}

	resp, err := client.Get(update.Link)
	if err != nil {
		return fmt.Errorf("failed to download update: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("download failed with status: %d", resp.StatusCode)
	}

	file, err := os.Create(downloadPath)
	if err != nil {
		return fmt.Errorf("failed to create download file: %w", err)
	}
	defer file.Close()

	hasher := sha256.New()

	// Use MultiWriter to tee the data to both file and hasher simultaneously
	writer := io.MultiWriter(file, hasher)

	// Copy response body to both file and hasher
	_, err = io.Copy(writer, resp.Body)
	if err != nil {
		os.Remove(downloadPath) // Clean up on error
		return fmt.Errorf("failed to write download data: %w", err)
	}

	// Calculate and verify SHA256
	calculatedHash := hex.EncodeToString(hasher.Sum(nil))
	if calculatedHash != update.SHA256Sum {
		os.Remove(downloadPath) // Clean up invalid file
		return fmt.Errorf("SHA256 verification failed: expected %s, got %s", update.SHA256Sum, calculatedHash)
	}

	a.log.Info().
		Str("download_path", downloadPath).
		Str("sha256", calculatedHash).
		Msg("Update downloaded and verified successfully")

	if a.app.Environment().Debug {
		return errors.New("refusing to self update in debug mode")
	}

	switch runtime.GOOS {
	case "darwin":
		var appPath string
		cmdPath, err := os.Executable()
		appPath = strings.TrimSuffix(cmdPath, "Kanmail.app/Contents/MacOS/Kanmail")
		if err != nil {
			appPath = "/Applications/"
		}
		err = exec.Command("ditto", "-xk", downloadPath, appPath).Run()
		if err != nil {
			return fmt.Errorf("ditto error: %w", err)
		}
		err = exec.Command("rm", downloadPath).Run()
		if err != nil {
			log.Println("removing error:", err)
		}

	// TODO: Windows
	// TODO: Linux
	// https://github.com/inconshreveable/go-update/blob/master/apply.go#L22
	default:
		return fmt.Errorf("unknown GOOS: %s", runtime.GOOS)
	}

	return nil
}

// Unused as above
func (a *AppService) RestartAfterUpdate(ctx context.Context) error {
	bin := os.Args[0]
	if !filepath.IsAbs(bin) {
		var err error
		bin, err = os.Executable()
		if err != nil {
			return fmt.Errorf(
				"cannot get path to binary %q (launch with absolute path): %w",
				os.Args[0], err)
		}
	}

	if err := syscall.Exec(bin, append([]string{bin}, os.Args[1:]...), os.Environ()); err != nil {
		return fmt.Errorf("cannot restart: %w", err)
	}
	return nil
}

// License
//

func (a *AppService) getKeyringLicenseUser() string {
	return a.DeviceID + "." + "licensekey"
}

func (a *AppService) RemoveLicense(ctx context.Context) error {
	ctx = a.log.With().Str("method", "RemoveLicense").Logger().WithContext(ctx)
	defer util.LogPanic(ctx)

	err := keyring.Delete(appDirName, a.getKeyringLicenseUser())
	a.app.EmitEvent(string(types.LicenseChangedEvent))
	return err
}

func (a *AppService) ValidateLicense(ctx context.Context, licenseKey string) (bool, error) {
	ctx = a.log.With().Str("method", "ValidateLicense").Logger().WithContext(ctx)
	defer util.LogPanic(ctx)

	isValid, err := backend.CheckLicense(ctx, a.DeviceID, licenseKey)
	if err != nil {
		return false, err
	} else if !isValid {
		return false, nil
	}

	if err := keyring.Set(appDirName, a.getKeyringLicenseUser(), licenseKey); err != nil {
		// We failed to store the key, so even though it's valid we must tell the frontend we failed
		return false, err
	}

	// Cache the key, ignore error here as will retry
	err = a.caches.LicenseCache.Upsert(ctx, hashLicenseKey(licenseKey))
	a.app.EmitEvent(string(types.LicenseChangedEvent))
	return true, err
}

// Checks license key, called by frontend on startup + LicenseChangedEvent events
func (a *AppService) CheckLicense(ctx context.Context) (bool, error) {
	ctx = a.log.With().Str("method", "CheckLicense").Logger().WithContext(ctx)
	defer util.LogPanic(ctx)

	val, err := keyring.Get(appDirName, a.getKeyringLicenseUser())
	if err != nil && !errors.Is(err, keyring.ErrNotFound) {
		return false, err
	} else if val == "" {
		return false, nil
	}

	hashedKey := hashLicenseKey(val)
	checkedAt, err := a.caches.LicenseCache.Get(ctx, hashedKey)
	if err != nil {
		return false, err
	} else if checkedAt.After(time.Now().Add(-licenseCheckTimeout)) {
		// If already checked in the timeout, we're good
		return true, nil
	}

	isValid, err := backend.CheckLicense(ctx, a.DeviceID, val)
	if err != nil {
		return false, err
	} else if isValid {
		return true, a.caches.LicenseCache.Upsert(ctx, hashedKey)
	}
	err = a.caches.LicenseCache.Delete(ctx, hashedKey)
	return false, err
}

func (a *AppService) CheckCachedLicense(ctx context.Context) bool {
	ctx = a.log.With().Str("method", "CheckCachedLicense").Logger().WithContext(ctx)
	defer util.LogPanic(ctx)

	val, err := keyring.Get(appDirName, a.getKeyringLicenseUser())
	if err != nil && !errors.Is(err, keyring.ErrNotFound) {
		zerolog.Ctx(ctx).Err(err).Msg("Get license from keyring failed")
		return false
	} else if val == "" {
		return false
	}

	hashedKey := hashLicenseKey(val)
	checkedAt, err := a.caches.LicenseCache.Get(ctx, hashedKey)
	if err != nil {
		panic(err)
	} else if checkedAt.After(time.Now().Add(-licenseCheckCachedTimeout)) {
		// If checked in the longer cached timeout, we're good, this is for the UI so we don't
		// immediately show unlicensed if backend is down or user has network issues.
		return true
	}

	return false
}
