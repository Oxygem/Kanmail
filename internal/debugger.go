package internal

import (
	"bufio"
	"context"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/emersion/go-imap/v2"
	"github.com/rs/zerolog"

	"github.com/oxygem/kanmail/internal/constants"
	"github.com/oxygem/kanmail/internal/emails"
	"github.com/oxygem/kanmail/internal/types"
)

func RunDebugger(log zerolog.Logger) {
	kanmail := NewKanmailApp(nil, log, 0)
	defer kanmail.Caches.Close()

	ctx := log.WithContext(context.Background())

	log.Info().Msg("Kanmail v2 debugger started")

	scanner := bufio.NewScanner(os.Stdin)
	for scanner.Scan() {
		tokens := strings.Split(scanner.Text(), " ")
		cmd := tokens[0]

		switch cmd {
		case "quit":
			return

		case "settings":
			log.Debug().Any("settings", kanmail.SettingsService.GetSettings(ctx)).Msg("")

		case "settings-reapply":
			kanmail.SettingsService.PutSettings(ctx, kanmail.SettingsService.GetSettings(ctx))
			log.Debug().Msg("Settings reapplied")

		case "print-secret-constants":
			log.Debug().
				Str("BACKEND_API_KEY", constants.BACKEND_API_KEY).
				Str("OAUTH_GMAIL_CLIENT_ID", constants.OAUTH_GMAIL_CLIENT_ID).
				Str("OAUTH_GMAIL_CLIENT_SECRET", constants.OAUTH_GMAIL_CLIENT_SECRET).
				Str("OAUTH_OUTLOOK_CLIENT_ID", constants.OAUTH_OUTLOOK_CLIENT_ID).
				Str("OAUTH_OUTLOOK_CLIENT_SECRET", constants.OAUTH_OUTLOOK_CLIENT_SECRET).
				Msg("")

		case "find-message-ids":
			account := kanmail.AccountsService.GetOrCreateAccount(ctx, types.AccountName(tokens[1]))
			if account == nil {
				log.Error().Msg("Unknown account")
				continue
			}
			emails, err := account.FindMessageIDs(ctx, tokens[2:])
			log.Debug().Err(err).Any("emails", emails).Msg("")

		case "search-references":
			account := kanmail.AccountsService.GetOrCreateAccount(ctx, types.AccountName(tokens[1]))
			if account == nil {
				log.Error().Msg("Unknown account")
				continue
			}
			refs := make([]emails.EmailRef, 0)
			for _, t := range tokens[2:] {
				refs = append(refs, emails.EmailRef{
					Reference: t,
					SentSince: time.Now().Add(-(time.Hour * 24 * 30)),
				})
			}
			emails, err := account.SearchReferences(ctx, refs)
			log.Debug().Err(err).Any("emails", emails).Msg("")

		// Cache
		case "get-cached-uids":
			if len(tokens) != 3 {
				log.Error().Msg("Invalid arguments")
				continue
			}
			uidValidity, uidsStartAt, uids, err := kanmail.Caches.FolderUIDCache.Get(ctx, types.AccountName(tokens[1]), types.FolderName(tokens[2]))
			log.Debug().
				Err(err).
				Uint32("uid_validity", uidValidity).
				Uint32("uids_start_at", uint32(uidsStartAt)).
				Any("uids", uids).
				Msg("UIDs data")
		case "get-cached-email":
			if len(tokens) != 4 {
				log.Error().Msg("Invalid arguments")
				continue
			}
			uid, _ := strconv.Atoi(tokens[3])
			email, err := kanmail.Caches.FolderEmailCache.Get(ctx, types.AccountName(tokens[1]), types.FolderName(tokens[2]), imap.UID(uid))
			log.Debug().Err(err).Any("email", email).Msg("")

		// Folder
		case "fetch-email":
			if len(tokens) != 4 {
				log.Error().Msg("Invalid arguments")
				continue
			}
			uid, _ := strconv.Atoi(tokens[3])
			account := kanmail.AccountsService.GetOrCreateAccount(ctx, types.AccountName(tokens[1]))
			if account == nil {
				log.Error().Msg("Unknown account")
				continue
			}
			folder := account.GetFolder(types.FolderName(tokens[2]))
			email, err := folder.FetchEmail(ctx, imap.UID(uid))
			log.Debug().Err(err).Any("email", email).Msg("")

		default:
			log.Error().Msgf("Unknown command: %s", cmd)
		}
	}
}
