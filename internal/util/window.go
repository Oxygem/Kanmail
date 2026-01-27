package util

import (
	"context"
	"net/url"
	"runtime"

	"github.com/rs/zerolog"
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
	AppName string
	Compact bool
	Values  url.Values

	Width,
	Height,
	X,
	Y int
}

func MakeWindow(ctx context.Context, app *application.App, options WindowOptions) *application.WebviewWindow {
	titleBar := application.MacTitleBarHiddenInset
	if options.Compact {
		titleBar = macTitleBarHiddenInsetCompact
	}

	qs := url.Values{}
	qs.Set("app", options.AppName)
	qs.Set("os", runtime.GOOS)
	qs.Set("arch", runtime.GOARCH)

	// Apply any input values over the top
	for k, vs := range options.Values {
		for _, v := range vs {
			qs.Add(k, v)
		}
	}

	url := "/index.html?" + qs.Encode()

	isDebug := app.Env.Info().Debug

	zerolog.Ctx(ctx).Debug().
		Str("url", url).
		Bool("debug", isDebug).
		Msg("Making new window")

	window := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title: options.Title,
		Mac: application.MacWindow{
			InvisibleTitleBarHeight: 50,
			Backdrop:                application.MacBackdropTranslucent,
			TitleBar:                titleBar,
		},
		BackgroundColour: application.NewRGB(27, 38, 54),
		BackgroundType:   application.BackgroundTypeTransparent,
		URL:              url,
		Width:            options.Width,
		Height:           options.Height,
		X:                options.X,
		Y:                options.Y,
	})

	if isDebug {
		window.OnWindowEvent(
			events.Common.WindowRuntimeReady,
			func(event *application.WindowEvent) {
				window.OpenDevTools()
			},
		)
	}

	return window
}
