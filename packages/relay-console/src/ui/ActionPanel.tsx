import { Box, Text } from "ink";

import type { ActionPlan } from "../state/action-model";
import { describePlan } from "../state/action-model";
import type { ChecklistTicks } from "../state/plans";

/**
 * The action pane.
 *
 * An action is never just a button: the preview it opens onto is the exact wire
 * traffic, so the operator reads what would be sent rather than a paraphrase of
 * it. A plan that cannot run still appears, with its refusal, because "why can't
 * I hand off" is the question an operator actually has mid-run.
 */

export type ActionMode = "list" | "preview" | "armed" | "running" | "result";

const DECISION_STYLE: Record<ActionPlan["decision"]["kind"], { color: string; label: string }> = {
  run: { color: "green", label: "RUNNABLE" },
  noop: { color: "gray", label: "ALREADY DONE" },
  refuse: { color: "red", label: "REFUSED" },
};

export interface ActionPanelProps {
  readonly plans: readonly ActionPlan[];
  readonly selected: number;
  readonly mode: ActionMode;
  readonly checklistTicked: ChecklistTicks;
  readonly resultLines: readonly string[] | null;
  readonly readOnly: boolean;
  readonly focused: boolean;
}

export function ActionPanel({
  plans,
  selected,
  mode,
  checklistTicked,
  resultLines,
  readOnly,
  focused,
}: ActionPanelProps) {
  const plan = plans[selected];

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold underline>
        actions {focused ? <Text color="cyan">(focused)</Text> : <Text dimColor>(press a)</Text>}
        {readOnly ? <Text color="yellow"> READ-ONLY — every action is inert</Text> : null}
      </Text>

      {mode === "list" && (
        <>
          {plans.map((candidate, index) => {
            const style = DECISION_STYLE[candidate.decision.kind];
            const ticked = checklistTicked[candidate.kind] === true;
            return (
              <Text key={candidate.kind}>
                {index === selected ? "▶" : " "} <Text color={style.color}>[{style.label}]</Text>{" "}
                {candidate.title}
                {ticked ? <Text dimColor> · checklist ticked</Text> : null}
                {candidate.decision.kind !== "run" ? (
                  <Text dimColor> — {candidate.decision.reason}</Text>
                ) : null}
              </Text>
            );
          })}
          <Text dimColor>↑/↓ select · enter preview · c toggle checklist · a unfocus</Text>
        </>
      )}

      {(mode === "preview" || mode === "armed") && plan && (
        <>
          <Text bold>{plan.title}</Text>
          {plan.warnings.map((warning) => (
            <Text key={warning} color="yellow">
              ! {warning}
            </Text>
          ))}
          {plan.requests.map((request) => (
            <Text key={`${request.method}-${request.path}`}>
              {request.method} {request.path}
            </Text>
          ))}
          {plan.comment !== null && (
            <Box flexDirection="column">
              <Text dimColor>comment body:</Text>
              <Text>{plan.comment}</Text>
            </Box>
          )}
          {mode === "preview" ? (
            <Text color="cyan">y to arm · n or esc to cancel</Text>
          ) : (
            <Text color="red" bold>
              ARMED — press enter to send, any other key cancels
            </Text>
          )}
        </>
      )}

      {mode === "running" && <Text color="cyan">executing…</Text>}

      {mode === "result" && resultLines && (
        <>
          {resultLines.map((line, index) => (
            <Text key={`${index}-${line}`}>{line}</Text>
          ))}
          <Text dimColor>any key to continue</Text>
        </>
      )}

      {plan && mode === "list" && (
        <Box marginTop={1}>
          <Text dimColor>{describePlan(plan).join(" · ")}</Text>
        </Box>
      )}
    </Box>
  );
}
