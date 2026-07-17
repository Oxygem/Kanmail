package util

import (
	"errors"
	"sync"

	"github.com/zalando/go-keyring"
)

type keyringKey struct {
	service, user string
}

type keyringEntry struct {
	value string
	found bool
}

// CachedKeyring wraps go-keyring with an in-memory cache. On macOS each
// keyring call shells out to /usr/bin/security (~100-300ms), so repeated
// lookups (eg per window load) should only pay that cost once. Safe as long
// as all keyring access goes through the same instance.
type CachedKeyring struct {
	lock    sync.Mutex
	entries map[keyringKey]keyringEntry
}

func NewCachedKeyring() *CachedKeyring {
	return &CachedKeyring{entries: make(map[keyringKey]keyringEntry)}
}

func (k *CachedKeyring) Get(service, user string) (string, error) {
	key := keyringKey{service, user}

	k.lock.Lock()
	defer k.lock.Unlock()

	if entry, ok := k.entries[key]; ok {
		if !entry.found {
			return "", keyring.ErrNotFound
		}
		return entry.value, nil
	}

	val, err := keyring.Get(service, user)
	if errors.Is(err, keyring.ErrNotFound) {
		k.entries[key] = keyringEntry{}
		return "", err
	} else if err != nil {
		return "", err
	}

	k.entries[key] = keyringEntry{value: val, found: true}
	return val, nil
}

func (k *CachedKeyring) Set(service, user, value string) error {
	k.lock.Lock()
	defer k.lock.Unlock()

	if err := keyring.Set(service, user, value); err != nil {
		return err
	}
	k.entries[keyringKey{service, user}] = keyringEntry{value: value, found: true}
	return nil
}

func (k *CachedKeyring) Delete(service, user string) error {
	k.lock.Lock()
	defer k.lock.Unlock()

	if err := keyring.Delete(service, user); err != nil {
		return err
	}
	k.entries[keyringKey{service, user}] = keyringEntry{}
	return nil
}
