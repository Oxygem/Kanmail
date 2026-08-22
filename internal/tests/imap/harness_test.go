package imaptest

import (
	"context"
	"crypto/tls"
	"fmt"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"runtime"
	"slices"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/emersion/go-imap/v2"
	"github.com/emersion/go-imap/v2/imapclient"
	"github.com/rs/zerolog"
	"github.com/stretchr/testify/require"

	"github.com/oxygem/kanmail/internal/caches"
	"github.com/oxygem/kanmail/internal/emails"
	"github.com/oxygem/kanmail/internal/types"
)

const (
	password = "password"
	// Default max concurrent envs per server (also the number of users a server
	// hands out). A target can lower it - Cyrus returns inconsistent mailbox
	// views under concurrent access across users, so it runs closer to serial.
	defaultConcurrency = 6
	// A ceiling on envs running at once across every server, so the shared
	// Docker host isn't hammered into timing races (each env drives a raw
	// connection plus Kanmail's pool). The per-server user pools cap the rest.
	maxConcurrentEnvs = 12
	// Long enough for a first docker build of the bigger images
	composeTimeout = 10 * time.Minute
	serverTimeout  = 3 * time.Minute
	testTimeout    = 3 * time.Minute
)

var (
	// The servers this run is against, empty when the suite is disabled
	targets []*target
	// Per target, the users not currently borrowed by a test
	userPools = map[string]chan string{}
	// Global env concurrency limiter (see maxConcurrentEnvs)
	envSlots = make(chan struct{}, maxConcurrentEnvs)
	debug    = os.Getenv("KANMAIL_IMAPTEST_DEBUG") != ""
)

func selectTargets(spec string) []*target {
	if spec == "all" {
		return allTargets
	}
	var selected []*target
	for _, name := range strings.Split(spec, ",") {
		tg := findTarget(strings.TrimSpace(name))
		if tg == nil {
			names := make([]string, 0, len(allTargets))
			for _, tg := range allTargets {
				names = append(names, tg.name)
			}
			fmt.Fprintf(os.Stderr, "KANMAIL_IMAPTEST: unknown target %q, have: all, %s\n", name, strings.Join(names, ", "))
			os.Exit(2)
		}
		selected = append(selected, tg)
	}
	return selected
}

func dockerDir() string {
	_, file, _, _ := runtime.Caller(0)
	return filepath.Join(filepath.Dir(file), "docker")
}

// composeUp starts (building if needed) the services behind the targets and
// waits for their healthchecks. Idempotent, so it is safe against servers that
// are already running; composeDown takes them away again once the run is done.
func composeUp(targets []*target) {
	args := []string{
		"compose", "-f", filepath.Join(dockerDir(), "docker-compose.yml"),
		"up", "-d", "--wait", "--quiet-pull",
		"--wait-timeout", fmt.Sprint(int(composeTimeout.Seconds())),
	}
	for _, tg := range targets {
		args = append(args, tg.services...)
	}
	cmd := exec.Command("docker", args...)
	cmd.Stdout = os.Stderr
	cmd.Stderr = os.Stderr
	fmt.Fprintln(os.Stderr, "imaptest: docker", strings.Join(args, " "))
	if err := cmd.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "imaptest: docker compose up failed: %v\n", err)
		os.Exit(2)
	}
}

// composeDown removes the containers, networks and volumes composeUp created,
// so a run leaves nothing behind on the Docker host. Only reached once the
// tests have finished - a server that never came up is left in place for its
// logs to be read.
func composeDown() {
	args := []string{
		"compose", "-f", filepath.Join(dockerDir(), "docker-compose.yml"),
		"down", "--volumes", "--remove-orphans",
	}
	cmd := exec.Command("docker", args...)
	cmd.Stdout = os.Stderr
	cmd.Stderr = os.Stderr
	fmt.Fprintln(os.Stderr, "imaptest: docker", strings.Join(args, " "))
	if err := cmd.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "imaptest: docker compose down failed: %v\n", err)
	}
}

// waitForServers blocks until every target accepts a login - healthy ports are
// not enough, Stalwart provisions its users after it starts listening and Cyrus
// creates mailboxes on first login.
func waitForServers(targets []*target) {
	var wg sync.WaitGroup
	for _, tg := range targets {
		wg.Add(1)
		go func() {
			defer wg.Done()
			deadline := time.Now().Add(serverTimeout)
			var err error
			for time.Now().Before(deadline) {
				if err = probeLogin(tg, tg.user(tg.concurrency())); err == nil {
					return
				}
				time.Sleep(time.Second)
			}
			fmt.Fprintf(os.Stderr, "imaptest: %s never accepted a login: %v\n", tg.name, err)
			os.Exit(2)
		}()
	}
	wg.Wait()
}

func probeLogin(tg *target, user string) error {
	client, err := dialRaw(tg, user)
	if err != nil {
		return err
	}
	defer client.Close()
	return client.Logout().Wait()
}

func dialRaw(tg *target, user string) (*imapclient.Client, error) {
	client, err := imapclient.DialTLS(fmt.Sprintf("127.0.0.1:%d", tg.port), &imapclient.Options{
		TLSConfig: &tls.Config{InsecureSkipVerify: true},
	})
	if err != nil {
		return nil, err
	}
	if err := client.Login(user, password).Wait(); err != nil {
		client.Close()
		return nil, err
	}
	return client, nil
}

// forEachTarget runs fn as a parallel subtest per target, or skips when the
// suite is disabled.
func forEachTarget(t *testing.T, fn func(t *testing.T, tg *target)) {
	t.Helper()
	if len(targets) == 0 {
		t.Skip("set KANMAIL_IMAPTEST=all (or a comma separated list of targets) to run against real servers")
	}
	t.Parallel()
	for _, tg := range targets {
		t.Run(tg.name, func(t *testing.T) {
			t.Parallel()
			fn(t, tg)
		})
	}
}

var inUse sync.Map // "target/user" -> test name, to catch double check-out

func acquireUser(t *testing.T, tg *target) string {
	t.Helper()
	pool := userPools[tg.name]
	select {
	case user := <-pool:
		key := tg.name + "/" + user
		if prev, dup := inUse.LoadOrStore(key, t.Name()); dup {
			t.Fatalf("DOUBLE CHECKOUT of %s: now %s, still held by %s", key, t.Name(), prev)
		}
		t.Cleanup(func() { inUse.Delete(key); pool <- user })
		return user
	case <-time.After(testTimeout):
		t.Fatalf("no free user on %s", tg.name)
		return ""
	}
}

// testLogWriter sends Kanmail's logs to t.Log for as long as the test runs;
// anything a straggling goroutine logs afterwards is dropped rather than
// panicking the test binary.
type testLogWriter struct {
	t    *testing.T
	mu   sync.Mutex
	done bool
}

func (w *testLogWriter) Write(p []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if !w.done {
		w.t.Log(strings.TrimSpace(string(p)))
	}
	return len(p), nil
}

func newTestContext(t *testing.T) context.Context {
	t.Helper()
	writer := &testLogWriter{t: t}
	t.Cleanup(func() {
		writer.mu.Lock()
		writer.done = true
		writer.mu.Unlock()
	})
	level := zerolog.WarnLevel
	if debug {
		level = zerolog.TraceLevel
	}
	logger := zerolog.New(writer).Level(level).With().Timestamp().Logger()
	ctx, cancel := context.WithTimeout(logger.WithContext(context.Background()), testTimeout)
	t.Cleanup(cancel)
	return ctx
}

func newCaches(t *testing.T) *caches.Caches {
	t.Helper()
	c := caches.NewCaches(zerolog.Nop(), path.Join(t.TempDir(), "caches.db"))
	t.Cleanup(func() { c.Close() })
	return c
}

// env is one test's borrowed user on one server: a real Kanmail account at it,
// plus a direct connection that plays the other client.
type env struct {
	t       *testing.T
	ctx     context.Context
	tg      *target
	user    string
	account *emails.Account
	caches  *caches.Caches
	raw     *imapclient.Client
	// The mailbox raw has selected: its view of that mailbox is only brought up
	// to date by a command, so counts come from a fresh SELECT and STATUS is
	// preceded by a NOOP
	rawSelected string
}

// newEnv borrows a user, resets their mailbox to the server's baseline and
// builds a discovered account (namespaces and special folders filled in, as
// TestAccountSettings leaves a configured account).
func newEnv(t *testing.T, tg *target) *env {
	t.Helper()
	envSlots <- struct{}{}
	t.Cleanup(func() { <-envSlots })
	ctx := newTestContext(t)
	e := &env{t: t, ctx: ctx, tg: tg, user: acquireUser(t, tg)}

	raw, err := dialRaw(tg, e.user)
	require.NoError(t, err, "raw connection to %s as %s", tg.name, e.user)
	t.Cleanup(func() { raw.Close() })
	e.raw = raw
	e.reset()

	e.caches = newCaches(t)
	e.account = e.newAccount(e.caches)
	require.NoError(t, e.account.FetchAndUpdateSettings(ctx))
	return e
}

func (e *env) newAccount(c *caches.Caches) *emails.Account {
	e.t.Helper()
	account := emails.NewAccount(e.tg.accountSettings(e.user), c, nil)
	e.t.Cleanup(func() { account.CloseConnections(context.Background()) })
	return account
}

// restartAccount replaces the account with a fresh one on the same caches, as
// relaunching the app does.
func (e *env) restartAccount() {
	e.t.Helper()
	e.account.CloseConnections(e.ctx)
	e.account = e.newAccount(e.caches)
	require.NoError(e.t, e.account.FetchAndUpdateSettings(e.ctx))
}

func (e *env) folder(name string) *emails.Folder {
	return e.account.GetFolder(types.FolderName(name))
}

// reset wipes the user back to a fresh one: every mailbox but the INBOX and
// the server's baseline deleted, those emptied, and any baseline mailbox a
// previous test removed put back.
func (e *env) reset() {
	e.t.Helper()
	// A selected mailbox can't be deleted on some servers
	e.rawSelect("INBOX")

	baseline := e.tg.baseline()
	personal := e.tg.namespaces.PersonalRoot()
	var remove []string
	for _, mailbox := range e.list("", "*") {
		name := mailbox.Mailbox
		if types.FolderName(name).IsInbox() || slices.Contains(baseline, name) ||
			slices.Contains(mailbox.Attrs, imap.MailboxAttrNoSelect) {
			continue
		}
		// Shared mailboxes are not this user's to wipe, and are shared with the
		// tests running as every other user
		if !strings.HasPrefix(name, personal) {
			continue
		}
		remove = append(remove, name)
	}
	// Children before parents
	sort.Slice(remove, func(i, j int) bool {
		di, dj := strings.Count(remove[i], e.tg.delim()), strings.Count(remove[j], e.tg.delim())
		if di != dj {
			return di > dj
		}
		return remove[i] > remove[j]
	})
	for _, name := range remove {
		if err := e.raw.Delete(name).Wait(); err != nil {
			e.t.Logf("reset: delete %s: %v", name, err)
		}
	}

	for _, name := range append([]string{"INBOX"}, baseline...) {
		if !e.mailboxExists(name) {
			e.createMailbox(name)
			continue
		}
		e.emptyMailbox(name)
	}
	e.rawSelect("INBOX")
}

// emptyMailbox deletes every message in a mailbox and confirms it is empty
// before returning. Emptiness is checked with a fresh SELECT rather than the
// EXPUNGE responses, so a stale server view (or a partial expunge under load)
// is retried rather than leaking mail into the next test that borrows the user.
func (e *env) emptyMailbox(name string) {
	e.t.Helper()
	for attempt := 1; ; attempt++ {
		data := e.rawSelect(name)
		if data.NumMessages == 0 {
			return
		}
		seqSet := imap.SeqSetNum()
		seqSet.AddRange(1, 0)
		_, err := e.raw.Store(seqSet, &imap.StoreFlags{
			Op: imap.StoreFlagsAdd, Flags: []imap.Flag{imap.FlagDeleted}, Silent: true,
		}, nil).Collect()
		require.NoError(e.t, err, "reset: flag %s deleted", name)
		_, err = e.raw.Expunge().Collect()
		require.NoError(e.t, err, "reset: expunge %s", name)
		require.Less(e.t, attempt, 15, "reset: %s still has %d messages", name, data.NumMessages)
	}
}

// The other client
//

func (e *env) rawSelect(name string) *imap.SelectData {
	e.t.Helper()
	data, err := e.raw.Select(name, nil).Wait()
	require.NoError(e.t, err, "select %s", name)
	e.rawSelected = name
	return data
}

func (e *env) list(reference, pattern string) []*imap.ListData {
	e.t.Helper()
	mailboxes, err := e.raw.List(reference, pattern, nil).Collect()
	require.NoError(e.t, err, "list %q %q", reference, pattern)
	return mailboxes
}

func (e *env) mailboxExists(name string) bool {
	e.t.Helper()
	for _, mailbox := range e.list("", name) {
		if mailbox.Mailbox == name && !slices.Contains(mailbox.Attrs, imap.MailboxAttrNoSelect) {
			return true
		}
	}
	return false
}

func (e *env) createMailbox(name string) {
	e.t.Helper()
	if err := e.raw.Create(name, nil).Wait(); err != nil && !e.mailboxExists(name) {
		e.t.Fatalf("create %s: %v", name, err)
	}
}

func (e *env) deleteMailbox(name string) {
	e.t.Helper()
	e.rawSelect("INBOX")
	require.NoError(e.t, e.raw.Delete(name).Wait(), "delete %s", name)
}

func (e *env) status(name string) *imap.StatusData {
	e.t.Helper()
	if e.rawSelected == name {
		require.NoError(e.t, e.raw.Noop().Wait())
	}
	data, err := e.raw.Status(name, &imap.StatusOptions{
		NumMessages: true, UIDNext: true, UIDValidity: true, NumUnseen: true,
	}).Wait()
	require.NoError(e.t, err, "status %s", name)
	return data
}

func (e *env) count(name string) uint32 {
	e.t.Helper()
	return e.rawSelect(name).NumMessages
}

// appendMessage puts a message in a mailbox as another client would, returning
// the UID the server gave it.
func (e *env) appendMessage(mailbox string, m message) imap.UID {
	e.t.Helper()
	uids := e.appendMessages(mailbox, m)
	return uids[0]
}

func (e *env) appendMessages(mailbox string, messages ...message) []imap.UID {
	e.t.Helper()
	uids := make([]imap.UID, 0, len(messages))
	for _, m := range messages {
		raw := m.build()
		options := &imap.AppendOptions{Flags: m.flags}
		if !m.date.IsZero() {
			options.Time = m.date
		}
		// Without UIDPLUS the server doesn't say which UID it assigned, so
		// remember what the next one was going to be
		var next imap.UID
		if !e.raw.Caps().Has(imap.CapUIDPlus) {
			next = e.status(mailbox).UIDNext
		}
		cmd := e.raw.Append(mailbox, int64(len(raw)), options)
		_, err := cmd.Write(raw)
		require.NoError(e.t, err, "append to %s", mailbox)
		require.NoError(e.t, cmd.Close(), "append to %s", mailbox)
		data, err := cmd.Wait()
		require.NoError(e.t, err, "append to %s", mailbox)
		if data != nil && data.UID != 0 {
			uids = append(uids, data.UID)
		} else {
			uids = append(uids, next)
		}
	}
	return uids
}

// seed appends n plain messages to a mailbox, oldest first, each dated a
// minute after the last so dates order like UIDs do.
func (e *env) seed(mailbox string, n int) []imap.UID {
	e.t.Helper()
	messages := make([]message, n)
	start := time.Now().Add(-time.Duration(n) * time.Minute)
	for i := range messages {
		messages[i] = message{
			subject: fmt.Sprintf("Message %d", i+1),
			text:    fmt.Sprintf("Body of message %d", i+1),
			date:    start.Add(time.Duration(i) * time.Minute),
		}
	}
	return e.appendMessages(mailbox, messages...)
}

func (e *env) uids(mailbox string) []imap.UID {
	e.t.Helper()
	e.rawSelect(mailbox)
	data, err := e.raw.UIDSearch(&imap.SearchCriteria{}, nil).Wait()
	require.NoError(e.t, err, "uid search %s", mailbox)
	uids := data.AllUIDs()
	slices.Sort(uids)
	return uids
}

func (e *env) flags(mailbox string, uid imap.UID) []imap.Flag {
	e.t.Helper()
	e.rawSelect(mailbox)
	messages, err := e.raw.Fetch(imap.UIDSetNum(uid), &imap.FetchOptions{Flags: true, UID: true}).Collect()
	require.NoError(e.t, err, "fetch flags %s/%d", mailbox, uid)
	require.Len(e.t, messages, 1, "fetch flags %s/%d", mailbox, uid)
	return messages[0].Flags
}

func (e *env) storeFlags(mailbox string, op imap.StoreFlagsOp, flags []imap.Flag, uids ...imap.UID) {
	e.t.Helper()
	e.rawSelect(mailbox)
	_, err := e.raw.Store(imap.UIDSetNum(uids...), &imap.StoreFlags{Op: op, Flags: flags, Silent: true}, nil).Collect()
	require.NoError(e.t, err, "store flags %s", mailbox)
}

// expungeMessages deletes messages behind Kanmail's back.
func (e *env) expungeMessages(mailbox string, uids ...imap.UID) {
	e.t.Helper()
	e.storeFlags(mailbox, imap.StoreFlagsAdd, []imap.Flag{imap.FlagDeleted}, uids...)
	_, err := e.raw.Expunge().Collect()
	require.NoError(e.t, err, "expunge %s", mailbox)
}

// Kanmail side helpers
//

func (e *env) paginate(folder *emails.Folder, batchSize int) *emails.PaginateResp {
	e.t.Helper()
	resp, err := folder.PaginateEmails(e.ctx, emails.PaginateOptions{BatchSize: batchSize})
	require.NoError(e.t, err, "paginate %s", folder.Name)
	return resp
}

// paginateAll pages through a folder from the top, returning every email in
// the order they arrived.
func (e *env) paginateAll(folder *emails.Folder, batchSize int) []*types.Email {
	e.t.Helper()
	var all []*types.Email
	for {
		resp := e.paginate(folder, batchSize)
		all = append(all, resp.Emails...)
		if resp.Meta.Exhausted || len(resp.Emails) == 0 {
			return all
		}
		require.Less(e.t, len(all), 10000, "pagination never exhausted %s", folder.Name)
	}
}

// searchEmails runs a server search, retrying briefly on servers whose search
// index updates asynchronously (Stalwart) so a query right after an append
// isn't raced by the indexer. Errors fail immediately; an empty result is
// only retried while the index might still be catching up.
func (e *env) searchEmails(folder *emails.Folder, query string, limit int) []*types.Email {
	e.t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for {
		res, err := folder.SearchEmails(e.ctx, query, limit)
		require.NoError(e.t, err, "search %q", query)
		if len(res) > 0 || !e.tg.searchIndexLag || time.Now().After(deadline) {
			return res
		}
		time.Sleep(200 * time.Millisecond)
	}
}

func (e *env) sync(folder *emails.Folder) *emails.SyncResp {
	e.t.Helper()
	resp, err := folder.SyncEmails(e.ctx)
	require.NoError(e.t, err, "sync %s", folder.Name)
	return resp
}

func emailUIDs(emails []*types.Email) []imap.UID {
	uids := make([]imap.UID, 0, len(emails))
	for _, email := range emails {
		uids = append(uids, email.UID)
	}
	return uids
}

func emailSubjects(emails []*types.Email) []string {
	subjects := make([]string, 0, len(emails))
	for _, email := range emails {
		subjects = append(subjects, email.Subject)
	}
	return subjects
}
