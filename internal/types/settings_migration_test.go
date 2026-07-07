package types

import (
	"encoding/json"
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
