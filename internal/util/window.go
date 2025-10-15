package util

import (
	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

var macTitleBarHiddenInsetCompact = application.MacTitleBar{
	AppearsTransparent:   true,
	Hide:                 false,
	HideTitle:            true,
	FullSizeContent:      true,
	UseToolbar:           true,
	HideToolbarSeparator: true,
	ToolbarStyle:         application.MacToolbarStyleUnifiedCompact,
}

type WindowOptions struct {
	Title   string
	URL     string
	Compact bool
}

func MakeWindow(app *application.App, options WindowOptions) *application.WebviewWindow {
	titleBar := application.MacTitleBarHiddenInset
	if options.Compact {
		titleBar = macTitleBarHiddenInsetCompact
	}

	window := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title: options.Title,
		Mac: application.MacWindow{
			InvisibleTitleBarHeight: 50,
			Backdrop:                application.MacBackdropTranslucent,
			TitleBar:                titleBar,
		},
		BackgroundColour: application.NewRGB(27, 38, 54),
		BackgroundType:   application.BackgroundTypeTransparent,
		URL:              options.URL,
	})

	if app.Env.Info().Debug {
		window.OnWindowEvent(
			events.Common.WindowRuntimeReady,
			func(event *application.WindowEvent) {
				window.OpenDevTools()
			},
		)
	}

	return window
}
