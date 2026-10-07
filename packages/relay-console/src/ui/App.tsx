import { Box, Text } from "ink";
import type { ReactNode } from "react";

import { PHASES } from "../config/phases";
import type { Alert, RelayViewModel } from "../state/view-model";
import { phaseProgress } from "../state/view-model";

/**
 * The read-only view.
 *
 * Layout follows what an operator actually scans for during a run: is the issue
 * still in a workable state, how far along the anchor count is, is anything
 * stalled, and may I act on it. The action panel lands with the write path.
 */

const SEVERITY_STYLE: Record<Alert["severity"], { color: string; label: string }> = {
  critical: { color: "red", label: "CRITICAL" },
  warning: { color: "yellow", label: "WARN" },
  info: { color: "blue", label: "INFO" },
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold underline>
        {title}
      </Text>
      {children}
    </Box>
  );
}

export interface AppProps {
  readonly model: RelayViewModel;
  /** Requests the HTTP layer actually issued, for the read-only proof. */
  readonly audit: { readonly total: number; readonly writes: number };
}

export function App({ model, audit }: AppProps) {
  const progress = phaseProgress(model.summary);
  const lastAnchor = model.summary.last;

  return (
    <Box flexDirection="column">
      <Box>
        <Text bold>relay-console</Text>
        <Text> · </Text>
        <Text color="cyan">{model.workspace.slug}</Text>
        <Text dimColor> ({model.workspace.id})</Text>
        <Text> · </Text>
        {model.readOnly ? (
          <Text color="yellow" bold>
            READ-ONLY
          </Text>
        ) : (
          <Text color="red" bold>
            WRITE ENABLED
          </Text>
        )}
      </Box>

      <Section title="issue">
        <Text>
          <Text color="cyan">{model.issue.identifier}</Text> {model.issue.title}
        </Text>
        <Text>
          status <Text bold>{model.issue.status}</Text> · assignee{" "}
          {model.issue.assigneeType ?? "none"}
          {model.issue.assigneeId ? `:${model.issue.assigneeId.slice(0, 8)}…` : ""}
          {model.issue.revision === null ? "" : ` · revision ${model.issue.revision}`}
        </Text>
      </Section>

      <Section title={`progress anchors — ${model.summary.uniqueCount}/${model.summary.totalSlots}`}>
        <Text>
          {progress
            .map((entry) => `P${entry.phase} ${entry.filled}/${entry.total}`)
            .join("   ")}
        </Text>
        <Text>
          {lastAnchor
            ? `last: ${lastAnchor.anchor.raw}${lastAnchor.isReply ? "  (in-thread)" : ""}`
            : "last: (no anchor found)"}
        </Text>
        <Text dimColor>
          phases: {PHASES.map(({ phase, squadName }) => `P${phase}=${squadName}`).join(" · ")}
        </Text>
      </Section>

      <Section title="stall (three arms)">
        {model.stall.arms.map((arm) => (
          <Text key={arm.id}>
            arm{arm.id} {arm.active ? <Text color="red">ACTIVE</Text> : <Text dimColor>idle</Text>}{" "}
            <Text dimColor>{arm.detail}</Text>
          </Text>
        ))}
        <Text>
          verdict{" "}
          {!model.stallApplies ? (
            <Text dimColor>not applicable — the relay is over</Text>
          ) : model.stall.stalled ? (
            <Text color="red" bold>
              STALLED
            </Text>
          ) : (
            <Text color="green">running normally</Text>
          )}
          {" · daemon "}
          {String(model.daemonOnline)}
        </Text>
      </Section>

      <Section title="re-entry gate">
        {model.reentry.allowed ? (
          <Text color="green">INTERVENE ALLOWED — {model.reentry.detail}</Text>
        ) : (
          <Text color="yellow">{model.reentry.detail}</Text>
        )}
      </Section>

      <Section title={`tasks (${model.tasks.length})`}>
        {model.tasks.length === 0 ? (
          <Text dimColor>no snapshot row for this issue</Text>
        ) : (
          model.tasks.slice(0, 12).map((task) => (
            <Text key={task.id}>
              {task.status.padEnd(12)} {task.id.slice(0, 8)}… agent {task.agent_id.slice(0, 8)}…
            </Text>
          ))
        )}
      </Section>

      {model.alerts.length > 0 && (
        <Section title="alerts">
          {model.alerts.map((alert, index) => {
            const style = SEVERITY_STYLE[alert.severity];
            return (
              <Text key={`${alert.severity}-${index}`}>
                <Text color={style.color} bold>
                  [{style.label}]
                </Text>{" "}
                {alert.message}
              </Text>
            );
          })}
        </Section>
      )}

      <Box marginTop={1}>
        <Text dimColor>
          requests: {audit.total} · non-GET: {audit.writes}
          {audit.writes === 0 ? " (read-only verified)" : " (WRITES ISSUED)"}
        </Text>
      </Box>
    </Box>
  );
}
