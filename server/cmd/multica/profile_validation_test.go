package main

import (
	"errors"
	"strings"
	"testing"
)

func TestValidateProfileNameFormat(t *testing.T) {
	cases := []struct {
		name   string
		given  string
		wantOK bool
	}{
		{"empty is the default profile, always legal", "", true},
		{"plain name", "company", true},
		{"nested name is existing supported behavior", "team/dev", true},
		{"desktop- prefix passes format check", "desktop-x", true},
		{"absolute path rejected", "/etc/passwd", false},
		{"dot is not a profile", ".", false},
		{"dotdot is not a profile", "..", false},
		{"double slash rejected", "a//b", false},
		{"dot element rejected", "a/./b", false},
		{"trailing slash rejected", "a/b/", false},
		{"leading dot-slash rejected", "./a", false},
		{"leading traversal element rejected", "../evil", false},
		{"mid traversal element rejected", "a/../b", false},
	}
	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			err := validateProfileNameFormat(tc.given, "test")
			if gotOK := err == nil; gotOK != tc.wantOK {
				t.Fatalf("validateProfileNameFormat(%q) err = %v, wantOK=%v", tc.given, err, tc.wantOK)
			}
		})
	}
}

func TestValidateSelectedProfile(t *testing.T) {
	t.Run("format errors propagate", func(t *testing.T) {
		mkProfiles(t)
		err := validateSelectedProfile("../evil", "test source")
		if err == nil || !strings.Contains(err.Error(), "invalid profile name") {
			t.Fatalf("err = %v, want invalid profile name", err)
		}
	})

	t.Run("desktop- prefix rejected before existence is checked", func(t *testing.T) {
		// The desktop-x directory EXISTS on disk here: the rejection must come
		// from the ownership boundary, not from a missing directory.
		mkProfiles(t, "desktop-x")
		err := validateSelectedProfile("desktop-x", "test source")
		if err == nil || !strings.Contains(err.Error(), "managed by the Multica desktop app") {
			t.Fatalf("err = %v, want desktop-app ownership rejection", err)
		}
	})

	t.Run("dangling value lists known profiles", func(t *testing.T) {
		mkProfiles(t, "company", "team/dev")
		err := validateSelectedProfile("ghost", "test source")
		var unknown *unknownProfileError
		if !errors.As(err, &unknown) {
			t.Fatalf("err = %v, want *unknownProfileError", err)
		}
		want := []string{"company", "team/dev"}
		if strings.Join(unknown.Known, ",") != strings.Join(want, ",") {
			t.Fatalf("Known = %v, want %v", unknown.Known, want)
		}
	})

	t.Run("existing profile passes", func(t *testing.T) {
		mkProfiles(t, "company")
		if err := validateSelectedProfile("company", "test source"); err != nil {
			t.Fatalf("err = %v, want nil", err)
		}
	})

	t.Run("case-variant desktop- prefix rejected", func(t *testing.T) {
		// On case-insensitive filesystems this path IS the desktop app's own
		// directory; case must not bypass the ownership boundary.
		mkProfiles(t, "desktop-localhost")
		err := validateSelectedProfile("Desktop-localhost", "test source")
		if err == nil || !strings.Contains(err.Error(), "managed by the Multica desktop app") {
			t.Fatalf("err = %v, want desktop-ownership rejection", err)
		}
	})

	t.Run("nested existing profile passes", func(t *testing.T) {
		mkProfiles(t, "team/dev")
		if err := validateSelectedProfile("team/dev", "test source"); err != nil {
			t.Fatalf("err = %v, want nil", err)
		}
	})
}
