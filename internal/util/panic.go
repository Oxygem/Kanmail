package util

import (
	"context"
	"fmt"
	"runtime/debug"
	"time"

	"github.com/rs/zerolog"

	"github.com/oxygem/kanmail/internal/backend"
)

var deviceID string
var analyticsEnabled bool

func SetDeviceID(id string) {
	deviceID = id
}

func SetAnalyticsEnabled(enabled bool) {
	analyticsEnabled = enabled
}

func LogAndPanic(ctx context.Context) {
	err := recover()
	if err != nil {
		zerolog.Ctx(ctx).Error().Stack().Any("error", err).Msg("Going to panic!")

		if analyticsEnabled && deviceID != "" {
			trackCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			_ = backend.SendAnalytics(trackCtx, deviceID, "$exception", map[string]any{
				"$exception_type":            "go_panic",
				"$exception_message":         fmt.Sprintf("%v", err),
				"$exception_stack_trace_raw": string(debug.Stack()),
				"$exception_source":          "backend",
			})
			cancel()
		}

		debug.PrintStack()
		time.Sleep(time.Millisecond * 100)
		panic(err)
	}
}
