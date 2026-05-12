package internal

import (
	"context"
	"io/fs"
	"net/http"
	"path"
	"sync"

	"github.com/rs/zerolog"
	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
	"github.com/wailsapp/wails/v3/pkg/services/dock"

	"github.com/oxygem/kanmail/internal/caches"
	"github.com/oxygem/kanmail/internal/constants"
	"github.com/oxygem/kanmail/internal/services"
	"github.com/oxygem/kanmail/internal/util"
)

const (
	appName        = "Kanmail v2"
	appDescription = "Yo dawg I herd u like kanban so I put kanban in your emails so you can kanban while you email"
)

type Kanmail struct {
	log zerolog.Logger

	App    *application.App
	Caches *caches.Caches

	// Wails3 services
	AppService      *services.AppService
	SettingsService *services.SettingsService
	AccountsService *services.AccountsService
	EmailsService   *services.EmailsService
	ContactsService *services.ContactsService
}

func NewKanmailApp(assets fs.FS, log zerolog.Logger, version int, logFilename string) *Kanmail {
	appService := services.NewAppService(log, version)
	settingsService := services.NewSettingsService(log, logFilename, appService)

	caches := caches.NewCaches(log, path.Join(settingsService.CacheDir, "caches.db"))

	accountsService := services.NewAccountsService(log, settingsService, caches)
	emailsService := services.NewEmailsService(log, accountsService, appService)
	contactsService := services.NewContactsService(log, caches)
	dockService := dock.New()

	var assetsHandler http.Handler
	if assets != nil {
		assetsHandler = application.AssetFileServerFS(assets)
	}

	// Now build the wails3 app, wrapped with our AppService
	app := application.New(application.Options{
		Name:        appName,
		Description: appDescription,
		Services: []application.Service{
			application.NewService(appService),
			application.NewService(settingsService),
			application.NewService(accountsService),
			application.NewService(emailsService),
			application.NewService(contactsService),
			application.NewService(dockService),
		},
		Assets: application.AssetOptions{
			Handler: assetsHandler,
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
	})
	app.OnShutdown(func() {
		caches.Close()
		log.Info().Msg("Closed caches")
	})

	// Bootstrap (ie satisfy circular dependencies)
	appService.Bootstrap(app, caches, settingsService.CacheDir)

	return &Kanmail{
		log:             log.With().Str("component", "kanmail").Logger(),
		App:             app,
		Caches:          caches,
		AppService:      appService,
		SettingsService: settingsService,
		AccountsService: accountsService,
		EmailsService:   emailsService,
		ContactsService: contactsService,
	}
}

const mainWindowName = "main"

func (k *Kanmail) Run() error {
	ctx := context.Background()

	startApp := constants.ENV_DEBUG_START_APP
	if startApp == "" {
		startApp = "emails"
	}

	options := util.WindowOptions{
		Title:   "Kanmail v2",
		AppName: startApp,
	}
	// Restore saved window position and size
	if state, err := k.Caches.WindowStateCache.Get(ctx, mainWindowName); err != nil {
		k.log.Warn().Err(err).Msg("Failed to get saved window state")
	} else if state != nil {
		k.log.Debug().
			Int("x", state.X).
			Int("y", state.Y).
			Int("width", state.Width).
			Int("height", state.Height).
			Msg("Restoring window state")
		options.X = state.X
		options.Y = state.Y
		if state.Width > 100 && state.Height > 100 {
			options.Width = state.Width
			options.Height = state.Height
		}
	}

	if constants.ENV_DEBUG_WINDOW_WIDTH > 0 {
		options.Width = constants.ENV_DEBUG_WINDOW_WIDTH
	}
	if constants.ENV_DEBUG_WINDOW_HEIGHT > 0 {
		options.Height = constants.ENV_DEBUG_WINDOW_HEIGHT
	}

	emailsWindow := util.MakeWindow(ctx, k.App, options)

	k.App.Event.OnApplicationEvent(events.Common.ApplicationStarted, func(*application.ApplicationEvent) {
		// Initial position doesn't seem to work (macOS)?
		emailsWindow.SetPosition(options.X, options.Y)
	})

	var saveLock sync.Mutex
	saveWindowState := func(*application.WindowEvent) {
		saveLock.Lock()
		defer saveLock.Unlock()

		x, y := emailsWindow.Position()
		width, height := emailsWindow.Size()
		state := caches.WindowState{X: x, Y: y, Width: width, Height: height}
		if err := k.Caches.WindowStateCache.Store(ctx, mainWindowName, state); err != nil {
			k.log.Warn().Err(err).Msg("Failed to save window state")
		} else {
			k.log.Debug().
				Int("x", x).
				Int("y", y).
				Int("width", width).
				Int("height", height).
				Msg("Saved window state")
		}
	}
	emailsWindow.OnWindowEvent(events.Common.WindowDidMove, saveWindowState)
	emailsWindow.OnWindowEvent(events.Common.WindowDidResize, saveWindowState)

	// Quit the entire app if the main window is closed
	emailsWindow.OnWindowEvent(events.Common.WindowClosing, func(event *application.WindowEvent) {
		if constants.ENV_DEBUG_NO_AUTOCLOSE != "" {
			return
		}
		k.log.Warn().Msg("Emails window closed, quitting Kanmail!")
		k.App.Quit()
	})

	return k.App.Run()
}
