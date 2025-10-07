package main

import (
	"embed"
	"flag"
	"fmt"
	"io"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/rs/zerolog"
	deflog "github.com/rs/zerolog/log"

	"github.com/oxygem/kanmail/internal"
	"github.com/oxygem/kanmail/internal/constants"
)

// Injected at compile time
var Commit = "unknown"
var Version string

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	debugger := flag.Bool("debugger", false, "")
	flag.Parse()

	var logOut io.Writer = os.Stderr
	if constants.ENV_DEBUG_PRETTY_LOGS != "" {
		logOut = zerolog.ConsoleWriter{Out: os.Stdout, TimeFormat: time.RFC3339}
	}
	log := zerolog.New(logOut).With().Timestamp().Logger()

	// Catch any incorrectly assigned logs
	deflog.Logger = log.With().Str("component", "default_logger").Logger()
	ctxLog := log.With().Caller().Str("component", "default_context_logger").Logger()
	zerolog.DefaultContextLogger = &ctxLog

	if *debugger {
		zerolog.SetGlobalLevel(zerolog.TraceLevel)
		internal.RunDebugger(log)
		return
	}

	var version int
	ps := strings.Split(Version, ".")
	if len(ps) != 2 {
		log.Err(fmt.Errorf("invalid version string: %s", Version)).
			Msg("Ignoring invalid version (format incorrect)")
	} else {
		if v, err := strconv.Atoi(ps[1]); err != nil {
			log.Err(fmt.Errorf("invalid version string: %s: %w", Version, err)).
				Msg("Ignoring invalid version (timestamp is not number)")
		} else {
			version = v
		}
	}

	kanmail := internal.NewKanmailApp(assets, log, version)

	if kanmail.App.Environment().Debug {
		zerolog.SetGlobalLevel(zerolog.TraceLevel)
	} else {
		zerolog.SetGlobalLevel(zerolog.DebugLevel)
	}

	log.Info().
		Str("commit", Commit).
		Int("version", version).
		Any("log_level", zerolog.GlobalLevel()).
		Msg("Kanmail v2 app created")

	if err := kanmail.Run(); err != nil {
		panic(err)
	}
}
