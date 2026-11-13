package upgrades

import (
	"context"
	"path"
	"testing"

	"github.com/emersion/go-imap/v2"
	"github.com/rs/zerolog"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/oxygem/kanmail/internal/caches"
	"github.com/oxygem/kanmail/internal/types"
)

func TestRefetchAmbiguousBodyParts(t *testing.T) {
	c := caches.NewCaches(zerolog.Nop(), path.Join(t.TempDir(), "caches.db"))
	t.Cleanup(func() { c.Close() })
	ctx := context.Background()

	textPart := types.BodyPart{PartStr: "1", Type: "text/plain"}
	htmlPart := types.BodyPart{PartStr: "2", Type: "text/html"}
	image := types.BodyPart{PartStr: "2", Type: "image/png", Description: "image.png"}
	logAttachment := types.BodyPart{PartStr: "3", Type: "text/plain", Description: "server.log"}

	emailParts := map[imap.UID][]types.BodyPart{
		1: {textPart, htmlPart},
		2: {textPart, image, {PartStr: "3", Type: "text/plain"}},
		3: {htmlPart, logAttachment},
		4: {textPart, image},
	}
	for uid, parts := range emailParts {
		require.NoError(t, c.FolderEmailCache.Store(ctx, &types.Email{
			AccountID:  "account",
			FolderName: "INBOX",
			UID:        uid,
			Parts:      parts,
		}))
	}

	require.NoError(t, refetchAmbiguousBodyParts(ctx, c))

	for uid, kept := range map[imap.UID]bool{1: true, 2: false, 3: false, 4: true} {
		email, err := c.FolderEmailCache.Get(ctx, "account", "INBOX", uid)
		require.NoError(t, err)
		assert.Equal(t, kept, email != nil, "uid %d", uid)
	}
}
