package main

import (
	"fmt"
	"path/filepath"
	"strings"
)

// validateProfileNameFormat is the path-safety check shared by every layer of
// the profile resolution chain. It rejects absolute paths, "." and "..", any
// form filepath.Clean would rewrite ("a//b", "a/./b", "a/b/", "./a"), and
// traversal elements ("../evil" survives filepath.Clean unchanged, so each
// separator-delimited element is checked too).
//
// Separator-containing names are legal: `multica --profile team/dev ...`
// creating ~/.multica/profiles/team/dev is existing supported behavior (see
// profileExists).
func validateProfileNameFormat(name, source string) error {
	if name == "" {
		return nil
	}
	if filepath.IsAbs(name) || name == "." || name == ".." || filepath.Clean(name) != name {
		return fmt.Errorf("invalid profile name %q from %s", name, source)
	}
	// filepath.Clean preserves leading ".." elements, so "../evil" passes the
	// Clean/IsAbs checks above; walking the separator-delimited elements
	// closes that traversal hole while keeping nested names like "team/dev"
	// legal.
	for _, part := range strings.Split(filepath.ToSlash(name), "/") {
		if part == "" || part == "." || part == ".." {
			return fmt.Errorf("invalid profile name %q from %s", name, source)
		}
	}
	return nil
}

// validateSelectedProfile is the existence-and-ownership check applied ONLY to
// the machine-level selection layers (env + pointer): those layers name a
// profile that is expected to already exist, unlike the explicit --profile
// flag, which must keep accepting brand-new names so `multica login --profile
// new-name` can bootstrap a fresh profile. It composes:
//
//   - validateProfileNameFormat (path safety)
//   - the desktop- prefix rejection: the desktop app owns the desktop-*
//     namespace (apps/desktop/src/main/daemon-profile.ts only ever touches
//     desktop-* dirs), so machine-level state must never select a desktop
//     profile behind the app's back
//   - existence via profileExists, with the unknownProfileError rendering
//     (known names listed) so a dangling env or pointer value is immediately
//     actionable
func validateSelectedProfile(name, source string) error {
	if err := validateProfileNameFormat(name, source); err != nil {
		return err
	}
	if strings.HasPrefix(name, "desktop-") {
		return fmt.Errorf("profile %q from %s: profiles starting with 'desktop-' are managed by the Multica desktop app; pass --profile explicitly if you really mean it", name, source)
	}
	exists, err := profileExists(name)
	if err != nil {
		return fmt.Errorf("validate profile %q from %s: %w", name, source, err)
	}
	if exists {
		return nil
	}
	// Only a confirmed miss walks the profiles root for suggestions; the same
	// laziness requireKnownProfile applies before listing known names.
	names, err := knownProfiles()
	if err != nil {
		return fmt.Errorf("list profiles: %w", err)
	}
	return &unknownProfileError{Profile: name, Known: names}
}
