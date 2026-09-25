package main

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/spf13/cobra"

	"github.com/multica-ai/multica/server/internal/cli"
)

// newResolveProfileCmd builds a cobra command carrying only the persistent
// --profile flag shape resolveProfile reads.
func newResolveProfileCmd(t *testing.T, profile string) *cobra.Command {
	t.Helper()
	cmd := &cobra.Command{}
	cmd.Flags().String("profile", "", "")
	if profile != "" {
		if err := cmd.Flags().Set("profile", profile); err != nil {
			t.Fatalf("set profile flag: %v", err)
		}
	}
	return cmd
}

// setOrUnsetEnv registers restore via t.Setenv and, for the empty value,
// additionally unsets the key so the matrix can distinguish "set but empty"
// (MULTICA_PROFILE="") from truly unset.
func setOrUnsetEnv(t *testing.T, key, val string) {
	t.Helper()
	t.Setenv(key, val)
	if val == "" {
		os.Unsetenv(key)
	}
}

// prepareProfileFixtures creates the on-disk profiles the matrix refers to:
// company and team/dev exist with a config.json, desktop-x exists too (the
// desktop- rejection must fire before existence, so it is tested against a
// profile that IS on disk), and ghost is deliberately absent (dangling).
func prepareProfileFixtures(t *testing.T, home string) {
	t.Helper()
	for _, name := range []string{"company", "team/dev", "desktop-x"} {
		dir := filepath.Join(home, ".multica", "profiles", filepath.FromSlash(name))
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatalf("create profile %q: %v", name, err)
		}
		if err := os.WriteFile(filepath.Join(dir, "config.json"), []byte("{}"), 0o600); err != nil {
			t.Fatalf("write config for %q: %v", name, err)
		}
	}
}

func TestResolveProfileMatrix(t *testing.T) {
	// Expectation rules (the matrix mirrors the documented chain, not the
	// code): the explicit flag wins everywhere; task contexts suppress the
	// machine-level layers even when both are populated (non-vacuum); the env
	// layer wins over the pointer; the pointer layer is last.
	type wantKind int
	const (
		wantNone wantKind = iota
		wantUnknown
		wantDesktop
	)

	type matrixCase struct {
		name       string
		flag       string // "" = flag not passed
		envSet     bool
		env        string
		pointerSet bool
		pointer    string
		context    string // "regular" | "daemon-managed" | "task-root-only"
		want       string
		wantErr    wantKind
	}

	var cases []matrixCase
	flagStates := []struct {
		passed bool
		value  string
	}{{false, ""}, {true, "flagprof"}}
	envStates := []struct {
		set   bool
		value string
	}{{false, ""}, {true, ""}, {true, "company"}}
	pointerStates := []struct {
		set   bool
		value string
	}{{false, ""}, {true, "company"}, {true, "ghost"}, {true, "desktop-x"}, {true, "team/dev"}}
	contexts := []string{"regular", "daemon-managed", "task-root-only"}

	for _, f := range flagStates {
		for _, e := range envStates {
			for _, p := range pointerStates {
				for _, ctx := range contexts {
					c := matrixCase{
						flag: f.value, envSet: e.set, env: e.value,
						pointerSet: p.set, pointer: p.value, context: ctx,
					}
					switch {
					case f.passed:
						c.want, c.wantErr = "flagprof", wantNone
					case ctx != "regular":
						c.want, c.wantErr = "", wantNone
					case e.set && e.value == "company":
						c.want, c.wantErr = "company", wantNone
					case !p.set:
						c.want, c.wantErr = "", wantNone
					case p.value == "company":
						c.want, c.wantErr = "company", wantNone
					case p.value == "team/dev":
						c.want, c.wantErr = "team/dev", wantNone
					case p.value == "ghost":
						c.want, c.wantErr = "", wantUnknown
					case p.value == "desktop-x":
						c.want, c.wantErr = "", wantDesktop
					}
					c.name = strings.Join([]string{
						"flag=" + map[bool]string{true: "set", false: "unset"}[f.passed],
						"env=" + map[bool]string{true: "set", false: "unset"}[e.set] + "/" + e.value,
						"ptr=" + map[bool]string{true: "set", false: "unset"}[p.set] + "/" + p.value,
						"ctx=" + ctx,
					}, ",")
					cases = append(cases, c)
				}
			}
		}
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			// Escape the working directory so workdir markers cannot turn a
			// "regular" cell into a daemon-managed one, and start from a
			// pristine HOME.
			t.Chdir(t.TempDir())
			home := t.TempDir()
			t.Setenv("HOME", home)
			t.Setenv("USERPROFILE", home)
			prepareProfileFixtures(t, home)

			// Context env.
			setOrUnsetEnv(t, "MULTICA_AGENT_ID", "")
			setOrUnsetEnv(t, "MULTICA_TASK_ID", "")
			setOrUnsetEnv(t, "MULTICA_DAEMON_PORT", "")
			setOrUnsetEnv(t, "MULTICA_TASK_CONFIG_ROOT", "")
			switch tc.context {
			case "daemon-managed":
				t.Setenv("MULTICA_AGENT_ID", "agent-matrix")
				t.Setenv("MULTICA_TASK_ID", "task-matrix")
			case "task-root-only":
				t.Setenv("MULTICA_TASK_CONFIG_ROOT", filepath.Join(t.TempDir(), "task-multica"))
			}

			// Machine-level layers.
			setOrUnsetEnv(t, cli.EnvProfile, "")
			if tc.envSet {
				t.Setenv(cli.EnvProfile, tc.env)
			}
			setOrUnsetEnv(t, "MULTICA_TOKEN", "")
			setOrUnsetEnv(t, "MULTICA_SERVER_URL", "")
			setOrUnsetEnv(t, "MULTICA_WORKSPACE_ID", "")
			if tc.pointerSet {
				if err := cli.WriteCurrentProfilePointer(tc.pointer); err != nil {
					t.Fatalf("write pointer: %v", err)
				}
			}

			cmd := newResolveProfileCmd(t, tc.flag)
			got, err := resolveProfile(cmd)

			switch tc.wantErr {
			case wantNone:
				if err != nil {
					t.Fatalf("resolveProfile() = (%q, %v), want (%q, nil)", got, err, tc.want)
				}
				if got != tc.want {
					t.Fatalf("resolveProfile() = %q, want %q", got, tc.want)
				}
			case wantUnknown:
				var unknown *unknownProfileError
				if !errors.As(err, &unknown) {
					t.Fatalf("resolveProfile() = (%q, %v), want *unknownProfileError", got, err)
				}
			case wantDesktop:
				if err == nil || !strings.Contains(err.Error(), "managed by the Multica desktop app") {
					t.Fatalf("resolveProfile() = (%q, %v), want desktop-ownership rejection", got, err)
				}
			}
		})
	}
}

// The env layer shares the ownership and existence validation with the
// pointer layer; the matrix only exercises env=company, so these cases pin
// the negative env values directly (AC6).
func TestResolveProfileEnvLayerValidation(t *testing.T) {
	cases := []struct {
		name    string
		env     string
		wantErr string // substring of the expected error, "" = no error
		want    string
	}{
		{"existing profile passes", "company", "", "company"},
		{"dangling env value lists known profiles", "ghost", "unknown profile", ""},
		{"desktop- env value rejected", "desktop-x", "managed by the Multica desktop app", ""},
	}
	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Chdir(t.TempDir())
			home := t.TempDir()
			t.Setenv("HOME", home)
			t.Setenv("USERPROFILE", home)
			prepareProfileFixtures(t, home)

			t.Setenv(cli.EnvProfile, tc.env)

			got, err := resolveProfile(newResolveProfileCmd(t, ""))
			if tc.wantErr != "" {
				if err == nil || !strings.Contains(err.Error(), tc.wantErr) {
					t.Fatalf("resolveProfile() = (%q, %v), want error containing %q", got, err, tc.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("resolveProfile() error = %v, want nil", err)
			}
			if got != tc.want {
				t.Fatalf("resolveProfile() = %q, want %q", got, tc.want)
			}
		})
	}
}

// A malformed explicit flag is rejected even though the flag layer skips
// existence and ownership checks.
func TestResolveProfileFlagFormatError(t *testing.T) {
	t.Chdir(t.TempDir())
	t.Setenv("HOME", t.TempDir())

	cmd := newResolveProfileCmd(t, "../evil")
	got, err := resolveProfile(cmd)
	if err == nil || !strings.Contains(err.Error(), "invalid profile name") {
		t.Fatalf("resolveProfile() = (%q, %v), want format rejection", got, err)
	}
}

// An explicit flag passes format validation for a desktop- name: read-only
// commands may inspect it, and lifecycle commands have their own guard.
func TestResolveProfileFlagAllowsDesktopName(t *testing.T) {
	t.Chdir(t.TempDir())
	t.Setenv("HOME", t.TempDir())

	cmd := newResolveProfileCmd(t, "desktop-x")
	got, err := resolveProfile(cmd)
	if err != nil {
		t.Fatalf("resolveProfile() error = %v, want nil", err)
	}
	if got != "desktop-x" {
		t.Fatalf("resolveProfile() = %q, want desktop-x", got)
	}
}

// AC13: the three help surfaces must name the env var and the pointer
// default so the mechanism is discoverable.
func TestProfileHelpTextsMentionEnvAndPointer(t *testing.T) {
	profileFlag := rootCmd.PersistentFlags().Lookup("profile")
	if profileFlag == nil {
		t.Fatal("--profile flag not found on rootCmd")
	}
	usage := profileFlag.Usage
	if !strings.Contains(usage, "MULTICA_PROFILE") || !strings.Contains(usage, "config set profile") {
		t.Fatalf("--profile usage = %q, want env and pointer default mentions", usage)
	}

	if !strings.Contains(rootHelpTemplate, "MULTICA_PROFILE") {
		t.Fatalf("root help template missing MULTICA_PROFILE entry:\n%s", rootHelpTemplate)
	}

	if !strings.Contains(configSetCmd.Long, "current-profile pointer") || !strings.Contains(configSetCmd.Long, "MULTICA_PROFILE") {
		t.Fatalf("config set help missing pointer/env semantics:\n%s", configSetCmd.Long)
	}
}
