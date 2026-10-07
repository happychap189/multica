# @multica/relay-console

A long-running terminal console for driving and watching an **aidlc human relay** — the 5-phase,
33-stage, human-in-the-loop relay described by
[`docs/my-best-practice/templates/aidlc-relay-pack/relay-protocol.md`](../../docs/my-best-practice/templates/aidlc-relay-pack/relay-protocol.md).

The relay protocol has **no server-side enforcement**: the platform will happily accept a
mistyped mention, a missing progress anchor, or an issue parked in `backlog`. This console does
not add enforcement either — it makes the protocol's own drift signals cheap to see, and makes
the human's handoff actions idempotent and verified.

## What it does

- **Watch** — live view of progress anchors (`[P3 5/9] … done → next …`), per-phase slot counts
  against the 33-slot structure, thread-aware timeline, and the live task snapshot.
- **Guard** — the protocol's three-arm stall verdict (§5.1), the re-entry guard (§5.2) rendered
  as a hard gate rather than a warning, and the `backlog` trap as a critical alert.
- **Act** — the human's handoff / terminal actions, each behind a dry-run preview, a two-step
  confirm, an idempotency predicate, and a post-action verification.

Recovery interventions (§5) are **detection + alerting only** in this version; the console never
performs a recovery action of its own accord.

## Running

```bash
# read-only: renders the live view, performs only GET requests
pnpm --filter @multica/relay-console readonly -- --issue MUL-123

# with write actions enabled
pnpm --filter @multica/relay-console dev -- --issue MUL-123
```

Credentials come from the environment, mirroring the relay seed script:

| Variable | Meaning |
| --- | --- |
| `MULTICA_SERVER_URL` | Backend origin, e.g. `http://127.0.0.1:18700` |
| `MULTICA_API_TOKEN` | Personal access token (`mul_…`) |
| `MULTICA_WORKSPACE_ID` | Workspace UUID **or** slug — a UUID is resolved to its slug automatically |

Run it in a real terminal: key bindings need a TTY. When stdout is piped the
console renders one frame and exits, which is what makes it usable in a script.

## Testing

### Read-only against a real issue

```bash
cd <repo root>
set -a; . ../multica/.omc/state/aidlc-relay.env; set +a   # or export the three vars
pnpm --filter @multica/relay-console readonly -- --issue AIDL-3
```

Keys: `a` focus the action pane · `↑`/`↓` select · `enter` preview · `c` toggle a
checklist item · `r` refresh now · `q` quit.

What to check:

- **the anchor count matches reality** — AIDL-3 is a finished full-33 run and
  must read `33/33` with `P1 3/3  P2 7/7  P3 9/9  P4 7/7  P5 7/7`. This is the
  single strongest signal: it exercises the grammar, the thread scan (every
  AIDL-3 anchor is an in-thread reply) and the slot dedupe against real data.
- **the read-only footer** ends in `non-GET: 0 (read-only verified)`. The count
  is taken from the HTTP layer's own request log, so a non-zero value means a
  write really was issued and the process exits 3.
- **drift you already know about appears as a warning**: AIDL-3 carries one
  `(skip)` marker from a conditional stage, which is reported as a
  non-protocol marker rather than silently dropped.
- **a reduced path is reported, not flagged as drift**: AIDL-17 ran the P2 phase
  as 4 stages, so it shows an informational `P2 ran a reduced path` note instead
  of six phantom mismatches.

### The write path, safely

Writes are real and not undoable, so exercise them on a scratch issue and delete
it afterwards. The recipe used to verify this build:

```bash
export B=$MULTICA_SERVER_URL WS=$MULTICA_WORKSPACE_ID
H=(-H "Authorization: Bearer $MULTICA_API_TOKEN" -H "X-Workspace-ID: $WS" -H "Content-Type: application/json")

# 1. a scratch issue, assigned to yourself (assignee_id is the user_id for members)
curl -s "${H[@]}" -X POST "$B/api/issues" \
  -d '{"title":"SCRATCH — relay-console","status":"todo","assignee_type":"member","assignee_id":"<your-user-id>"}' | jq -r .id

# 2. seed a completed phase so a handoff is offerable
for a in "[P1 1/3] state-init done → next workspace-detection" \
         "[P1 2/3] workspace-detection done → next workspace-scaffold" \
         "[P1 3/3] workspace-scaffold done → next phase-summary"; do
  curl -s "${H[@]}" -X POST "$B/api/issues/<id>/comments" \
    -d "$(jq -nc --arg c "$a" '{content:$c,type:"comment"}')"
done

# 3. run `dev` (not `readonly`) against it, press a → enter → y → enter
pnpm --filter @multica/relay-console dev -- --issue <id>
```

Expected: the action pane offers `handoff P1 → P2` as `RUNNABLE`; the preview
shows `POST /api/issues/<id>/comments` and the comment body verbatim; after
firing, a leader task appears for the next squad. Then clean up — cancel any task
the mention started, then delete the issue:

```bash
curl -s "${H[@]}" -X POST "$B/api/issues/<id>/tasks/<task-id>/cancel"
curl -s "${H[@]}" -X DELETE "$B/api/issues/<id>"
```

### Unit tests

```bash
pnpm --filter @multica/relay-console test        # vitest, ~200 cases
pnpm --filter @multica/relay-console typecheck
pnpm --filter @multica/relay-console lint
```

The pure layers (`relay/`, `config/`, `state/`) are covered with injected time
and no IO; the HTTP contract, the trigger-outcome presence on a given backend
build, and the probe latency are covered by the two manual paths above instead.


## Layout

The tree is split so the risky logic is testable without a server:

| Directory | Holds | May do |
| --- | --- | --- |
| `src/relay/` | anchor grammar, slot dedupe, stall arms, re-entry guard, trigger-outcome interpretation, idempotency predicates | pure only — no IO, no React, `now` always injected |
| `src/config/` | the 33-stage table, per-phase metadata, the five review checklists, the writable-status red lines | constants and pure helpers |
| `src/api/` | the only place HTTP happens | `@multica/core` client wrappers |
| `src/state/` | view-model derivation and the poll loop | wiring |
| `src/ui/` | ink components | presentation |
