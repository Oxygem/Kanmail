package emails_test

import (
	"context"
	"testing"

	"github.com/emersion/go-imap/v2"
	"github.com/stretchr/testify/assert"

	"github.com/oxygem/kanmail/internal/emails"
)

func TestUIDs(t *testing.T) {
	t.Run("TestDuplicatesDeduped", func(t *testing.T) {
		// Initial UIDs come straight from server search results, which a
		// noncompliant server can overlap - dedupe rather than crash
		uids := emails.NewUIDList(1, 1, 2, 2, 3)
		assert.Equal(t, []imap.UID{3, 2, 1}, uids.All())
	})

	t.Run("TestInsert", func(t *testing.T) {
		uids := emails.NewUIDList(1, 2, 3, 4)

		// Check dupes don't insert
		assert.False(t, uids.Insert(context.TODO(), 4))
		assert.False(t, uids.Insert(context.TODO(), 3))
		assert.False(t, uids.Insert(context.TODO(), 2))
		assert.False(t, uids.Insert(context.TODO(), 1))

		// Check append insert and subsequent dupe
		assert.True(t, uids.Insert(context.TODO(), 5))
		assert.False(t, uids.Insert(context.TODO(), 5))

		// Check length/max are correct
		assert.Equal(t, 5, uids.Length())
		assert.Equal(t, uids.All(), []imap.UID{5, 4, 3, 2, 1})
	})

	t.Run("TestUpdateFrom", func(t *testing.T) {
		uids := emails.NewUIDList(1, 2, 3, 4)

		// Update the UIDs from pos 3 with 4, 5, 6, this should:
		// - remove 3
		// - add 5 & 6
		newUIDs := emails.NewUIDList(4, 5, 6)
		uids.UpdateFrom(context.TODO(), 3, newUIDs)

		assert.False(t, uids.Contains(imap.UID(3)))
		assert.Equal(t, uids.All(), []imap.UID{6, 5, 4, 2, 1})
	})

	t.Run("TestExtend", func(f *testing.T) {
		uids := emails.NewUIDList(4, 5, 6)

		// Extend the UIDs, this should add 1, 2 & 3 at the end
		newUIDs := emails.NewUIDList(1, 2, 3, 4)
		uids.Extend(newUIDs)

		assert.Equal(t, uids.All(), []imap.UID{6, 5, 4, 3, 2, 1})

		// UIDs ahead of the current maximum are server nonsense for an extend
		// page - they're skipped rather than corrupting the order (or crashing)
		uids.Extend(emails.NewUIDList(4, 5, 6, 7))
		assert.Equal(t, uids.All(), []imap.UID{6, 5, 4, 3, 2, 1})
	})
}
