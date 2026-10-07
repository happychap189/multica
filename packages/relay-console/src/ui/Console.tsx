import { Box, Text, useApp, useInput } from "ink";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ConsoleClient } from "../api/client";
import { executePlan } from "../api/execute";
import { loadComments, loadIssue, loadTasks } from "../api/issue-repo";
import { Roster } from "../api/roster";
import { Poller, type PollDataSource, type PollState } from "../state/poller";
import { buildPlans, type ChecklistTicks } from "../state/plans";
import { buildViewModel } from "../state/view-model";

import { ActionPanel, type ActionMode } from "./ActionPanel";
import { App } from "./App";

/**
 * Stateful wrapper: owns the refresh loop, the roster, and the action flow.
 *
 * The action flow is a small state machine — list → preview → armed → running →
 * result — with the arm step in the middle on purpose. A single confirm key is
 * something fingers learn; a two-step one is not, and every action here is
 * outward-facing and hard to undo.
 *
 * `useInput` is gated on `interactive` because ink's raw-mode input is
 * unavailable when stdin is not a terminal; `main.tsx` unmounts after one frame
 * in that case.
 */

export interface ConsoleProps {
  readonly client: ConsoleClient;
  readonly issueRef: string;
  readonly readOnly: boolean;
  readonly interactive: boolean;
  readonly initial: PollState;
}

export function Console({ client, issueRef, readOnly, interactive, initial }: ConsoleProps) {
  const { exit } = useApp();
  const [state, setState] = useState<PollState>(initial);
  const [lastError, setLastError] = useState<string | null>(null);
  const [roster, setRoster] = useState<Roster | null>(null);

  const [focused, setFocused] = useState(false);
  const [selected, setSelected] = useState(0);
  const [mode, setMode] = useState<ActionMode>("list");
  const [ticks, setTicks] = useState<ChecklistTicks>({});
  const [resultLines, setResultLines] = useState<readonly string[] | null>(null);

  const pollerRef = useRef<Poller | null>(null);

  useEffect(() => {
    const source: PollDataSource = {
      async loadIssueAndComments() {
        const issue = await loadIssue(client.api, issueRef);
        const comments = await loadComments(client.api, issue.id);
        return { issue, comments };
      },
      async loadTasks() {
        return loadTasks(client.api);
      },
    };

    const poller = new Poller({
      source,
      onState: (next) => {
        setState(next);
        setLastError(null);
      },
      onError: (error) => setLastError(error instanceof Error ? error.message : String(error)),
    });
    pollerRef.current = poller;
    poller.start();
    return () => {
      poller.stop();
      pollerRef.current = null;
    };
  }, [client, issueRef]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const loaded = await Roster.load(client.api, client.workspace.id);
        if (!cancelled) setRoster(loaded);
      } catch (error) {
        if (!cancelled) {
          setLastError(error instanceof Error ? error.message : String(error));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client]);

  const model = useMemo(
    () =>
      buildViewModel({
        workspace: client.workspace,
        issue: state.issue,
        comments: state.comments,
        tasks: state.tasks,
        readOnly,
        now: Date.now(),
      }),
    [client.workspace, state, readOnly],
  );

  const plans = useMemo(
    () =>
      buildPlans({
        model,
        comments: state.comments,
        squads: roster?.allSquads() ?? [],
        currentOwnerId: model.issue.assigneeType === "member" ? model.issue.assigneeId : null,
        checklistTicked: ticks,
      }),
    [model, state.comments, roster, ticks],
  );

  const run = useCallback(async () => {
    const plan = plans[selected];
    if (!plan) {
      setMode("list");
      return;
    }
    setMode("running");
    const result = await executePlan(plan, {
      ctx: { api: client.api, readOnly },
      issueId: model.issue.id,
      source: { loadTasks: () => loadTasks(client.api) },
      baselineTaskIds: state.tasks.map((task) => task.id),
    });
    setResultLines(result.lines);
    setMode("result");
    pollerRef.current?.refresh();
  }, [plans, selected, client, readOnly, model.issue.id, state.tasks]);

  useInput(
    (input, key) => {
      if (input === "q" || (key.ctrl && input === "c")) {
        exit();
        return;
      }
      if (mode === "running") return;
      if (mode === "result") {
        setMode("list");
        return;
      }
      if (mode === "armed") {
        if (key.return) void run();
        else setMode("preview");
        return;
      }
      if (mode === "preview") {
        if (readOnly) {
          setMode("list");
          return;
        }
        if (input === "y") setMode("armed");
        else if (input === "n" || key.escape) setMode("list");
        return;
      }

      // list mode
      if (input === "a") {
        setFocused((value) => !value);
        return;
      }
      if (!focused) {
        if (input === "r") pollerRef.current?.refresh();
        return;
      }
      if (key.upArrow || input === "k") {
        setSelected((index) => Math.max(0, index - 1));
        return;
      }
      if (key.downArrow || input === "j") {
        setSelected((index) => Math.min(plans.length - 1, index + 1));
        return;
      }
      const current = plans[selected];
      if (input === "c" && current) {
        setTicks((value) => ({ ...value, [current.kind]: value[current.kind] !== true }));
        return;
      }
      if (key.return && current?.decision.kind === "run") {
        setMode("preview");
        return;
      }
      if (key.escape) setFocused(false);
    },
    { isActive: interactive },
  );

  const entries = client.audit.entries();
  const writes = client.audit.writes();

  return (
    <Box flexDirection="column">
      <App model={model} audit={{ total: entries.length, writes: writes.length }} />
      <ActionPanel
        plans={plans}
        selected={selected}
        mode={mode}
        checklistTicked={ticks}
        resultLines={resultLines}
        readOnly={readOnly}
        focused={focused}
      />
      <Box marginTop={1} flexDirection="column">
        {lastError !== null && <Text color="yellow">last refresh failed: {lastError}</Text>}
        <Text dimColor>
          updated {Math.max(0, Math.round((Date.now() - state.updatedAt) / 1000))}s ago
          {interactive ? " · a actions · r refresh · q quit" : ""}
        </Text>
      </Box>
    </Box>
  );
}
