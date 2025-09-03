package internal

import (
	"io/fs"
	"net/http"
	"os"
	"path"

	"github.com/rs/zerolog"
	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"

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

func NewKanmailApp(assets fs.FS, log zerolog.Logger, version int) *Kanmail {
	appService := services.NewAppService(log, version)
	settingsService := services.NewSettingsService(log, appService)

	caches := caches.NewCaches(log, path.Join(settingsService.CacheDir, "caches.db"))

	accountsService := services.NewAccountsService(log, settingsService, caches)
	emailsService := services.NewEmailsService(log, accountsService, appService)
	contactsService := services.NewContactsService(log, caches)

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

	// Bootstrap the appService (ie satisfy circular dependencies)
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

func (k *Kanmail) Run() error {
	emailsWindow := util.MakeWindow(k.App, "Kanmail v2", "/app.html?app=emails")

	// Quit the entire app if the main window is closed
	emailsWindow.OnWindowEvent(events.Common.WindowClosing, func(event *application.WindowEvent) {
		if os.Getenv(constants.ENV_DEBUG_NO_AUTOCLOSE) != "" {
			return
		}
		k.log.Warn().Msg("Emails window closed, quitting Kanmail!")
		k.App.Quit()
	})

	return k.App.Run()
}
