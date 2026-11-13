// Thank you, Claude
package imapinterface

import (
	"encoding/json"
	"net/mail"
	"os"
	"path/filepath"
	"runtime"
	"slices"
	"strings"
	"sync"

	"github.com/emersion/go-imap/v2"

	"github.com/oxygem/kanmail/internal/constants"
)

// fakeEmail data lives in JSON files under fakedata/ so it isn't embedded in
// production builds - fake IMAP is a dev-only feature gated on the env var.
type fakeEmail struct {
	Subject string `json:"subject"`
	Content string `json:"content"`
	// Newsletter/promo emails set this to get a List-Unsubscribe header, so
	// the reader shows its unsubscribe link against fake data.
	Unsubscribe bool `json:"unsubscribe"`
	// Folder and Ago pin an email to a mailbox and an age (a Go duration),
	// overriding the spread and dating the shared pool gets. From names the
	// other side of the thread ("Name <user@host>") in place of a random one.
	Folder string `json:"folder"`
	Ago    string `json:"ago"`
	From   string `json:"from"`
}

func fakeAddress(name, email string) imap.Address {
	mailbox, host, _ := strings.Cut(email, "@")
	return imap.Address{Name: name, Mailbox: mailbox, Host: host}
}

func parseFakeAddress(value string) imap.Address {
	addr, err := mail.ParseAddress(value)
	if err != nil {
		panic("bad fake sender " + value + ": " + err.Error())
	}
	return fakeAddress(addr.Name, addr.Address)
}

// fakeGallery is the staged mail the marketing screenshots are shot against
// (KANMAIL_DEBUG_FAKE_IMAP=gallery): one owner across several accounts, each
// account's threads keyed by its username.
type fakeGallery struct {
	Owner    string                   `json:"owner"`
	Accounts map[string][][]fakeEmail `json:"accounts"`
}

var fakeGalleryData fakeGallery

// ownerAddress is the gallery owner at an account's own address, so every
// account's sent mail and To lines read as one person's.
func (g fakeGallery) ownerAddress(accountKey string) imap.Address {
	return fakeAddress(g.Owner, accountKey)
}

var companyDomains = []string{
	// Tech Kanmail is based on
	"react.dev",
	"wails.io",
	"gofakeit.com",
	"sqlite.org",
	"tiptap.dev",
	"lodash.com",
	"vite.dev",
	"nsis.sourceforge.io",

	// Shameless self plugging
	"afterburst.com",
	"oxygem.com",
	"pyinfra.com",
	"kanmail.io",
	"pointlessramblings.com",

	// The big ones
	"apache.org",
	"cncf.io",
	"linuxfoundation.org",
}

// fakeAccountSpread controls how many accounts the combined thread pool is
// divided between before threads start being reused across accounts.
const fakeAccountSpread = 5

var (
	fakeThreadPool   [][]fakeEmail
	fakeThreadCursor int
	fakeThreadLock   sync.Mutex
)

// loadFakeData reads a single file from the fakedata directory sitting
// alongside this source file (resolved at runtime, dev-only).
func loadFakeData(name string, into any) {
	_, thisFile, _, _ := runtime.Caller(0)
	path := filepath.Join(filepath.Dir(thisFile), "fakedata", name+".json")

	data, err := os.ReadFile(path)
	if err != nil {
		panic("failed to read fake thread data: " + err.Error())
	}

	if err := json.Unmarshal(data, into); err != nil {
		panic("failed to parse fake thread data: " + err.Error())
	}
}

func loadFakeThreads(name string) [][]fakeEmail {
	var threads [][]fakeEmail
	loadFakeData(name, &threads)
	return threads
}

// buildFakeThreadPool assembles the pool of threads based on the fake IMAP env
// value. A specific type uses only that set; anything else combines them all.
func buildFakeThreadPool() [][]fakeEmail {
	switch constants.ENV_DEBUG_FAKE_IMAP {
	case "support":
		return loadFakeThreads("support")
	case "sales":
		return loadFakeThreads("sales")
	case "default":
		return loadFakeThreads("default")
	default:
		var all [][]fakeEmail
		all = append(all, loadFakeThreads("default")...)
		all = append(all, loadFakeThreads("support")...)
		all = append(all, loadFakeThreads("sales")...)
		return all
	}
}

// fakeExtraFolders returns the additional folder names to seed alongside the
// standard set, parsed from the comma separated env var. Blanks, duplicates and
// standard folder names are dropped.
func fakeExtraFolders() []string {
	var folders []string
	for _, name := range strings.Split(constants.ENV_DEBUG_FAKE_FOLDERS, ",") {
		name = strings.TrimSpace(name)
		if name == "" || slices.Contains(standardFakeFolders, name) || slices.Contains(folders, name) {
			continue
		}
		folders = append(folders, name)
	}
	return folders
}

// allocateAccountThreads hands out the next disjoint slice of the shared pool so
// each account gets different emails. Once more than fakeAccountSpread accounts
// exist the pool wraps and threads are reused.
func allocateAccountThreads() [][]fakeEmail {
	fakeThreadLock.Lock()
	defer fakeThreadLock.Unlock()

	if len(fakeThreadPool) == 0 {
		return nil
	}

	perAccount := max(1, len(fakeThreadPool)/fakeAccountSpread)
	chunk := make([][]fakeEmail, 0, perAccount)
	for i := 0; i < perAccount; i++ {
		chunk = append(chunk, fakeThreadPool[fakeThreadCursor%len(fakeThreadPool)])
		fakeThreadCursor++
	}
	return chunk
}
