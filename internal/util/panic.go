package util

import (
	"context"
	"runtime/debug"
	"time"

	"github.com/rs/zerolog"
)

func LogPanic(ctx context.Context) {
	err := recover()
	if err != nil {
		zerolog.Ctx(ctx).Error().Stack().Any("error", err).Msg("Going to panic!")
		debug.PrintStack()
		time.Sleep(time.Millisecond * 100)
		panic(err)
	}
}
