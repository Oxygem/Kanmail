package imapinterface

import (
	"testing"
	"time"

	"github.com/emersion/go-imap/v2"
	"github.com/emersion/go-imap/v2/imapclient"
)

func makeMailboxHandler() (*imapclient.UnilateralDataHandler, chan struct{}) {
	signals := make(chan struct{}, 10)
	handler := &imapclient.UnilateralDataHandler{
		Mailbox: func(data *imapclient.UnilateralDataMailbox) {
			signals <- struct{}{}
		},
	}
	return handler, signals
}

func expectSignal(t *testing.T, signals chan struct{}, desc string) {
	t.Helper()
	select {
	case <-signals:
	case <-time.After(2 * time.Second):
		t.Fatalf("expected mailbox notification: %s", desc)
	}
}

func expectNoSignal(t *testing.T, signals chan struct{}, desc string) {
	t.Helper()
	select {
	case <-signals:
		t.Fatalf("unexpected mailbox notification: %s", desc)
	case <-time.After(100 * time.Millisecond):
	}
}

func drainSignals(signals chan struct{}) {
	for {
		select {
		case <-signals:
		case <-time.After(100 * time.Millisecond):
			return
		}
	}
}

func appendMessage(t *testing.T, client *FakeIMAPClient, folder string) imap.UID {
	t.Helper()
	cmd := client.Append(folder, 0, nil)
	if _, err := cmd.Write([]byte("Subject: test\r\n\r\nbody")); err != nil {
		t.Fatalf("append write failed: %v", err)
	}
	data, err := cmd.Wait()
	if err != nil {
		t.Fatalf("append failed: %v", err)
	}
	return data.UID
}

func TestFakeIdleCaps(t *testing.T) {
	client := NewFakeIMAPClient(t.Name())
	if !client.Caps().Has(imap.CapIdle) {
		t.Fatal("fake client should advertise IDLE")
	}
}

func TestFakeIdleRequiresSelectedFolder(t *testing.T) {
	client := NewFakeIMAPClient(t.Name())
	if _, err := client.Idle(); err == nil {
		t.Fatal("Idle should fail with no folder selected")
	}

	if _, err := client.Select("inbox", nil).Wait(); err != nil {
		t.Fatalf("select failed: %v", err)
	}
	cmd, err := client.Idle()
	if err != nil {
		t.Fatalf("Idle failed: %v", err)
	}

	// Wait blocks until Close, mimicking the real command
	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()
	select {
	case <-done:
		t.Fatal("Wait returned before Close")
	case <-time.After(100 * time.Millisecond):
	}
	if err := cmd.Close(); err != nil {
		t.Fatalf("Close failed: %v", err)
	}
	if err := <-done; err != nil {
		t.Fatalf("Wait failed: %v", err)
	}
}

func TestFakeIdleNotifyOnAppend(t *testing.T) {
	handler, signals := makeMailboxHandler()
	watcher := NewFakeIMAPClientWithHandler(t.Name(), handler)
	if _, err := watcher.Select("inbox", nil).Wait(); err != nil {
		t.Fatalf("select failed: %v", err)
	}

	other := NewFakeIMAPClient(t.Name())
	appendMessage(t, other, "inbox")
	expectSignal(t, signals, "append to watched folder")

	appendMessage(t, other, "archive")
	expectNoSignal(t, signals, "append to unwatched folder")
}

func TestFakeIdleNotifyOnStoreAndExpunge(t *testing.T) {
	handler, signals := makeMailboxHandler()
	watcher := NewFakeIMAPClientWithHandler(t.Name(), handler)
	if _, err := watcher.Select("inbox", nil).Wait(); err != nil {
		t.Fatalf("select failed: %v", err)
	}

	other := NewFakeIMAPClient(t.Name())
	uid := appendMessage(t, other, "inbox")
	drainSignals(signals)

	if _, err := other.Select("inbox", nil).Wait(); err != nil {
		t.Fatalf("select failed: %v", err)
	}
	flags := &imap.StoreFlags{Op: imap.StoreFlagsAdd, Flags: []imap.Flag{imap.FlagDeleted}}
	if _, err := other.Store(imap.UIDSetNum(uid), flags, nil).Collect(); err != nil {
		t.Fatalf("store failed: %v", err)
	}
	expectSignal(t, signals, "flag change in watched folder")
	drainSignals(signals)

	if _, err := other.Expunge().Collect(); err != nil {
		t.Fatalf("expunge failed: %v", err)
	}
	expectSignal(t, signals, "expunge in watched folder")
}

func TestFakeIdleNotifyOnMove(t *testing.T) {
	handler, signals := makeMailboxHandler()
	watcher := NewFakeIMAPClientWithHandler(t.Name(), handler)
	if _, err := watcher.Select("inbox", nil).Wait(); err != nil {
		t.Fatalf("select failed: %v", err)
	}

	archiveHandler, archiveSignals := makeMailboxHandler()
	archiveWatcher := NewFakeIMAPClientWithHandler(t.Name(), archiveHandler)
	if _, err := archiveWatcher.Select("archive", nil).Wait(); err != nil {
		t.Fatalf("select failed: %v", err)
	}

	other := NewFakeIMAPClient(t.Name())
	uid := appendMessage(t, other, "inbox")
	drainSignals(signals)

	if _, err := other.Select("inbox", nil).Wait(); err != nil {
		t.Fatalf("select failed: %v", err)
	}
	if _, err := other.Move(imap.UIDSetNum(uid), "archive").Wait(); err != nil {
		t.Fatalf("move failed: %v", err)
	}
	expectSignal(t, signals, "move out of watched folder")
	expectSignal(t, archiveSignals, "move into watched folder")
}

func TestFakeIdleUnsubscribe(t *testing.T) {
	handler, signals := makeMailboxHandler()
	watcher := NewFakeIMAPClientWithHandler(t.Name(), handler)
	other := NewFakeIMAPClient(t.Name())

	if _, err := watcher.Select("inbox", nil).Wait(); err != nil {
		t.Fatalf("select failed: %v", err)
	}
	if err := watcher.Unselect().Wait(); err != nil {
		t.Fatalf("unselect failed: %v", err)
	}
	appendMessage(t, other, "inbox")
	expectNoSignal(t, signals, "append after unselect")

	// Re-select then close: also unsubscribes
	if _, err := watcher.Select("inbox", nil).Wait(); err != nil {
		t.Fatalf("select failed: %v", err)
	}
	if err := watcher.Close(); err != nil {
		t.Fatalf("close failed: %v", err)
	}
	appendMessage(t, other, "inbox")
	expectNoSignal(t, signals, "append after close")
}

func TestFakeIdleSelectSwitchesSubscription(t *testing.T) {
	handler, signals := makeMailboxHandler()
	watcher := NewFakeIMAPClientWithHandler(t.Name(), handler)
	other := NewFakeIMAPClient(t.Name())

	if _, err := watcher.Select("inbox", nil).Wait(); err != nil {
		t.Fatalf("select failed: %v", err)
	}
	if _, err := watcher.Select("archive", nil).Wait(); err != nil {
		t.Fatalf("select failed: %v", err)
	}

	appendMessage(t, other, "inbox")
	expectNoSignal(t, signals, "append to previously watched folder")

	appendMessage(t, other, "archive")
	expectSignal(t, signals, "append to currently watched folder")
}
