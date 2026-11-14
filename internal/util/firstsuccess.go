package util

import (
	"context"
	"sync"
	"time"
)

// FirstSuccess makes n attempts and returns the result of the lowest index to
// succeed, as soon as every lower one has failed, or each attempt's error when
// none do. Attempts start in order, each when one before it fails or stagger
// after the last started, all at once with no stagger, and none once cancelled.
// Attempts still running are cancelled and waited for before it returns.
func FirstSuccess[T any](
	ctx context.Context,
	n int,
	stagger time.Duration,
	attempt func(ctx context.Context, i int) (T, error),
) (T, bool, []error) {
	var attempting sync.WaitGroup
	defer attempting.Wait()
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	type result struct {
		index int
		value T
		err   error
	}
	results := make(chan result, n)
	started := 0
	startNext := func() {
		i := started
		started++
		attempting.Go(func() {
			var value T
			var err error
			defer func() { results <- result{i, value, err} }()
			defer RecoverError(ctx, &err)
			value, err = attempt(ctx, i)
		})
	}

	values := make([]T, n)
	errs := make([]error, n)
	done := make([]bool, n)
	succeeded := false
	for next := 0; ; {
		for next < n && done[next] {
			if errs[next] == nil {
				return values[next], true, nil
			}
			next++
		}
		if next == n {
			break
		}

		var staggered <-chan time.Time
		if started < n && !succeeded {
			switch {
			case ctx.Err() != nil:
				for ; started < n; started++ {
					errs[started], done[started] = ctx.Err(), true
				}
				continue
			case stagger <= 0 || started == next:
				startNext()
				continue
			}
			staggered = time.After(stagger)
		}

		select {
		case <-staggered:
			startNext()
		case r := <-results:
			values[r.index], errs[r.index], done[r.index] = r.value, r.err, true
			if r.err == nil {
				succeeded = true
			} else if started < n && !succeeded && ctx.Err() == nil {
				startNext()
			}
		}
	}

	var zero T
	return zero, false, errs
}
