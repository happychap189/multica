package cli

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestCurrentProfilePointerPath(t *testing.T) {
	t.Run("HOME mode", func(t *testing.T) {
		home := t.TempDir()
		t.Setenv("HOME", home)
		t.Setenv("USERPROFILE", home)

		path, err := CurrentProfilePointerPath()
		if err != nil {
			t.Fatalf("CurrentProfilePointerPath: %v", err)
		}
		want := filepath.Join(home, ".multica", "current-profile")
		if path != want {
			t.Fatalf("path = %q, want %q", path, want)
		}
	})

	t.Run("task mode roots under the task directory", func(t *testing.T) {
		taskRoot := filepath.Join(t.TempDir(), "task-multica")
		t.Setenv("MULTICA_TASK_CONFIG_ROOT", taskRoot)

		path, err := CurrentProfilePointerPath()
		if err != nil {
			t.Fatalf("CurrentProfilePointerPath: %v", err)
		}
		want := filepath.Join(taskRoot, "current-profile")
		if path != want {
			t.Fatalf("path = %q, want %q", path, want)
		}
	})
}

func TestReadCurrentProfilePointer(t *testing.T) {
	t.Run("missing file resolves to empty with no error", func(t *testing.T) {
		t.Setenv("HOME", t.TempDir())
		name, err := ReadCurrentProfilePointer()
		if err != nil {
			t.Fatalf("err = %v, want nil", err)
		}
		if name != "" {
			t.Fatalf("name = %q, want empty", name)
		}
	})

	t.Run("trailing newline stripped", func(t *testing.T) {
		home := t.TempDir()
		t.Setenv("HOME", home)
		if err := WriteCurrentProfilePointer("company"); err != nil {
			t.Fatalf("write: %v", err)
		}
		name, err := ReadCurrentProfilePointer()
		if err != nil {
			t.Fatalf("read: %v", err)
		}
		if name != "company" {
			t.Fatalf("name = %q, want %q", name, "company")
		}
	})

	t.Run("whitespace-only content is corrupt-tolerant empty", func(t *testing.T) {
		home := t.TempDir()
		t.Setenv("HOME", home)
		path, _ := CurrentProfilePointerPath()
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte("   \n"), 0o600); err != nil {
			t.Fatal(err)
		}
		name, err := ReadCurrentProfilePointer()
		if err != nil || name != "" {
			t.Fatalf("read = (%q, %v), want (\"\", nil)", name, err)
		}
	})
}

func TestWriteCurrentProfilePointer(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)

	if err := WriteCurrentProfilePointer("company"); err != nil {
		t.Fatalf("write: %v", err)
	}
	path, _ := CurrentProfilePointerPath()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read back: %v", err)
	}
	if string(data) != "company\n" {
		t.Fatalf("content = %q, want %q", data, "company\n")
	}

	// The rename-based write should leave a 0600 regular file.
	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat: %v", err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Fatalf("mode = %v, want 0600", info.Mode().Perm())
	}

	// Overwrite round-trips.
	if err := WriteCurrentProfilePointer("personal"); err != nil {
		t.Fatalf("overwrite: %v", err)
	}
	name, err := ReadCurrentProfilePointer()
	if err != nil || name != "personal" {
		t.Fatalf("read = (%q, %v), want (\"personal\", nil)", name, err)
	}
}

func TestDeleteCurrentProfilePointer(t *testing.T) {
	t.Run("missing file tolerated", func(t *testing.T) {
		t.Setenv("HOME", t.TempDir())
		if err := DeleteCurrentProfilePointer(); err != nil {
			t.Fatalf("delete missing: %v", err)
		}
	})

	t.Run("existing file removed", func(t *testing.T) {
		t.Setenv("HOME", t.TempDir())
		if err := WriteCurrentProfilePointer("company"); err != nil {
			t.Fatalf("write: %v", err)
		}
		path, statErr := CurrentProfilePointerPath()
		if statErr != nil {
			t.Fatalf("path: %v", statErr)
		}
		if err := DeleteCurrentProfilePointer(); err != nil {
			t.Fatalf("delete: %v", err)
		}
		if _, err := os.Stat(path); !errors.Is(err, os.ErrNotExist) {
			t.Fatalf("stat after delete = %v, want ErrNotExist", err)
		}
	})
}
