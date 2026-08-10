package emails

import (
	"context"
	"slices"
	"sync"

	"github.com/emersion/go-imap/v2"
	"github.com/rs/zerolog"
)

// uidList implements the data structure needed for fast access to the head of the UID list for a
// given folder. Needs to:
//   - fetch ID ranges in order, from a given position
//   - insert new IDs, which may include dupes that should be ignored
//   - handle partial updates to the list while detecting additions + removals in the part changed,
//     ie we can re-fetch and update a subset of the list accounting for both new UIDs at the start
//     but also UIDs removed in the middle.
type uidList struct {
	lock sync.RWMutex
	uids uids
}

type uids []imap.UID

func (u uids) sort() {
	slices.SortFunc(u, func(a, b imap.UID) int {
		if a > b { // this makes it high -> low
			return -1
		} else if a < b {
			return 1
		}
		return 0
	})
}

func NewUIDList(initialUIDs ...imap.UID) *uidList {
	list := &uidList{uids: initialUIDs}
	list.uids.sort()
	// Initial UIDs come straight from server search results, and a noncompliant/buggy server might
	// return duplicate ranges.
	list.uids = slices.Compact(list.uids)
	return list
}

// Update UIDs given a new list from a starting point, this allows us to partially check the UID
// slice for removals without comparing the entire thing each time. Since we only care about removals
// of UIDs that have been passed to the frontend this is usually small. The start point is included
// in the UIDS to check (since it's the lowest UID we've sent to the frontend).
func (u *uidList) UpdateFrom(
	ctx context.Context,
	startPoint imap.UID,
	newUIDs *uidList,
) (added []imap.UID, removed []imap.UID, unchanged []imap.UID) {
	u.lock.Lock()
	defer u.lock.Unlock()

	// First iter through our UIDs (high -> low) until the startPoint and drop anything not in newUIDs
	keptUIDs := make([]imap.UID, 0, len(u.uids))
	for i, uid := range u.uids {
		if uid < startPoint {
			keptUIDs = append(keptUIDs, u.uids[i:]...)
			break
		}
		if !newUIDs.contains(uid) {
			removed = append(removed, uid)
		} else {
			keptUIDs = append(keptUIDs, uid)
		}
	}
	u.uids = keptUIDs

	// Now iter through the new UIDs backwards (low -> high) and insert them
	for _, uid := range slices.Backward(newUIDs.uids) {
		if u.insert(ctx, uid) {
			added = append(added, uid)
		} else {
			unchanged = append(unchanged, uid)
		}
	}

	return added, removed, unchanged
}

// Note: only used/exported for tests
func (u *uidList) Insert(ctx context.Context, id imap.UID) bool {
	u.lock.Lock()
	defer u.lock.Unlock()
	return u.insert(ctx, id)
}

func (u *uidList) insert(ctx context.Context, id imap.UID) bool {
	if u.contains(id) {
		// Ignore dupes
		// TODO: log?
		return false
	}

	if len(u.uids) == 0 || id > u.uids[0] {
		u.uids = append([]imap.UID{id}, u.uids...)
		return true
	}

	for i, uid := range u.uids {
		if id > uid {
			uidsAroundBefore := u.uids[i-1 : i+1]
			u.uids = append(u.uids[:i], append([]imap.UID{id}, u.uids[i:]...)...)
			zerolog.Ctx(ctx).Error().
				Any("uid", id).
				Any("uids_around", u.uids[i-1:i+2]).
				Any("uids_around_before", uidsAroundBefore).
				Msg("Insert unknown UID lower than the max!")
			return true
		}
	}

	u.uids = append(u.uids, id)
	zerolog.Ctx(ctx).Error().
		Any("uid", id).
		Msg("Append unknown lowest UID!")
	return true
}

func (u *uidList) Extend(newUIDs *uidList) {
	u.lock.Lock()
	defer u.lock.Unlock()

	// Iter through the new UIDs, high -> low until we find one we don't have, at that point we
	// can just extend our list by all remaining since we won't have any of them.
	for i, uid := range newUIDs.uids {
		if u.containsBackwards(uid) {
			continue
		}
		if len(u.uids) > 0 && u.uids[len(u.uids)-1] < uid {
			// Extend pages should only ever contain UIDs at or below our current
			// minimum - skip anything a noncompliant server returns above it
			// rather than corrupt the ordering (or crash)
			continue
		}
		// Everything from here down is below our minimum, so unknown - bulk append
		u.uids = append(u.uids, newUIDs.uids[i:]...)
		return
	}
}

func (u *uidList) Length() int {
	u.lock.RLock()
	defer u.lock.RUnlock()
	return len(u.uids)
}

func (u *uidList) Max() imap.UID {
	u.lock.RLock()
	defer u.lock.RUnlock()
	if len(u.uids) == 0 {
		return 0
	}
	return u.uids[0]
}

func (u *uidList) Min() imap.UID {
	u.lock.RLock()
	defer u.lock.RUnlock()
	if len(u.uids) == 0 {
		return 0
	}
	return u.uids[len(u.uids)-1]
}

// Check if a UID exists in the list, optimised for UIDs near the high end
func (u *uidList) Contains(id imap.UID) bool {
	u.lock.RLock()
	defer u.lock.RUnlock()
	return u.contains(id)
}

func (u *uidList) contains(id imap.UID) bool {
	// Iter the ID list (high -> low), greatest to lowest - most functions go through the list
	// backwards (ie listing a folders emails). This means the further you paginate through the
	// list, the slower it gets.
	for _, uid := range u.uids {
		if id == uid {
			return true
		}
		if id > uid {
			// If this ID is ahead of this one we're checking we don't know about it since we
			// already checked all greater values.
			return false
		}
	}

	// Worst case: we iterated the entire list, no match
	return false
}

func (u *uidList) containsBackwards(id imap.UID) bool {
	// Iter the ID list (low -> high)
	for _, uid := range slices.Backward(u.uids) {
		if id == uid {
			return true
		}
		if id < uid {
			// If this ID is behind the one we're checking we don't know about it since we already
			// checked all lower values.
			return false
		}
	}

	// Worst case: we iterated the entire list, no match
	return false
}

func (u *uidList) All() []imap.UID {
	u.lock.RLock()
	defer u.lock.RUnlock()

	return append([]imap.UID{}, u.uids...)
}

func (u *uidList) AllGreaterThan(greaterThanOrEqualTo imap.UID) []imap.UID {
	u.lock.RLock()
	defer u.lock.RUnlock()

	ids := make([]imap.UID, 0, len(u.uids)/2)
	// Iter through the ID list (high -> low), fetch everything until X
	for _, uid := range u.uids {
		if uid < greaterThanOrEqualTo {
			break
		}
		ids = append(ids, uid)
	}
	return ids
}

// Get the next N UIDs *including* lessThan. This gets slower the further down the list lessThan is.
// If lessThan is zero we paginate from the start of the list (ignore it).
func (u *uidList) PaginateFrom(lessThan imap.UID, size int) []imap.UID {
	u.lock.RLock()
	defer u.lock.RUnlock()

	ids := make([]imap.UID, 0, size)
	// Iter through the ID list (high -> low), fetch the first N after X
	for _, uid := range u.uids {
		if uid > lessThan {
			continue
		}
		ids = append(ids, uid)
		if len(ids) >= size {
			break
		}
	}

	return ids
}
