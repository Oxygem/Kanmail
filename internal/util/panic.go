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
		ReportPanic(ctx, err)
		debug.PrintStack()
		time.Sleep(time.Millisecond * 100)
		panic(err)
	}
}

// ReportPanic logs and reports an already-recovered panic without re-raising it,
// for long-lived goroutines that recover and carry on rather than crash the app.
func ReportPanic(ctx context.Context, err any) {
	zerolog.Ctx(ctx).Error().Stack().Any("error", err).Msg("Recovered panic")

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
}
