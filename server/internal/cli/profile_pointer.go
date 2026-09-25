package cli

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// currentProfileFileName is the machine-level file naming the profile that
// bare `multica` invocations resolve through when neither --profile nor
// MULTICA_PROFILE is set.
const currentProfileFileName = "current-profile"

// CurrentProfilePointerPath returns the location of the machine-level
// current-profile pointer file, following multicaConfigRoot's layout:
// HOME mode is ~/.multica/current-profile; task mode (TaskConfigRootEnv set)
// roots it under the task-local directory. The resolution chain never touches
// the pointer in task contexts (the suppression layer guarantees that), so
// the task-mode path exists for layout symmetry only.
func CurrentProfilePointerPath() (string, error) {
	root, taskLocal, err := multicaConfigRoot()
	if err != nil {
		return "", fmt.Errorf("resolve current-profile pointer path: %w", err)
	}
	if taskLocal {
		return filepath.Join(root, currentProfileFileName), nil
	}
	return filepath.Join(root, ".multica", currentProfileFileName), nil
}

// ReadCurrentProfilePointer returns the profile name recorded in the
// machine-level pointer file, or "" when there is nothing usable there.
// A missing file, a whitespace-only file, or otherwise unusable content
// resolves to ("", nil) — corrupt-tolerant like daemon.id's read path
// (internal/daemon/identity.go), because a broken pointer must not wedge
// every bare invocation. Real I/O errors propagate: they mean the machine's
// state directory itself is misbehaving, which the user needs to see.
func ReadCurrentProfilePointer() (string, error) {
	path, err := CurrentProfilePointerPath()
	if err != nil {
		return "", err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return "", nil
		}
		// A directory at the pointer path is misconfiguration, not corruption:
		// fail loudly rather than silently ignoring the user's selection.
		return "", fmt.Errorf("read current-profile pointer: %w", err)
	}
	name := strings.TrimSpace(string(data))
	if name == "" {
		return "", nil
	}
	return name, nil
}

// WriteCurrentProfilePointer records name in the machine-level pointer file.
// Mirrors writeDaemonIDFile (internal/daemon/identity.go): create the parent
// directory, write a same-directory temp file, chmod 0600, rename into place
// so concurrent readers always see a valid snapshot.
func WriteCurrentProfilePointer(name string) error {
	path, err := CurrentProfilePointerPath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("create parent directory: %w", err)
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), ".current-profile-*.tmp")
	if err != nil {
		return fmt.Errorf("create temp current-profile pointer: %w", err)
	}
	tmpPath := tmp.Name()
	if _, err := tmp.WriteString(name + "\n"); err != nil {
		tmp.Close()
		os.Remove(tmpPath)
		return fmt.Errorf("write temp current-profile pointer: %w", err)
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("close temp current-profile pointer: %w", err)
	}
	if err := os.Chmod(tmpPath, 0o600); err != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("chmod temp current-profile pointer: %w", err)
	}
	if err := os.Rename(tmpPath, path); err != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("rename current-profile pointer: %w", err)
	}
	return nil
}

// DeleteCurrentProfilePointer removes the machine-level pointer file. A
// missing file is already the desired end state and is tolerated; a real
// I/O error propagates so the user knows the clear failed.
func DeleteCurrentProfilePointer() error {
	path, err := CurrentProfilePointerPath()
	if err != nil {
		return err
	}
	if err := os.Remove(path); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			// Deleting an already-absent pointer is a no-op.
			return nil
		}
		return fmt.Errorf("delete current-profile pointer: %w", err)
	}
	return nil
}
