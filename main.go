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

	writers := []io.Writer{}
	f, createTempErr := os.CreateTemp("", "kanmail")

	if createTempErr != nil {
		writers = append(writers, os.Stderr)
	} else {
		writers = append(writers, f)
		defer f.Close()
	}
	if constants.ENV_DEBUG_PRETTY_LOGS != "" {
		writers = append(writers, zerolog.ConsoleWriter{Out: os.Stdout, TimeFormat: time.RFC3339})
	}
	log := zerolog.New(io.MultiWriter(writers...)).With().Timestamp().Logger()

	var logFilename string
	if createTempErr != nil {
		log.Err(createTempErr).Msg("Failed to open temporary log file")
	} else {
		logFilename = f.Name()
		log.Debug().Str("file", f.Name()).Msg("Using temporary log file")
	}

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

	kanmail := internal.NewKanmailApp(assets, log, version, logFilename)

	if kanmail.App.Env.Info().Debug {
		if constants.ENV_DEBUG_TRACE_LOGS != "" {
			zerolog.SetGlobalLevel(zerolog.TraceLevel)
		} else {
			zerolog.SetGlobalLevel(zerolog.DebugLevel)
		}
	} else {
		zerolog.SetGlobalLevel(zerolog.WarnLevel)
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
