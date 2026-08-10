package caches

import (
	"context"
	"database/sql"
	"path"
	"testing"

	"github.com/rs/zerolog"
)

func assertAvatarCached(t *testing.T, cache *AvatarCache, email string, want bool) {
	t.Helper()

	exists, _, _, err := cache.Get(context.Background(), email)
	if err != nil {
		t.Fatal(err)
	}
	if exists != want {
		t.Fatalf("%s: expected cached=%v, got %v", email, want, exists)
	}
}

func backdateAvatar(t *testing.T, db *sql.DB, email, age string) {
	t.Helper()

	if _, err := db.Exec(
		`UPDATE email_avatars SET created_at = datetime('now', ?) WHERE email = ?`, age, email,
	); err != nil {
		t.Fatal(err)
	}
}

// Cached avatars must expire, otherwise a contact that later gains one (or a
// lookup that failed for a reason we misread as "no avatar") is stuck forever.
func TestAvatarCacheExpiry(t *testing.T) {
	caches, err := openCaches(zerolog.Nop(), path.Join(t.TempDir(), "caches.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { caches.db.Close() })

	ctx := context.Background()
	cache := caches.AvatarCache

	if err := cache.Store(ctx, "hit@test", []byte("png-data"), "image/png"); err != nil {
		t.Fatal(err)
	}
	if err := cache.Store(ctx, "miss@test", nil, ""); err != nil {
		t.Fatal(err)
	}

	assertAvatarCached(t, cache, "hit@test", true)
	assertAvatarCached(t, cache, "miss@test", true)

	// Misses expire first
	backdateAvatar(t, caches.db, "miss@test", "-8 days")
	backdateAvatar(t, caches.db, "hit@test", "-8 days")
	assertAvatarCached(t, cache, "miss@test", false)
	assertAvatarCached(t, cache, "hit@test", true)

	backdateAvatar(t, caches.db, "hit@test", "-31 days")
	assertAvatarCached(t, cache, "hit@test", false)

	// Re-storing resets the age
	if err := cache.Store(ctx, "hit@test", []byte("png-data"), "image/png"); err != nil {
		t.Fatal(err)
	}
	assertAvatarCached(t, cache, "hit@test", true)
}
