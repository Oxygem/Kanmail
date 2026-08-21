package types

import (
	"encoding/json"
	"reflect"
	"testing"
)

func TestMigrateSettingsJSON(t *testing.T) {
	old := []byte(`{
		"accounts": [{"name": "x"}],
		"columnGroups": {"": ["inbox"], "Work": ["inbox", "archive"], "Later": ["trash"]},
		"currentColumnGroup": "Work"
	}`)

	migrated, did, err := MigrateSettingsJSON(old)
	if err != nil {
		t.Fatal(err)
	}
	if !did {
		t.Fatal("expected migration")
	}

	var s Settings
	if err := json.Unmarshal(migrated, &s); err != nil {
		t.Fatal(err)
	}
	if len(s.ColumnGroups) != 3 {
		t.Fatalf("groups: %+v", s.ColumnGroups)
	}
	if s.ColumnGroups[0].Name != "Default" || s.ColumnGroups[1].Name != "Later" || s.ColumnGroups[2].Name != "Work" {
		t.Fatalf("order: %+v", s.ColumnGroups)
	}
	if s.ColumnGroups[2].Columns[1] != "archive" {
		t.Fatalf("columns: %+v", s.ColumnGroups[2])
	}
	if s.CurrentColumnGroupIndex != 2 {
		t.Fatalf("index: %d", s.CurrentColumnGroupIndex)
	}
	if len(s.Accounts) != 1 || s.Accounts[0].Name != "x" {
		t.Fatalf("accounts passthrough: %+v", s.Accounts)
	}

	// Idempotent: second run is a no-op
	again, did2, err := MigrateSettingsJSON(migrated)
	if err != nil {
		t.Fatal(err)
	}
	if did2 {
		t.Fatal("expected no-op on migrated file")
	}
	if string(again) != string(migrated) {
		t.Fatal("bytes changed on no-op")
	}

	// Old current name "" -> Default at index 0
	for _, tc := range []struct {
		current string
		want    int
	}{{`""`, 0}, {`"nope"`, 0}, {`"Later"`, 1}} {
		b := []byte(`{"columnGroups": {"": ["inbox"], "Work": ["a"], "Later": ["b"]}, "currentColumnGroup": ` + tc.current + `}`)
		m, did, err := MigrateSettingsJSON(b)
		if err != nil || !did {
			t.Fatalf("migrate %s: %v %v", tc.current, did, err)
		}
		var s Settings
		if err := json.Unmarshal(m, &s); err != nil {
			t.Fatal(err)
		}
		if s.CurrentColumnGroupIndex != tc.want {
			t.Fatalf("current %s: got index %d want %d", tc.current, s.CurrentColumnGroupIndex, tc.want)
		}
	}

	// Missing columnGroups key -> no migration
	if _, did, err := MigrateSettingsJSON([]byte(`{"currentAccount": "x"}`)); err != nil || did {
		t.Fatalf("missing key: %v %v", did, err)
	}
}

func TestMigrateSettingsJSONNamespaces(t *testing.T) {
	old := []byte(`{
		"accounts": [
			{"name": "gmail", "settings": {"folderPrefix": "", "folderSeparator": "/", "saveSentCopies": true}},
			{"name": "dovecot", "settings": {"folderPrefix": "", "folderSeparator": "."}},
			{"name": "flat", "settings": {"folderPrefix": "INBOX.", "folderSeparator": "\u0000"}},
			{"name": "new", "settings": {"namespaces": {"personal": [{"prefix": "X.", "delim": "."}]}, "folderPrefix": "stale"}},
			{"name": "bare"}
		],
		"columnGroups": [{"name": "Default", "columns": ["inbox"]}]
	}`)

	migrated, did, err := MigrateSettingsJSON(old)
	if err != nil {
		t.Fatal(err)
	}
	if !did {
		t.Fatal("expected migration")
	}

	var s Settings
	if err := json.Unmarshal(migrated, &s); err != nil {
		t.Fatal(err)
	}
	want := []Namespaces{
		{Personal: []Namespace{{Prefix: "", Delim: "/"}}},
		{Personal: []Namespace{{Prefix: "", Delim: "."}}},
		{Personal: []Namespace{{Prefix: "INBOX.", Delim: ""}}},
		{Personal: []Namespace{{Prefix: "X.", Delim: "."}}},
		{},
	}
	for i, account := range s.Accounts {
		if got := account.Settings.Namespaces; !reflect.DeepEqual(got, want[i]) {
			t.Fatalf("account %s: got %+v want %+v", account.Name, got, want[i])
		}
	}
	if !s.Accounts[0].Settings.SaveSentCopies {
		t.Fatal("other settings must pass through")
	}
	if len(s.ColumnGroups) != 1 || s.ColumnGroups[0].Name != "Default" {
		t.Fatalf("already-migrated columnGroups must pass through: %+v", s.ColumnGroups)
	}

	// The old keys are gone from the migrated accounts, and untouched on the one
	// that already had namespaces
	var raw struct {
		Accounts []struct {
			Settings map[string]json.RawMessage `json:"settings"`
		} `json:"accounts"`
	}
	if err := json.Unmarshal(migrated, &raw); err != nil {
		t.Fatal(err)
	}
	for i := range 3 {
		for _, key := range []string{"folderPrefix", "folderSeparator"} {
			if _, ok := raw.Accounts[i].Settings[key]; ok {
				t.Fatalf("account %d still has %s", i, key)
			}
		}
	}
	if _, ok := raw.Accounts[3].Settings["folderPrefix"]; !ok {
		t.Fatal("account with namespaces should be left alone")
	}

	// Idempotent: second run is a no-op
	again, did2, err := MigrateSettingsJSON(migrated)
	if err != nil {
		t.Fatal(err)
	}
	if did2 {
		t.Fatal("expected no-op on migrated file")
	}
	if string(again) != string(migrated) {
		t.Fatal("bytes changed on no-op")
	}

	// Both legacy shapes in one file migrate together
	both := []byte(`{
		"accounts": [{"settings": {"folderPrefix": "", "folderSeparator": "."}}],
		"columnGroups": {"": ["inbox"]}
	}`)
	m, did, err := MigrateSettingsJSON(both)
	if err != nil || !did {
		t.Fatalf("migrate both: %v %v", did, err)
	}
	if err := json.Unmarshal(m, &s); err != nil {
		t.Fatal(err)
	}
	if s.Accounts[0].Settings.Namespaces.Delim() != "." || s.ColumnGroups[0].Name != "Default" {
		t.Fatalf("both migrations should apply: %+v %+v", s.Accounts[0].Settings.Namespaces, s.ColumnGroups)
	}
}
