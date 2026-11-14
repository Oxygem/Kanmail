package util

import (
	"context"
	"errors"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestFirstSuccessWaitsForLowerIndexes(t *testing.T) {
	value, ok, errs := FirstSuccess(t.Context(), 3, 0, func(ctx context.Context, i int) (int, error) {
		if i == 0 {
			time.Sleep(50 * time.Millisecond)
			return 0, errors.New("failed")
		}
		if i == 1 {
			time.Sleep(20 * time.Millisecond)
		}
		return i, nil
	})
	assert.True(t, ok)
	assert.Nil(t, errs)
	assert.Equal(t, 1, value)
}

func TestFirstSuccessReturnsEveryError(t *testing.T) {
	_, ok, errs := FirstSuccess(t.Context(), 2, 0, func(ctx context.Context, i int) (int, error) {
		return 0, errors.New("failed")
	})
	assert.False(t, ok)
	assert.Len(t, errs, 2)
}

func TestFirstSuccessStaggersAttempts(t *testing.T) {
	var started atomic.Int32
	value, ok, _ := FirstSuccess(t.Context(), 3, time.Minute, func(ctx context.Context, i int) (int, error) {
		started.Add(1)
		return i, nil
	})
	assert.True(t, ok)
	assert.Equal(t, 0, value)
	assert.Equal(t, int32(1), started.Load())
}

func TestFirstSuccessStartsNextWhenOneFails(t *testing.T) {
	value, ok, _ := FirstSuccess(t.Context(), 2, time.Minute, func(ctx context.Context, i int) (int, error) {
		if i == 0 {
			return 0, errors.New("failed")
		}
		return i, nil
	})
	assert.True(t, ok)
	assert.Equal(t, 1, value)
}

func TestFirstSuccessStartsNextAfterStagger(t *testing.T) {
	var secondStarted atomic.Bool
	var startedDuringFirst bool
	value, ok, _ := FirstSuccess(t.Context(), 2, 10*time.Millisecond, func(ctx context.Context, i int) (int, error) {
		if i == 0 {
			time.Sleep(200 * time.Millisecond)
			startedDuringFirst = secondStarted.Load()
			return 0, errors.New("failed")
		}
		secondStarted.Store(true)
		return i, nil
	})
	assert.True(t, ok)
	assert.Equal(t, 1, value)
	assert.True(t, startedDuringFirst)
}

func TestFirstSuccessCancelsAndWaitsForRemainingAttempts(t *testing.T) {
	var finished atomic.Int32
	_, ok, _ := FirstSuccess(t.Context(), 2, 0, func(ctx context.Context, i int) (int, error) {
		defer finished.Add(1)
		if i == 1 {
			<-ctx.Done()
			return 0, ctx.Err()
		}
		return i, nil
	})
	assert.True(t, ok)
	assert.Equal(t, int32(2), finished.Load())
}

func TestFirstSuccessTurnsPanicsIntoErrors(t *testing.T) {
	value, ok, _ := FirstSuccess(t.Context(), 2, 0, func(ctx context.Context, i int) (int, error) {
		if i == 0 {
			panic("bad server response")
		}
		return i, nil
	})
	assert.True(t, ok)
	assert.Equal(t, 1, value)
}

func TestFirstSuccessStopsStartingAttemptsOnceCancelled(t *testing.T) {
	ctx, cancel := context.WithCancel(t.Context())
	var started atomic.Int32
	_, ok, errs := FirstSuccess(ctx, 3, time.Minute, func(ctx context.Context, i int) (int, error) {
		started.Add(1)
		cancel()
		return 0, errors.New("failed")
	})
	assert.False(t, ok)
	assert.Equal(t, int32(1), started.Load())
	assert.ErrorIs(t, errs[2], context.Canceled)
}
