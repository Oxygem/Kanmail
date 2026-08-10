module github.com/oxygem/kanmail

go 1.26.1

require (
	github.com/brianvoe/gofakeit/v7 v7.14.1
	github.com/dustin/go-humanize v1.0.1
	github.com/emersion/go-appdir v1.1.2
	github.com/emersion/go-imap/v2 v2.0.0-beta.8
	github.com/emersion/go-message v0.18.2
	github.com/emersion/go-sasl v0.0.0-20241020182733-b788ff22d5a6
	github.com/emersion/go-smtp v0.24.0
	github.com/google/uuid v1.6.0
	github.com/mattn/go-sqlite3 v1.14.49
	github.com/microcosm-cc/bluemonday v1.0.27
	github.com/rs/zerolog v1.35.1
	github.com/stretchr/testify v1.11.1
	github.com/wailsapp/wails/v3 v3.0.0-alpha2.117
	github.com/yuin/goldmark v1.8.5
	github.com/zalando/go-keyring v0.2.8
	go.mau.fi/util v0.9.11
	golang.org/x/net v0.57.0
)

require (
	github.com/adrg/xdg v0.5.3 // indirect
	github.com/aymerick/douceur v0.2.0 // indirect
	github.com/coder/websocket v1.8.14 // indirect
	github.com/danieljoos/wincred v1.2.3 // indirect
	github.com/davecgh/go-spew v1.1.1 // indirect
	github.com/go-ole/go-ole v1.3.0 // indirect
	github.com/godbus/dbus/v5 v5.2.2 // indirect
	github.com/gorilla/css v1.0.1 // indirect
	github.com/jchv/go-winloader v0.0.0-20250406163304-c1995be93bd1 // indirect
	github.com/kr/pretty v0.3.1 // indirect
	github.com/mattn/go-colorable v0.1.14 // indirect
	github.com/mattn/go-isatty v0.0.20 // indirect
	github.com/pmezard/go-difflib v1.0.0 // indirect
	github.com/rogpeppe/go-internal v1.14.1 // indirect
	golang.org/x/image v0.40.0 // indirect
	golang.org/x/sys v0.47.0 // indirect
	golang.org/x/text v0.40.0 // indirect
	gopkg.in/check.v1 v1.0.0-20201130134442-10cb98267c6c // indirect
	gopkg.in/yaml.v3 v3.0.1 // indirect
)

replace github.com/emersion/go-imap/v2 => github.com/oxygem/go-imap/v2 v2.0.0-20260712210554-6a90c9be8ebe

// replace github.com/wailsapp/wails/v3 => ../wails/v3
// replace github.com/emersion/go-imap/v2 => ../go-imap
