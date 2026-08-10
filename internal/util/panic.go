package util

import (
	"context"
	"fmt"
	"runtime/debug"
	"sync/atomic"
	"time"

	"github.com/rs/zerolog"

	"github.com/oxygem/kanmail/internal/backend"
)

// Written on every settings read and read from watch goroutines, so atomic
var deviceID atomic.Value // string
var analyticsEnabled atomic.Bool

func init() {
	// Default true, must match the AppService value
	analyticsEnabled.Store(true)
}

func SetDeviceID(id string) {
	deviceID.Store(id)
}

func getDeviceID() string {
	id, _ := deviceID.Load().(string)
	return id
}

func SetAnalyticsEnabled(enabled bool) {
	analyticsEnabled.Store(enabled)
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

	if analyticsEnabled.Load() {
		trackCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		_ = backend.SendAnalytics(trackCtx, getDeviceID(), "$exception", map[string]any{
			"$exception_list": []map[string]any{{
				"type":      "go_panic",
				"value":     fmt.Sprintf("%v", err),
				"mechanism": map[string]any{"handled": true, "synthetic": false},
			}},
			"$exception_stack_trace_raw": string(debug.Stack()),
			"$exception_source":          "backend",
		})
		cancel()
	}
}
