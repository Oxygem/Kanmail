package util

import (
	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

func MakeWindow(app *application.App, title, url string) *application.WebviewWindow {
	window := app.NewWebviewWindowWithOptions(application.WebviewWindowOptions{
		Title: title,
		Mac: application.MacWindow{
			InvisibleTitleBarHeight: 50,
			Backdrop:                application.MacBackdropTranslucent,
			TitleBar:                application.MacTitleBarHiddenInset,
		},
		BackgroundColour: application.NewRGB(27, 38, 54),
		BackgroundType:   application.BackgroundTypeTransparent,
		URL:              url,
	})

	if app.Environment().Debug {
		window.OnWindowEvent(
			events.Common.WindowRuntimeReady,
			func(event *application.WindowEvent) {
				window.OpenDevTools()
			},
		)
	}

	return window
}
