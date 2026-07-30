package emails

import (
	"bytes"
	"context"
	"fmt"
	"slices"
	"strings"
	"sync"
	"time"
	"unicode"

	"github.com/emersion/go-imap/v2"
	"github.com/microcosm-cc/bluemonday"
	"github.com/rs/zerolog"
	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/extension"

	"github.com/oxygem/kanmail/internal/caches"
	"github.com/oxygem/kanmail/internal/emails/imapinterface"
	"github.com/oxygem/kanmail/internal/types"
	"github.com/oxygem/kanmail/internal/util"
)

const (
	// Folders over this size will have their UIDs paginated rather than loaded all at once
	uidSearchPaginateThreshold = 1000
)

// Removes all HTML for excerpt generation
var htmlStripper = bluemonday.StrictPolicy()

// Cleans partial-HTML content for display
// allow cid:xyz img.src attributes
// https://www.getresponse.com/blog/supported-html-tags-in-email-clients
var htmlCleaner = bluemonday.UGCPolicy().AllowURLSchemes("cid")

// Cleans full-HTML documents (typically marketing emails) for display in the
// untrusted iframe: strips all script vectors (script/event handlers/javascript:
// URLs) while keeping the presentational markup these emails rely on
var fullHTMLCleaner = newFullHTMLCleaner()

func newFullHTMLCleaner() *bluemonday.Policy {
	p := bluemonday.UGCPolicy()
	p.AllowDataURIImages()
	p.AllowURLSchemes("cid")
	p.AllowAttrs("style").Globally()
	p.AllowAttrs(
		"width", "height", "align", "valign", "bgcolor", "background",
		"border", "cellpadding", "cellspacing",
	).Globally()
	p.AllowElements("center", "font")
	p.AllowAttrs("color", "face", "size").OnElements("font")
	return p
}

// makeErrorExcerpt reduces an error to letters, numbers and single spaces.
// Excerpts are rendered as HTML by the frontend, and errors here carry text
// straight from the IMAP server, which never goes through the HTML cleaners.
func makeErrorExcerpt(err error) string {
	var out strings.Builder
	var lastWasSpace bool

	for _, r := range err.Error() {
		switch {
		case unicode.IsLetter(r) || unicode.IsNumber(r):
			out.WriteRune(r)
			lastWasSpace = false
		case unicode.IsSpace(r) && !lastWasSpace && out.Len() > 0:
			out.WriteRune(' ')
			lastWasSpace = true
		}
	}

	return strings.TrimSpace(out.String())
}

// Convert text/plain -> safe markdown HTML
var markdownConverter = goldmark.New(
	goldmark.WithExtensions(extension.Linkify, extension.TaskList),
)

// A folder represents a single IMAP mailbox
// The folder tracks the UID list from the last 30 days initially, this is used
// to paginate from. When we hit the end of the list the next 30 days is fetched
// and so on.
//
// For sync we refetch all UIDs up to the one we last sent to the frontend, such
// that any deletes for messages the frontend is aware of are correctly passed.
//
// The folder also has a sparse UID -> email cache that is poulated a) as we
// paginate the UID list and b) as we fetch messages directly via ID. We must
// pre-check if a message has been deleted on the server before using any cached
// value *unless* the UID is ahead of the last one sent to the frontend, in that
// case the sync action will capture the message deletion.
type Folder struct {
	account *Account
	imap    *IMAPConnectionPool
	caches  *caches.Caches

	Name      types.FolderName
	AliasName types.FolderName
	AccountID types.AccountID

	lock sync.Mutex

	// UIDs in sync w/server, last 90 days, used for pagination + sync
	uids        *uidList
	uidValidity uint32
	uidsStartAt imap.UID
	// Most recent (lowest) UID sent to the frontend for this session, used to paginate
	lastSentUID imap.UID
	// Date of the lowest email sent to frontend, used to prevent spurious forward lookups for
	// unreferenced message IDs.
	lastSentDate time.Time

	// The mailbox doesn't exist on the server, so the folder stands in as an
	// empty one rather than erroring
	missing bool
}

func NewFolder(account *Account, name types.FolderName, aliasName types.FolderName) *Folder {
	return &Folder{
		account: account,
		imap:    account.imap,
		caches:  account.caches,

		AccountID: account.ID,
		Name:      name,
		AliasName: aliasName,

		// Matches reset() - a future date means nothing has been sent yet
		lastSentDate: time.Now().Add(24 * time.Hour),
	}
}

func (f *Folder) reset() {
	// Reset all the internal data
	f.uids = nil
	f.uidValidity = 0
	f.uidsStartAt = 0
	f.lastSentUID = imap.UID(0)
	f.lastSentDate = time.Now().Add(24 * time.Hour)
	f.missing = false
}

// markMissing turns the folder into an empty stand-in for a mailbox that isn't
// on the server, so reads behave as an empty folder instead of erroring. Must be
// called with the lock held.
func (f *Folder) markMissing(ctx context.Context) {
	f.uids = NewUIDList()
	f.uidsStartAt = 0
	f.lastSentUID = imap.UID(0)
	f.lastSentDate = time.Now().Add(24 * time.Hour)
	f.missing = true

	// Drop the cached UID list, it's what makes ensureInitialized skip the select
	// probe on the next launch. Cached emails are unreachable without it, so they
	// stay put - if the folder comes back we avoid re-downloading everything.
	if err := f.caches.FolderUIDCache.Delete(ctx, f.AccountID, f.Name); err != nil {
		zerolog.Ctx(ctx).Err(err).Msg("Failed to delete cached UIDs for missing folder")
	}
}

func (f *Folder) AppendEmail(ctx context.Context, b bytes.Buffer) (imap.UID, error) {
	var assignedUID imap.UID
	err := f.imap.WithPriorityConnection(ctx, func(conn imapinterface.IMAPClient) error {
		return f.createDestinationAndRetry(ctx, conn, f, func() error {
			uid, err := appendMessage(conn, string(f.Name), b.Bytes())
			assignedUID = uid
			return err
		})
	})
	return assignedUID, err
}

func appendMessage(conn imapinterface.IMAPClient, mailbox string, raw []byte) (imap.UID, error) {
	appendCmd := conn.Append(mailbox, int64(len(raw)), nil)
	if _, err := appendCmd.Write(raw); err != nil {
		return 0, fmt.Errorf("failed to write message: %w", err)
	} else if err := appendCmd.Close(); err != nil {
		return 0, fmt.Errorf("failed to close message: %w", err)
	}
	data, err := appendCmd.Wait()
	if err != nil {
		return 0, fmt.Errorf("APPEND command failed: %w", err)
	}
	if data != nil {
		return data.UID, nil
	}
	return 0, nil
}

// createDestinationAndRetry runs fn, creating the destination mailbox and
// retrying once when the server reports it doesn't exist. Mailboxes are only
// created here, when mail is actually written into them.
func (f *Folder) createDestinationAndRetry(
	ctx context.Context,
	conn imapinterface.IMAPClient,
	dest *Folder,
	fn func() error,
) error {
	err := fn()
	if err == nil || !mailboxMissing(ctx, conn, dest.Name, err) {
		return err
	}

	log := zerolog.Ctx(ctx)
	log.Info().Str("folder", string(dest.Name)).Msg("Creating missing destination folder")
	if createErr := conn.Create(string(dest.Name), nil).Wait(); createErr != nil {
		// Could just be another client (or another move) getting there first,
		// the retry below decides whether this actually mattered
		log.Warn().Err(createErr).Str("folder", string(dest.Name)).Msg("Failed to create folder")
	}

	return fn()
}

// Fetch & search (does not alter folder state, no lock)
//

func (f *Folder) FetchEmail(ctx context.Context, uid imap.UID) (*types.Email, error) {
	if emails, err := f.getOrFetchEmails(ctx, []imap.UID{uid}, f.imap.WithFolderPriorityConnection); err != nil {
		return nil, fmt.Errorf("failed to fetch email: %w", err)
	} else if len(emails) != 1 {
		return nil, nil
	} else {
		return emails[0], nil
	}
}

// Fetches *text/plain or text/html* email parts, not suitable for attachments
func (f *Folder) FetchEmailAndContent(ctx context.Context, uid imap.UID) (*types.Email, *BodyPartResp, error) {
	emails, err := f.getOrFetchEmails(ctx, []imap.UID{uid}, f.imap.WithFolderPriorityConnection)
	if err != nil {
		return nil, nil, err
	} else if len(emails) != 1 {
		return nil, nil, fmt.Errorf("no email found with uid: %d", uid)
	}

	parts := FetchPartsMap{}
	if emails[0].PartHTML != nil {
		parts[uid] = *emails[0].PartHTML
	} else if emails[0].PartText != nil {
		parts[uid] = *emails[0].PartText
	} else {
		return nil, nil, fmt.Errorf("no suitable content part for email with uid: %d", uid)
	}

	resp, err := f.getOrFetchEmailParts(ctx, parts, f.imap.WithFolderPriorityConnection)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to get email parts: %w", err)
	}
	return emails[0], f.makeBodyPartResp(ctx, resp[uid]), nil
}

func (f *Folder) FetchEmailContentParts(ctx context.Context, parts FetchPartsMap) (FetchPartsResp, error) {
	resp, err := f.getOrFetchEmailParts(ctx, parts, f.imap.WithFolderPriorityConnection)
	fetched := make(FetchPartsResp, len(resp))
	for id, r := range resp {
		fetched[id] = f.makeBodyPartResp(ctx, r)
	}
	return fetched, err
}

func (f *Folder) FetchEmailPartData(ctx context.Context, parts FetchPartsMap) (fetchPartsResp, error) {
	resp, err := f.getOrFetchEmailParts(ctx, parts, f.imap.WithFolderPriorityConnection)
	for id, r := range resp {
		r.Bytes = f.decodePart(ctx, r)
		resp[id] = r
	}
	return resp, err
}

// capGmailExt1 is the Gmail IMAP extension advertising X-GM-RAW/X-GM-* search keys.
const capGmailExt1 = imap.Cap("X-GM-EXT-1")

// buildSearchCriteria uses Gmail's X-GM-RAW search syntax when the server
// supports it (giving full Gmail query support: from:, has:attachment, etc.),
// otherwise parses the same Gmail-style syntax into standard IMAP criteria.
func buildSearchCriteria(conn imapinterface.IMAPClient, search string) *imap.SearchCriteria {
	if conn.Caps().Has(capGmailExt1) {
		return &imap.SearchCriteria{GmailRaw: search}
	}
	return parseSearchQuery(search, time.Now())
}

// SearchCachedEmails searches the local email cache only - no network - so
// results render instantly while the server-side SearchEmails runs. Always
// uses the parsed criteria (even for Gmail accounts, whose server search uses
// X-GM-RAW); criteria the cache can't answer exactly return no results.
func (f *Folder) SearchCachedEmails(ctx context.Context, search string, limit int) ([]*types.Email, error) {
	query := parseSearchQuery(search, time.Now())
	emails, err := f.caches.FolderEmailCache.Search(ctx, f.AccountID, f.Name, query, limit)
	zerolog.Ctx(ctx).Debug().
		Err(err).
		Int("emails", len(emails)).
		Str("query", search).
		Msg("Searched cached emails")
	return emails, err
}

func (f *Folder) SearchEmails(ctx context.Context, search string, limit int) ([]*types.Email, error) {
	var emails []*types.Email
	if err := f.searchWithConnection(ctx, f.imap.WithFolderPriorityConnection, func(conn imapinterface.IMAPClient) error {
		criteria := buildSearchCriteria(conn, search)
		res, err := conn.UIDSearch(criteria, nil).Wait()
		if err != nil {
			return err
		}

		uids := res.AllUIDs()

		if limit > 0 && len(uids) > limit {
			// Keep the newest (highest UID) matches
			slices.Sort(uids)
			uids = uids[len(uids)-limit:]
		}

		emails, err = f.getOrFetchEmails(ctx, uids, connFunc(conn))
		return err
	}); err != nil {
		return nil, err
	}

	return emails, nil
}

// searchWithConnection runs a search against the folder, quietly doing nothing
// when the mailbox isn't on the server - searches are speculative lookups (often
// across folders that only exist on some accounts), a missing one has no results.
func (f *Folder) searchWithConnection(
	ctx context.Context,
	connFn func(context.Context, types.FolderName, func(conn imapinterface.IMAPClient) error) error,
	fn func(conn imapinterface.IMAPClient) error,
) error {
	err := connFn(ctx, f.Name, fn)
	if isMissingMailboxErr(err) {
		zerolog.Ctx(ctx).Debug().Str("folder", string(f.Name)).Msg("Skipped search in missing folder")
		return nil
	}
	return err
}

func (f *Folder) SearchMessageIDs(ctx context.Context, messageIDs []string) (map[string]*types.Email, []string, error) {
	log := zerolog.Ctx(ctx)
	log.Debug().
		Int("message_ids", len(messageIDs)).
		Msg("Searching for messageIDs")

	results := make(map[string]*types.Email, len(messageIDs))
	err := f.searchWithConnection(ctx, f.imap.WithFolderBackgroundConnection, func(conn imapinterface.IMAPClient) error {
		// Because imap we have to search each message ID one by one
		uidToMsgID := make(map[imap.UID]string, len(messageIDs))
		for _, msgid := range messageIDs {
			if msgid == "" {
				log.Warn().Msg("Skip search for empty messageID")
				continue
			}
			log.Trace().Str("message_id", msgid).Msg("Search by messageID")
			res, err := conn.UIDSearch(&imap.SearchCriteria{
				Header: []imap.SearchCriteriaHeaderField{{
					Key:   "Message-ID",
					Value: msgid,
				}},
			}, nil).Wait()
			if err != nil {
				return err
			}
			uids := res.AllUIDs()
			if len(uids) > 1 {
				zerolog.Ctx(ctx).Error().Msg("Got multiple UIDs for one messageID! Ignoring second...")
			} else if len(uids) == 0 {
				continue
			}
			uidToMsgID[uids[0]] = msgid
		}

		if len(uidToMsgID) == 0 {
			return nil
		}

		// Now fetch all the emails at once
		uids := make([]imap.UID, 0, len(uidToMsgID))
		for i := range uidToMsgID {
			uids = append(uids, i)
		}

		emails, err := f.getOrFetchEmails(ctx, uids, connFunc(conn))
		if err != nil {
			return err
		}

		for _, email := range emails {
			results[uidToMsgID[email.UID]] = email
		}

		return nil
	})

	missing := make([]string, 0)
	for _, msgid := range messageIDs {
		if _, ok := results[msgid]; !ok {
			missing = append(missing, msgid)
		}
	}

	log.Info().
		Int("message_ids", len(results)).
		Int("missing_message_ids", len(missing)).
		Msg("Found messageIDs")
	return results, missing, err
}

type EmailRef struct {
	Reference string    `json:"reference"`
	SentSince time.Time `json:"sentSince"`
}

func (f *Folder) SearchReferences(ctx context.Context, references []EmailRef) (map[string]*types.Email, []EmailRef, error) {
	log := zerolog.Ctx(ctx)
	log.Debug().
		Int("references", len(references)).
		Msg("Searching for references")

	inDateRefs := make([]EmailRef, 0, len(references))
	var skipped int
	for _, ref := range references {
		if ref.SentSince.Before(f.lastSentDate) {
			inDateRefs = append(inDateRefs, ref)
		} else {
			skipped++
		}
	}
	if skipped > 0 {
		log.Trace().Int("skipped", skipped).Msg("Skip references ahead of last sent date")
	}

	var emails []*types.Email
	if err := f.searchWithConnection(ctx, f.imap.WithFolderBackgroundConnection, func(conn imapinterface.IMAPClient) error {
		uids := make([]imap.UID, 0, len(inDateRefs))
		for _, ref := range inDateRefs {
			log.Trace().
				Str("reference", ref.Reference).
				Time("sent_since", ref.SentSince).
				Msg("Search by reference to messageID")

			// Search for any emails with matching In-Reply-To header sent *after* the email it's
			// referencing.
			// FIXME Note we don't search References here - doesn't work (gmail?)
			res, err := conn.UIDSearch(&imap.SearchCriteria{
				SentSince: ref.SentSince,
				Header: []imap.SearchCriteriaHeaderField{{
					Key:   "In-Reply-To",
					Value: ref.Reference,
				}},
			}, nil).Wait()
			if err != nil {
				return err
			} else {
				uids = append(uids, res.AllUIDs()...)
			}
		}

		if len(uids) == 0 {
			return nil
		}

		if ems, err := f.getOrFetchEmails(ctx, uids, connFunc(conn)); err != nil {
			return err
		} else {
			emails = ems
			return nil
		}
	}); err != nil {
		return nil, nil, err
	}

	results := make(map[string]*types.Email, len(references))
	missing := make([]EmailRef, 0, len(references))
	for _, ref := range references {
		var hasRef bool
		for _, email := range emails {
			if email.MessageID == ref.Reference {
				hasRef = true
				results[ref.Reference] = email
				break
			}
		}
		if !hasRef {
			missing = append(missing, ref)
		}
	}

	log.Info().
		Int("references", len(references)).
		Int("skipped", len(references)-len(inDateRefs)).
		Int("missing", len(missing)).
		Int("found", len(emails)).
		Msg("Found references")

	return results, missing, nil
}

// Sync & pagination (alters folder state, uses lock)
//

// Pagination state sent to the frontend, must be called with the folder lock
// held and the folder initialized.
func (f *Folder) paginateMeta() PaginateRespMeta {
	return PaginateRespMeta{
		Count:        f.uids.Length(),
		LastSentDate: f.lastSentDate,
		// Exhausted when the UID list covers the whole folder (uidsStartAt 0) and
		// nothing remains below lastSentUID. When nothing has been sent yet
		// lastSentUID-1 wraps to maxuint32, matching PaginateEmails.
		Exhausted: f.uidsStartAt == 0 && len(f.uids.PaginateFrom(f.lastSentUID-1, 1)) == 0,
		Missing:   f.missing,
	}
}

func (f *Folder) PaginateEmails(ctx context.Context, options PaginateOptions) (*PaginateResp, error) {
	f.lock.Lock()
	defer f.lock.Unlock()

	log := zerolog.Ctx(ctx)

	if options.BatchSize == 0 {
		options.BatchSize = 15
		log.Warn().Msg("Using default batch size")
		// return nil, errors.New("batch size must be >0")
	}

	if options.Reset {
		f.reset()
		log.Info().Msg("Reset folder")
	}

	if err := f.ensureInitialized(ctx); err != nil {
		return nil, err
	}

	// Get the next batch size UIDs - funny note here when we first start lastSentUID is 0, which
	// less 1 is maxuint32, which is ideal.
	uids := f.uids.PaginateFrom(f.lastSentUID-1, options.BatchSize)
	log.Trace().
		Int("uids_selected", len(uids)).
		Int("uids_total", f.uids.Length()).
		Msg("Paginated uids")

	if len(uids) == 0 {
		if err := f.fetchMoreUIDs(ctx); err != nil {
			return nil, err
		}
		// Re-paginate with the now extended UIDs
		uids = f.uids.PaginateFrom(f.lastSentUID-1, options.BatchSize)
		log.Trace().Int("uids", len(uids)).Msg("Paginated extended uids")
	}

	if len(uids) == 0 {
		return &PaginateResp{
			Meta: f.paginateMeta(),
		}, nil
	}

	emails, err := f.getOrFetchEmails(ctx, uids, f.imap.WithFolderConnection)
	if err != nil {
		return nil, err
	}

	// Set last sent as the lowest UID returned for next pagination batch
	f.lastSentUID = uids[len(uids)-1]
	// Set the last send date
	// NOTE: this is trusting the server provided date
	for _, email := range emails {
		if email.Date.Before(f.lastSentDate) {
			f.lastSentDate = email.Date
		}
	}
	log.Debug().
		Time("last_sent_date", f.lastSentDate).
		Uint32("last_sent_uid", uint32(f.lastSentUID)).
		Msg("Updated last sent UID")

	return &PaginateResp{
		Emails: emails,
		Meta:   f.paginateMeta(),
	}, nil
}

// Fetch any new emails and check for deletions of anything we've sent to the backend
func (f *Folder) SyncEmails(ctx context.Context) (*SyncResp, error) {
	f.lock.Lock()
	defer f.lock.Unlock()

	log := zerolog.Ctx(ctx)

	if err := f.ensureInitialized(ctx); err != nil {
		return nil, err
	}

	var resp SyncResp

	err := f.imap.WithConnection(ctx, func(conn imapinterface.IMAPClient) error {
		selectData, missing, err := selectFolder(ctx, conn, f.Name)
		if err != nil {
			return fmt.Errorf("failed to select folder: %s/%s: %w", f.account.Name, f.Name, err)
		}

		// A mailbox that isn't there stands in as an empty folder - tell the
		// frontend to drop anything we sent it, then keep quietly probing so the
		// folder comes back to life if it's (re)created.
		if missing {
			if !f.missing {
				log.Warn().Msg("Folder no longer exists, treating as empty")
				resp.DeletedUIDs = f.uids.AllGreaterThan(f.lastSentUID)
				f.markMissing(ctx)
			}
			resp.Meta = f.paginateMeta()
			return nil
		}
		defer func() { conn.Unselect().Wait() }()

		if f.missing {
			log.Info().Msg("Folder exists again, resetting folder")
			// Only nuke the cache if the mailbox identity changed, otherwise the
			// cached emails are still good
			if f.uidValidity != selectData.UIDValidity {
				if err := f.caches.DeleteByFolder(ctx, f.AccountID, f.Name); err != nil {
					return fmt.Errorf("failed to delete folder in cache: %s: %w", f.Name, err)
				}
			}
			f.reset()
			resp.Meta = PaginateRespMeta{LastSentDate: f.lastSentDate}
			return nil
		}

		// If UIDVALIDITY has changed from our cached version we must drop everything we know about
		// the folder and re-fetch it from the server.
		if f.uidValidity != selectData.UIDValidity {
			log.Warn().
				Uint32("uidvalidity_old", f.uidValidity).
				Uint32("uidvalidity_new", selectData.UIDValidity).
				Msg("Folder uidvalidity changed, resetting folder")
			if err := f.caches.DeleteByFolder(ctx, f.AccountID, f.Name); err != nil {
				return fmt.Errorf("failed to delete folder in cache: %s: %w", f.Name, err)
			}
			resp.DeletedUIDs = f.uids.AllGreaterThan(f.lastSentUID)
			f.reset()
			// Post-reset the count is unknown and the (future) lastSentDate tells
			// the frontend nothing has been sent yet
			resp.Meta = PaginateRespMeta{LastSentDate: f.lastSentDate}
			return nil
		}

		// Using lastSentUID in our search here, meaning as we paginate the folder each subsequent
		// sync will search a larger range. We do this so we can detect when emails have been
		// removed that we've passed to the frontend. Because the people rarely scroll far back
		// through folders this penalty is a non-issue.
		uidSearchSet := imap.UIDSet{}
		uidSearchSet.AddRange(f.lastSentUID, 0) // last seen -> *

		data, err := conn.UIDSearch(&imap.SearchCriteria{
			UID: []imap.UIDSet{uidSearchSet},
		}, nil).Wait()
		if err != nil {
			return fmt.Errorf("failed to search emails: %v: %w", uidSearchSet, err)
		}
		newUIDs := data.AllUIDs()
		log.Trace().
			Int("new_uids", len(newUIDs)).
			Any("range", uidSearchSet).
			Msg("Fetched updated UIDs")

		if len(newUIDs) > uidSearchPaginateThreshold {
			log.Warn().
				Int("new_uids", len(newUIDs)).
				Msg("Got too many new UIDs during sync, resetting folder")
			if err := f.caches.FolderUIDCache.Delete(ctx, f.AccountID, f.Name); err != nil {
				return fmt.Errorf("failed to delete cached UIDs in folder: %s: %w", f.Name, err)
			}
			resp.DeletedUIDs = f.uids.AllGreaterThan(f.lastSentUID)
			f.reset()
			resp.Meta = PaginateRespMeta{LastSentDate: f.lastSentDate}
			return nil
		}

		added, removed, unchanged := f.uids.UpdateFrom(ctx, f.lastSentUID, NewUIDList(newUIDs...))
		resp.Meta = f.paginateMeta()

		log.Info().
			Int("added", len(added)).
			Int("removed", len(removed)).
			Int("unchanged", len(unchanged)).
			Uint32("uid_max", uint32(f.uids.Max())).
			Uint32("uid_min", uint32(f.uids.Min())).
			Uint32("last_sent", uint32(f.lastSentUID)).
			Msg("Updated UID set")

		if len(added) > 0 || len(removed) > 0 {
			emails, err := f.getOrFetchEmails(ctx, added, connFunc(conn))
			if err != nil {
				return fmt.Errorf("failed to fetch new emails: %w", err)
			} else if err := f.storeUIDs(ctx); err != nil {
				return fmt.Errorf("failed to store updated UIDs: %w", err)
			} else {
				log.Debug().Int("uids", f.uids.Length()).Msg("Stored updated UID list")
				resp.Emails = emails
				resp.DeletedUIDs = removed
			}

			// Drop removed from the cache
			for _, uid := range removed {
				if err := f.caches.FolderEmailCache.Delete(ctx, f.AccountID, f.Name, uid); err != nil {
					return fmt.Errorf("failed to delete email: %w", err)
				}
			}
		}

		// Now update flags for unchanged emails
		flags, err := f.fetchEmailFlagsWithConnection(ctx, conn, unchanged)
		if err != nil {
			return fmt.Errorf("failed to fetch email flags: %w", err)
		}
		for uid, flags := range flags {
			old := false
			email, err := f.caches.FolderEmailCache.Get(ctx, f.AccountID, f.Name, uid)
			if err != nil {
				return err
			} else if email == nil {
				if !f.caches.IsDisabled() {
					// Should be impossible?
					log.Error().
						Uint32("uid", uint32(uid)).
						Msg("No email in cache for flag sync")
				}
				continue
			}
			// If the remote version is read, check our cached value, if changed -> send
			old = slices.Contains(email.Flags, imap.FlagSeen)
			new := slices.Contains(flags, imap.FlagSeen)
			if new == old {
				continue
			} else if new && !old {
				// Become read (!seen -> seen)
				email.Flags = append(email.Flags, imap.FlagSeen)
				if err := f.caches.FolderEmailCache.Upsert(ctx, email); err != nil {
					return err
				}
				resp.ReadUIDs = append(resp.ReadUIDs, uid)
			} else if !new && old {
				// Become unread (seen -> !seen)
				newFlags := make([]imap.Flag, 0, len(email.Flags))
				for _, flag := range email.Flags {
					if flag != imap.FlagSeen {
						newFlags = append(newFlags, flag)
					}
				}
				email.Flags = newFlags
				if err := f.caches.FolderEmailCache.Upsert(ctx, email); err != nil {
					return err
				}
				resp.UnreadUIDs = append(resp.UnreadUIDs, uid)
			}
		}

		return nil
	})

	return &resp, err
}

func (f *Folder) storeUIDs(ctx context.Context) error {
	return f.caches.FolderUIDCache.Store(ctx, f.AccountID, f.Name, f.uidValidity, f.uidsStartAt, f.uids.All())
}

// Used to lazily initialize the folder by pulling the UID list from cache or fetching it from the
// network if we have no cache. No lock, *not* gorotuine/thread safe.
func (f *Folder) ensureInitialized(ctx context.Context) error {
	if f.uids != nil {
		return nil
	}
	log := zerolog.Ctx(ctx)

	// Try to load from cache
	if uidValidity, uidsStartAt, cached, err := f.caches.FolderUIDCache.Get(ctx, f.AccountID, f.Name); err != nil {
		log.Err(err).Msg("Failed to check for cached UIDs")
	} else if cached != nil {
		f.uids = NewUIDList(cached...)
		f.uidValidity = uidValidity
		f.uidsStartAt = uidsStartAt
		f.lastSentUID = f.uids.Max() + 1 // not sent anything yet, so +1 the head of the UID list
		log.Info().
			Int("uids", len(cached)).
			Uint32("uid_validity", uidValidity).
			Msg("Loaded cached UIDs")
		return nil
	}

	return f.imap.WithPriorityConnection(ctx, func(conn imapinterface.IMAPClient) error {
		// Select the folder, populate UIDNEXT + UIDVALIDITY
		selectData, missing, err := selectFolder(ctx, conn, f.Name)
		if err != nil {
			return fmt.Errorf("failed to select folder: %s/%s: %w", f.account.Name, f.Name, err)
		} else if missing {
			// Folders are only created when mail is written into them, so an
			// absent mailbox stands in as an empty one rather than erroring
			log.Warn().Str("folder", string(f.Name)).Msg("Folder does not exist, treating as empty")
			f.markMissing(ctx)
			return nil
		}
		defer func() { conn.Unselect().Wait() }()

		f.missing = false
		f.uidValidity = selectData.UIDValidity
		log.Info().
			Uint32("uidnext", uint32(selectData.UIDNext)).
			Uint32("uidevalidity", selectData.UIDValidity).
			Uint32("size", selectData.NumMessages).
			Msg("Initialized from select")

		// If the size of the folder is large initially only fetch the highest X UIDs, otherwise
		// get everything. Pagination will extend the UID list if needed.
		searchCriteria := &imap.SearchCriteria{}
		var uidsStartAt imap.UID
		uidSearchSet := imap.UIDSet{}

		if selectData.NumMessages > uidSearchPaginateThreshold {
			uidsStartAt = selectData.UIDNext - uidSearchPaginateThreshold
			uidSearchSet.AddRange(uidsStartAt, 0)
			searchCriteria.UID = []imap.UIDSet{uidSearchSet}
		}

		log.Debug().
			Uint32("last_sent", uint32(f.lastSentUID)).
			Any("range", uidSearchSet).
			Msg("Searching for initial UIDs")

		searchData, err := conn.UIDSearch(searchCriteria, nil).Wait()
		if err != nil {
			return err
		}

		uids := searchData.AllUIDs()
		f.uids = NewUIDList(uids...)
		f.uidsStartAt = uidsStartAt
		if len(uids) == 0 {
			f.lastSentUID = selectData.UIDNext
		} else {
			f.lastSentUID = f.uids.Max() + 1 // not sent anything yet, so +1 the head of the UID list
		}

		if err := f.storeUIDs(ctx); err != nil {
			return fmt.Errorf("failed to store UIDs: %w", err)
		}

		log.Info().
			Int("uids", f.uids.Length()).
			Uint32("uid_max", uint32(f.uids.Max())).
			Uint32("uid_min", uint32(f.uids.Min())).
			Msg("Fetched initial UID list")
		return nil
	})
}

func (f *Folder) fetchMoreUIDs(ctx context.Context) error {
	log := zerolog.Ctx(ctx)

	if f.uidsStartAt == 0 {
		log.Warn().
			Msg("Ran out of UIDs to paginate (pre select)")
		return nil
	}

	err := f.imap.WithFolderConnection(ctx, f.Name, func(conn imapinterface.IMAPClient) error {
		for {
			if f.uidsStartAt == 0 {
				log.Warn().
					Msg("Ran out of UIDs to paginate (post select)")
				return nil
			}

			// Clamp to zero (= exhausted) rather than underflowing when the remaining UID
			// range is smaller than the pagination threshold
			var newUIDsStartAt imap.UID
			if f.uidsStartAt > uidSearchPaginateThreshold {
				newUIDsStartAt = f.uidsStartAt - uidSearchPaginateThreshold
			}

			uidSearchSet := imap.UIDSet{}
			// UID 0 means * in a range, so the search itself must start at 1
			uidSearchSet.AddRange(max(newUIDsStartAt, 1), f.uidsStartAt)
			searchCriteria := &imap.SearchCriteria{UID: []imap.UIDSet{uidSearchSet}}

			log.Debug().
				Uint32("last_sent", uint32(f.lastSentUID)).
				Any("range", uidSearchSet).
				Msg("Searching for more UIDs")

			searchData, err := conn.UIDSearch(searchCriteria, nil).Wait()
			if err != nil {
				return fmt.Errorf("failed to search UIDs: %w", err)
			}

			newUIDs := searchData.AllUIDs()
			f.uidsStartAt = newUIDsStartAt

			if len(newUIDs) == 0 {
				continue
			}

			f.uids.Extend(NewUIDList(newUIDs...))

			if err := f.storeUIDs(ctx); err != nil {
				return fmt.Errorf("failed to store UIDs: %w", err)
			}

			log.Info().
				Int("total_uids", f.uids.Length()).
				Int("new_uids", len(newUIDs)).
				Msg("Fetched more UIDs")
			return nil
		}
	})

	// The folder disappeared mid-pagination, stand in as empty
	if isMissingMailboxErr(err) {
		log.Warn().Err(err).Msg("Folder does not exist, treating as empty")
		f.markMissing(ctx)
		return nil
	}
	return err
}

// Shared private fetch helpers
//

func (f *Folder) fetchEmailFlagsWithConnection(
	ctx context.Context,
	conn imapinterface.IMAPClient,
	uids []imap.UID,
) (map[imap.UID][]imap.Flag, error) {
	if len(uids) == 0 {
		return nil, nil
	}

	log := zerolog.Ctx(ctx)
	log.Debug().Int("uids", len(uids)).Msg("Fetching email flags")

	res, err := conn.Fetch(imap.UIDSetNum(uids...), &imap.FetchOptions{
		Flags: true,
		UID:   true,
	}).Collect()
	if err != nil {
		return nil, err
	}

	flags := make(map[imap.UID][]imap.Flag, len(res))
	for _, msg := range res {
		flags[msg.UID] = msg.Flags
	}

	return flags, nil
}

func (f *Folder) getOrFetchEmails(
	ctx context.Context,
	uids []imap.UID,
	connFn func(context.Context, types.FolderName, func(imapinterface.IMAPClient) error) error,
) ([]*types.Email, error) {
	log := zerolog.Ctx(ctx)

	emails := make([]*types.Email, 0, len(uids))
	uncachedUIDs := make([]imap.UID, 0, len(uids))

	for _, uid := range uids {
		email, err := f.caches.FolderEmailCache.Get(ctx, f.AccountID, f.Name, uid)
		if err != nil {
			return nil, fmt.Errorf("failed to get email from cache: %d: %w", uid, err)
		} else if email != nil {
			emails = append(emails, email)
		} else {
			uncachedUIDs = append(uncachedUIDs, uid)
		}
	}

	if len(uncachedUIDs) == 0 {
		log.Debug().Int("cached", len(emails)).Msg("Got email headers")
		return emails, nil
	}

	var fetchedEmails []*types.Email
	var fallbackErr error

	if err := connFn(ctx, f.Name, func(conn imapinterface.IMAPClient) (err error) {
		fetchedEmails, err = f.fetchEmailHeadersWithConnection(ctx, conn, uncachedUIDs)
		return err
	}); err != nil {
		if isMissingMailboxErr(err) {
			// Nothing to fetch UID by UID, the mailbox itself has gone
			log.Warn().Msg("Failed to fetch email headers, folder does not exist")
			return emails, nil
		}
		// When any email in the batch failed parsing the whole batch is dropped, see examples:
		// https://github.com/emersion/go-imap/issues/701
		// https://github.com/emersion/go-imap/issues/678
		log.Error().Msg("Failed to batch fetch email headers, trying UID by UID")
		for _, uid := range uncachedUIDs {
			err := connFn(ctx, f.Name, func(conn imapinterface.IMAPClient) error {
				singleEmail, err := f.fetchEmailHeadersWithConnection(ctx, conn, []imap.UID{uid})
				if err != nil {
					log.Err(err).
						Uint32("uid", uint32(uid)).
						Msg("Failed to fetch or parse email header")
					// Create a fake email to show in UI (and allow deleting/moving it)
					fetchedEmails = append(fetchedEmails, &types.Email{
						FolderName:      "", // must be "" to skip caching below
						AccountID:       f.AccountID,
						FolderAliasName: f.AliasName,
						UID:             uid,
						Date:            time.Now(),
						Subject:         "Failed to parse email header",
						Excerpt:         makeErrorExcerpt(err),
					})
				} else if len(singleEmail) == 0 {
					log.Error().
						Uint32("uid", uint32(uid)).
						Msg("No email found with UID")
				} else {
					fetchedEmails = append(fetchedEmails, singleEmail[0])
				}
				return nil
			})
			if err == nil {
				continue
			}
			if isMissingMailboxErr(err) {
				log.Warn().Msg("Failed to fetch email headers, folder does not exist")
				break
			}
			// The callback above always returns nil, so this is the connection itself
			// failing - neither an email nor a placeholder was produced for this UID.
			// The error must reach the caller, otherwise pagination advances past these
			// UIDs and they are silently never shown again.
			fallbackErr = fmt.Errorf("failed to fetch email header: %d: %w", uid, err)
			break
		}
	}

	log.Debug().Int("cached", len(emails)).Int("fetched", len(fetchedEmails)).Msg("Got email headers")

	for _, email := range fetchedEmails {
		if email.FolderName == "" {
			continue
		}
		if err := f.caches.FolderEmailCache.Store(ctx, email); err != nil {
			log.Err(err).Msg("Failed to store folder in cache")
		}
		for _, addr := range email.GetAddresses() {
			if err := f.caches.ContactsCache.Store(ctx, addr); err != nil {
				log.Err(err).Msg("Failed to store contact in cache")
			}
		}
	}

	// Cache anything that did come back before bailing, so a retry is cheap
	if fallbackErr != nil {
		return nil, fallbackErr
	}

	return append(emails, fetchedEmails...), nil
}

func (f *Folder) fetchEmailHeadersWithConnection(
	ctx context.Context,
	conn imapinterface.IMAPClient,
	uids []imap.UID,
) ([]*types.Email, error) {
	if len(uids) == 0 {
		return nil, nil
	}

	log := zerolog.Ctx(ctx)
	log.Trace().Any("uids", uids).Msg("Fetching email headers")

	fetchOpts := &imap.FetchOptions{
		Envelope:     true,
		Flags:        true,
		InternalDate: true,
		RFC822Size:   true,
		UID:          true,
		BodyStructure: &imap.FetchItemBodyStructure{
			Extended: true,
		},
		BodySection: []*imap.FetchItemBodySection{{
			Peek:         true,
			Specifier:    imap.PartSpecifierHeader,
			HeaderFields: []string{"REFERENCES", "LIST-UNSUBSCRIBE", "LIST-UNSUBSCRIBE-POST"},
		}},
	}

	res, err := conn.Fetch(imap.UIDSetNum(uids...), fetchOpts).Collect()
	if err != nil {
		return nil, err
	}

	emails := make([]*types.Email, 0, len(res))
	uidToEmail := make(map[imap.UID]*types.Email, len(res))
	partsToFetch := make(FetchPartsMap, len(res))

	for _, msg := range res {
		email := f.imapMessageToEmail(ctx, msg)
		emails = append(emails, email)
		uidToEmail[msg.UID] = email

		parts, textPart, htmlPart, displayPart := types.ExtractBodyParts(msg.BodyStructure)
		email.Parts = parts
		email.PartText = textPart
		email.PartHTML = htmlPart
		email.PartDisplay = displayPart

		// Prefer text > html for excerpt
		partForExcerpt := htmlPart
		if textPart != nil {
			partForExcerpt = textPart
		}
		if partForExcerpt != nil {
			partsToFetch[email.UID] = *partForExcerpt
		}
	}

	// Note here we're *not* using the cache for parts since we're doing a partial fetch and we'll
	// cache the resulting excerpt.
	parts, err := f.fetchEmailPartsWithConnection(ctx, conn, partsToFetch, FetchEmailPartsOptions{
		peek: true, // don't mark emails as read
		partial: &imap.SectionPartial{
			Size: 15360, // up to first 15kb should be enough body to extract an excerpt
		},
	})
	if err != nil {
		return nil, err
	}

	for uid, partResp := range parts {
		email, exists := uidToEmail[uid]
		if !exists {
			log.Warn().Uint32("uid", uint32(uid)).Msg("Got part response for un-requested UID")
			continue
		}

		// Strip all HTML (whatever the content type)
		b := htmlStripper.SanitizeBytes(f.decodePart(ctx, partResp))
		s := string(b)

		// Now iterate through the string to make a clean excerpt by removing anything that isn't
		// a letter/number/punctuation or single spaces.
		var out strings.Builder
		out.Grow(len(s))
		var lastWasSpace bool

		for _, r := range s {
			if unicode.IsLetter(r) || unicode.IsNumber(r) || unicode.IsPunct(r) {
				out.WriteRune(r)
				lastWasSpace = false
			} else if unicode.IsSpace(r) && !lastWasSpace && out.Len() > 0 {
				if string(r) == "\n" {
					out.WriteString(". ")
				} else {
					out.WriteString(" ")
				}
				lastWasSpace = true
			}
		}
		s = out.String()

		// Trim it down, we don't need >256 characters
		if len(s) > 256 {
			s = s[:256]
		}
		// Finally, drop any invalid UTF8 characters we might have cut
		s = strings.ToValidUTF8(s, "")

		email.Excerpt = s
	}

	return emails, nil
}

func (f *Folder) getOrFetchEmailParts(
	ctx context.Context,
	partsMap FetchPartsMap,
	connFn func(context.Context, types.FolderName, func(imapinterface.IMAPClient) error) error,
) (fetchPartsResp, error) {
	log := zerolog.Ctx(ctx)

	resp := make(fetchPartsResp, len(partsMap))
	missing := make(FetchPartsMap, len(partsMap))

	for uid, part := range partsMap {
		cached, err := f.caches.FolderEmailPartCache.Get(ctx, f.AccountID, f.Name, uid, part.PartID)
		if err != nil {
			return nil, fmt.Errorf("failed to get email part from cache: %d/%v: %w", uid, part.PartID, err)
		} else if cached != nil {
			resp[uid] = bodyPartResp{
				BodyPart: part,
				Bytes:    cached,
			}
		} else {
			missing[uid] = part
		}
	}

	if len(missing) == 0 {
		log.Debug().Int("cached", len(partsMap)).Msg("Got email parts")
		return resp, nil
	}

	var respMissing fetchPartsResp
	if err := connFn(ctx, f.Name, func(conn imapinterface.IMAPClient) (err error) {
		respMissing, err = f.fetchEmailPartsWithConnection(ctx, conn, missing, FetchEmailPartsOptions{})
		return err
	}); err != nil {
		return nil, fmt.Errorf("failed to fetch email parts: %w", err)
	}

	log.Debug().Int("cached", len(resp)).Int("fetched", len(respMissing)).Msg("Got email parts")

	for uid, partResp := range respMissing {
		resp[uid] = partResp

		if err := f.caches.FolderEmailPartCache.Store(
			ctx,
			f.AccountID,
			f.Name,
			uid,
			partResp.PartID,
			partResp.Bytes,
		); err != nil {
			return nil, fmt.Errorf("failed to cache email: %w", err)
		}
	}

	return resp, nil
}

func (f *Folder) fetchEmailPartsWithConnection(
	ctx context.Context,
	conn imapinterface.IMAPClient,
	partsMap FetchPartsMap,
	options FetchEmailPartsOptions,
) (fetchPartsResp, error) {
	log := zerolog.Ctx(ctx)

	// Group UIDs by part for minimal fetch requests
	// Pre-allocate space for 3 since it's pretty normal to fetch parts 1/1.1/2 across many emails
	partStrToUIDs := make(map[string][]imap.UID, 3)
	uidToBodyPart := make(map[imap.UID]types.BodyPart, len(partsMap))

	for uid, part := range partsMap {
		partStr := util.PartIDToString(part.PartID)
		partStrToUIDs[partStr] = append(partStrToUIDs[partStr], uid)
		uidToBodyPart[uid] = part
	}

	resp := make(fetchPartsResp, len(partsMap))

	for partStr, uids := range partStrToUIDs {
		partID := util.StringToPartID(partStr)

		log.Trace().Any("partID", partID).Any("uids", uids).Msg("Fetching email parts")

		res, err := conn.Fetch(imap.UIDSetNum(uids...), &imap.FetchOptions{
			UID: true,
			BodySection: []*imap.FetchItemBodySection{{
				Part:    partID,
				Peek:    options.peek,
				Partial: options.partial,
			}},
		}).Collect()
		if err != nil {
			return nil, err
		}

		for _, msg := range res {
			for _, bs := range msg.BodySection {
				resp[msg.UID] = bodyPartResp{
					BodyPart: uidToBodyPart[msg.UID],
					Bytes:    bs.Bytes,
				}
			}
		}
	}

	return resp, nil
}
