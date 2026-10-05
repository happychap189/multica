#!/usr/bin/env bash
# seed-aidlc-relay.sh — idempotent import of the aidlc relay pack (plan W2):
#   skill zip -> 15 agents -> 16 squads -> skill mount -> optional runtime rebind
#   -> layered probes: --verify (HTTP layer) / --verify-full (runtime layer).
#
# Required env (no defaults, fail fast):
#   MULTICA_SERVER_URL     e.g. https://multica.example.com   (no default host)
#   MULTICA_API_TOKEN      human PAT with workspace admin rights
#   MULTICA_WORKSPACE_ID   workspace UUID (or slug)
#   MULTICA_RUNTIME_ID     runtime UUID created beforehand by the importer
#                          (POST /api/agents hard-requires runtime_id)
#
# Optional env:
#   AIDLC_ROSTER_JSON      default: aidlc-relay-roster.json next to this script
#   AIDLC_PACK_DIR         default: aidlc-relay-pack/ next to this script
#   AIDLC_SKILL_ZIP        prebuilt skill zip; default: zip AIDLC_PACK_DIR on the fly
#   VERIFY_TIMEOUT_SECS    --verify-full poll timeout, default 600
#
# Flags:
#   --verify               HTTP-layer probe: skill mount read-back + squad
#                          reassignment enqueue (UPDATE path, same one the
#                          terminal closure uses), plus entry-squad wake probes
#                          (express/classic reassign + classic comment mention);
#                          creates and deletes scratch issues.
#   --verify-full          Runtime-layer probe (needs daemon online and agents
#                          bound to a live runtime): leader wake-up via squad
#                          assignment, guest status ban, planned re-reply via
#                          explicit agent mention. Runs real agents — opt in.
#   --bind-runtime <id>    rebind all 15 agents to the given runtime after seed.
#   --force-skill-import   re-import skill with on_conflict=overwrite when a
#                          skill of the same name already exists.
set -euo pipefail

MARKER="aidlc-relay:v1"
SKILL_NAME="aidlc-relay-methodology"

: "${MULTICA_SERVER_URL:?set MULTICA_SERVER_URL (required, no default host)}"
: "${MULTICA_API_TOKEN:?set MULTICA_API_TOKEN (human PAT)}"
: "${MULTICA_WORKSPACE_ID:?set MULTICA_WORKSPACE_ID (UUID or slug)}"
: "${MULTICA_RUNTIME_ID:?set MULTICA_RUNTIME_ID (register your own runtime first; agent creation requires it)}"

HERE="$(cd "$(dirname "$0")" && pwd)"
ROSTER_JSON="${AIDLC_ROSTER_JSON:-$HERE/aidlc-relay-roster.json}"
PACK_DIR="${AIDLC_PACK_DIR:-$HERE/aidlc-relay-pack}"
API="$MULTICA_SERVER_URL/api"

BIND_RUNTIME=""
VERIFY=0
VERIFY_FULL=0
FORCE_SKILL=0
while [ $# -gt 0 ]; do
  case "$1" in
    --verify) VERIFY=1 ;;
    --verify-full) VERIFY_FULL=1 ;;
    --bind-runtime) shift; BIND_RUNTIME="${1:?--bind-runtime requires an id}";;
    --force-skill-import) FORCE_SKILL=1 ;;
    *) echo "ERROR: unknown flag: $1" >&2; exit 2 ;;
  esac
  shift
done

command -v jq >/dev/null 2>&1 || { echo "ERROR: jq required"; exit 1; }
command -v curl >/dev/null 2>&1 || { echo "ERROR: curl required"; exit 1; }
[ -f "$ROSTER_JSON" ] || { echo "ERROR: roster not found: $ROSTER_JSON"; exit 1; }
[ -d "$PACK_DIR" ] || { echo "ERROR: skill pack dir not found: $PACK_DIR"; exit 1; }
if [[ $MULTICA_RUNTIME_ID =~ ^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$ ]]; then :; else
  echo "ERROR: MULTICA_RUNTIME_ID must be a runtime UUID"; exit 1
fi

if [[ $MULTICA_WORKSPACE_ID =~ ^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$ ]]; then
  AUTH=( -H "Authorization: Bearer $MULTICA_API_TOKEN" -H "X-Workspace-ID: $MULTICA_WORKSPACE_ID" )
else
  AUTH=( -H "Authorization: Bearer $MULTICA_API_TOKEN" -H "X-Workspace-Slug: $MULTICA_WORKSPACE_ID" )
fi

# api METHOD PATH [JSON_BODY] — curl output lands on disk first, then jq; HTTP code checked.
api() {
  local method="$1" path="$2" body="${3:-}" tmp code
  tmp=$(mktemp)
  code=$(curl -sS -o "$tmp" -w "%{http_code}" -X "$method" "$API$path" "${AUTH[@]}" \
    ${body:+-H "Content-Type: application/json"} ${body:+-d "$body"}) || {
      echo "ERROR: $method $path curl failed" >&2; rm -f "$tmp"; exit 1; }
  if [ "${code:0:1}" != "2" ]; then
    echo "ERROR: $method $path -> HTTP $code: $(head -c 300 "$tmp")" >&2
    rm -f "$tmp"; exit 1
  fi
  cat "$tmp"; rm -f "$tmp"
}

resolve_skill_zip() {
  if [ -n "${AIDLC_SKILL_ZIP:-}" ]; then
    [ -f "$AIDLC_SKILL_ZIP" ] || { echo "ERROR: AIDLC_SKILL_ZIP not found: $AIDLC_SKILL_ZIP"; exit 1; }
    echo "$AIDLC_SKILL_ZIP"
    return
  fi
  local tmp
  tmp=$(mktemp -d)
  local z="$tmp/aidlc-relay-pack.zip"
  if command -v zip >/dev/null 2>&1; then
    (cd "$PACK_DIR" && zip -qr "$z" .)
  else
    echo "ERROR: zip binary required to build the skill archive (or set AIDLC_SKILL_ZIP)"; exit 1
  fi
  echo "$z"
}

list_agents() { api GET /agents | jq -r '(if type=="array" then . else (.agents // .data // []) end)[]?.name' ; }
agent_id()    { api GET /agents | jq -r --arg n "$1" '(if type=="array" then . else (.agents // .data // []) end)[]? | select(.name == $n) | .id' | head -1; }
# squad resolution: exact name AND description marker (names are not unique since migration 087)
squad_id() {
  api GET /squads | jq -r --arg n "$1" --arg m "$MARKER" \
    '.[]? | select(.name == $n and (.description // "" | contains($m))) | .id' | head -1
}

echo "== 1/6 skill import ($SKILL_NAME) =="
SKILL_ID=$(api GET /skills | jq -r --arg n "$SKILL_NAME" '(if type=="array" then . else (.skills // .data // []) end)[]? | select(.name? == $n) | .id' | head -1)
if [ -n "$SKILL_ID" ] && [ "$FORCE_SKILL" = "0" ]; then
  echo "  = skill exists, skip import: $SKILL_ID (use --force-skill-import to overwrite)"
else
  STRATEGY="fail"
  [ "$FORCE_SKILL" = "1" ] && STRATEGY="overwrite"
  SKILL_ZIP=$(resolve_skill_zip)
  tmp=$(mktemp)
  code=$(curl -sS -o "$tmp" -w "%{http_code}" -X POST "$API/skills/import" "${AUTH[@]}" \
    -F "on_conflict=$STRATEGY" -F "file=@$SKILL_ZIP")
  if [ "${code:0:1}" != "2" ]; then
    echo "ERROR: POST /skills/import -> HTTP $code: $(head -c 300 "$tmp")" >&2; rm -f "$tmp"; exit 1
  fi
  SKILL_ID=$(jq -r '.skill.id // .skill.uuid // empty' "$tmp")
  GOT_NAME=$(jq -r '.skill.name // empty' "$tmp")
  rm -f "$tmp"
  [ "$GOT_NAME" = "$SKILL_NAME" ] || { echo "ERROR: imported skill name is '$GOT_NAME', expected '$SKILL_NAME' (rename collision?)"; exit 1; }
  echo "  + skill imported: $SKILL_ID ($GOT_NAME, on_conflict=$STRATEGY)"
fi

echo "== 2/6 agents (15, idempotent: create or update by name) =="
for aname in $(jq -r '.agents[].name' "$ROSTER_JSON" | LC_ALL=C sort); do
  aid=$(agent_id "$aname")
  D=$(jq -r --arg n "$aname" '.agents[] | select(.name == $n) | .description' "$ROSTER_JSON")
  I=$(jq -r --arg n "$aname" '.agents[] | select(.name == $n) | .instructions' "$ROSTER_JSON")
  if [ -z "$aid" ]; then
    BODY=$(jq -n --arg n "$aname" --arg d "$D" --arg i "$I" --arg r "$MULTICA_RUNTIME_ID" \
      '{name: $n, description: $d, instructions: $i, runtime_id: $r, visibility: "workspace"}')
    aid=$(api POST /agents "$BODY" | jq -r '.id')
    echo "  + agent $aname -> $aid"
  else
    # update without runtime_id: never rebind as a side effect (use --bind-runtime for that)
    BODY=$(jq -n --arg d "$D" --arg i "$I" '{description: $d, instructions: $i, visibility: "workspace"}')
    api PUT "/agents/$aid" "$BODY" >/dev/null
    echo "  = agent $aname updated ($aid)"
  fi
done

echo "== 3/6 squads (16, resolve by exact name + description marker) =="
for sname in $(jq -r '.squads[].name' "$ROSTER_JSON" | LC_ALL=C sort); do
  sid=$(squad_id "$sname")
  D=$(jq -r --arg n "$sname" '.squads[] | select(.name == $n) | .description' "$ROSTER_JSON")
  I=$(jq -r --arg n "$sname" '.squads[] | select(.name == $n) | .instructions' "$ROSTER_JSON")
  L=$(jq -r --arg n "$sname" '.squads[] | select(.name == $n) | .leader' "$ROSTER_JSON")
  if [ -z "$sid" ]; then
    LID=$(agent_id "$L")
    [ -n "$LID" ] || { echo "ERROR: leader agent not found: $L"; exit 1; }
    BODY=$(jq -n --arg n "$sname" --arg d "$D" --arg l "$LID" '{name: $n, description: $d, leader_id: $l}')
    sid=$(api POST /squads "$BODY" | jq -r '.id')
    echo "  + squad $sname -> $sid"
  else
    BODY=$(jq -n --arg d "$D" --arg i "$I" '{description: $d, instructions: $i}')
    api PUT "/squads/$sid" "$BODY" >/dev/null
    echo "  = squad $sname updated ($sid)"
  fi
  # members: ensure every roster member is in the squad (leader auto-added by server)
  while IFS= read -r mname; do
    [ -n "$mname" ] || continue
    mid=$(agent_id "$mname")
    [ -n "$mid" ] || { echo "ERROR: member agent not found: $mname"; exit 1; }
    N=$(api GET "/squads/$sid/members" | jq -r --arg m "$mid" '[.[]? | select((.member_id // .id) == $m)] | length')
    if [ "$N" = "0" ]; then
      BODY=$(jq -n --arg m "$mid" '{member_type: "agent", member_id: $m, role: "member"}')
      api POST "/squads/$sid/members" "$BODY" >/dev/null
      echo "    + member $mname"
    fi
  done <<< "$(jq -r --arg n "$sname" '.squads[] | select(.name == $n) | .members[].name' "$ROSTER_JSON")"
  # instructions always PUT (heals drift on re-run); compare inside one jq —
  # piping jq's raw text output into another jq parser is not valid JSON input.
  N=$(api GET "/squads/$sid" | jq -r --arg i "$I" 'if (.instructions // "") == $i then "same" else "diff" end')
  if [ "$N" = "same" ]; then
    echo "    = instructions already current for $sname"
  else
    BODY=$(jq -n --arg d "$D" --arg i "$I" '{description: $d, instructions: $i}')
    api PUT "/squads/$sid" "$BODY" >/dev/null
    echo "    = instructions/description refreshed for $sname"
  fi
done

echo "== 4/6 skill mount (all 15 agents) =="
for aname in $(jq -r '.agents[].name' "$ROSTER_JSON" | LC_ALL=C sort); do
  aid=$(agent_id "$aname")
  N=$(api GET "/agents/$aid/skills" | jq -r --arg s "$SKILL_ID" '[.[]? | select((.id // .skill_id) == $s)] | length')
  if [ "$N" = "0" ]; then
    api POST "/agents/$aid/skills/add" "$(jq -n --arg s "$SKILL_ID" '{skill_ids: [$s]}')" >/dev/null
    echo "  + mounted skill -> $aname"
  else
    echo "  = skill already mounted -> $aname"
  fi
done

if [ -n "$BIND_RUNTIME" ]; then
  echo "== 4b/6 runtime rebind (--bind-runtime $BIND_RUNTIME) =="
  for aname in $(jq -r '.agents[].name' "$ROSTER_JSON" | LC_ALL=C sort); do
    aid=$(agent_id "$aname")
    api PUT "/agents/$aid" "$(jq -n --arg r "$BIND_RUNTIME" '{runtime_id: $r}')" >/dev/null
    echo "  + rebound $aname -> $BIND_RUNTIME"
  done
fi

echo "== 5/6 assertions =="
FAIL=0
AGENTS_JSON=$(api GET /agents)
NA=$(echo "$AGENTS_JSON" | jq '[.[]? | select(.name | startswith("aidlc-"))] | length')
if [ "$NA" = "15" ]; then echo "  PASS: 15 aidlc-* agents"; else echo "  FAIL: aidlc-* agents=$NA (expect 15)"; FAIL=1; fi
SQUADS_JSON=$(api GET /squads)
SC=$(echo "$SQUADS_JSON" | jq --arg m "$MARKER" '[.[]? | select((.description // "" | contains($m)))] | length')
if [ "$SC" = "16" ] ; then
  DUP=$(echo "$SQUADS_JSON" | jq --arg m "$MARKER" '[.[]? | select((.description // "" | contains($m)))] | length - ([.[]? | select((.description // "" | contains($m))) | .name] | unique | length)')
  if [ "$DUP" = "0" ]; then echo "  PASS: 16 marker squads, no duplicates"; else echo "  FAIL: duplicate marker squads detected"; FAIL=1; fi
else echo "  FAIL: marker squads=$SC (expect 16)"; FAIL=1; fi
for pair in "aidlc-阶段一-启动:4" "aidlc-阶段二-构思:5" "aidlc-阶段三-孵化:9" "aidlc-阶段四-构建:7" "aidlc-阶段五-运营:4" "aidlc-express:6" "aidlc-poc:5" "aidlc-bugfix:6" "aidlc-refactor:8" "aidlc-security-patch:8" "aidlc-classic:1" "aidlc-feature:1" "aidlc-enterprise:1" "aidlc-mvp:1" "aidlc-infra:1" "aidlc-workshop:1"; do
  sn="${pair%%:*}"; want="${pair##*:}"
  sid=$(squad_id "$sn")
  [ -n "$sid" ] || { echo "  FAIL: squad missing: $sn"; FAIL=1; continue; }
  got=$(api GET "/squads/$sid/members" | jq '[.[]?] | length')
  if [ "$got" = "$want" ]; then echo "  PASS: $sn members=$got"; else echo "  FAIL: $sn members=$got (expect $want)"; FAIL=1; fi
done
A=0
for aname in $(jq -r '.agents[].name' "$ROSTER_JSON" | LC_ALL=C sort); do
  aid=$(agent_id "$aname")
  N=$(api GET "/agents/$aid/skills" | jq -r --arg s "$SKILL_ID" '[.[]? | select((.id // .skill_id) == $s)] | length')
  [ "$N" -ge 1 ] && A=$((A+1))
done
if [ "$A" = "15" ]; then echo "  PASS: skill mounted 15/15"; else echo "  FAIL: skill mounted $A/15"; FAIL=1; fi
[ "$FAIL" = "0" ] || { echo "ABORT: assertions failed"; exit 1; }

echo "== 6/6 probes =="
# scratch issue helper: create todo issue, echo id
make_scratch_issue() {
  api POST /issues "$(jq -n --arg t "$1" '{title: $t, status: "todo"}')" | jq -r '.id'
}
# wait until a matching task row appears in the workspace snapshot
wait_task() { # issue_id jq-filter timeout_secs label -> prints task id or empty
  local issue="$1" filter="$2" timeout="$3" label="$4" i=0 found
  while [ "$i" -lt "$timeout" ]; do
    found=$(api GET /agent-task-snapshot | jq -r --arg iss "$issue" "$filter" | head -1)
    [ -n "$found" ] && { echo "$found"; return 0; }
    sleep 2; i=$((i+2))
  done
  echo "TIMEOUT waiting for $label (issue $issue)" >&2
  return 1
}

echo "== 6/6 probes =="
# entry squad wake probes (v1.1) — these wake the dispatcher for real; quota
# cost known, same precedent as the P1 squad probe. Scratch issues are deleted
# in every path (including failures).
verify_entry_reassign_probe() { # $1 = squad name — reassignment UPDATE path
  local SN="$1" SID ISSUE TASKID ST VFAIL=0
  SID=$(squad_id "$SN")
  [ -n "$SID" ] || { echo "    FAIL: squad not resolved: $SN"; return 1; }
  ISSUE=$(make_scratch_issue "[seed probe] verify: $SN reassignment enqueue (safe to delete)")
  [ -n "$ISSUE" ] || { echo "    FAIL: scratch issue create"; return 1; }
  api PUT "/issues/$ISSUE" "$(jq -n --arg s "$SID" '{assignee_type: "squad", assignee_id: $s}')"
  TASKID=$(wait_task "$ISSUE" '.[]? | select(.issue_id == $iss and .is_leader_task == true) | .id' 60 "queued leader task ($SN)") || VFAIL=1
  if [ -n "$TASKID" ] && [ "$TASKID" != "null" ]; then
    ST=$(api GET /agent-task-snapshot | jq -r --arg t "$TASKID" '.[]? | select(.id == $t) | .status')
    case "$ST" in
      queued|pending|dispatched|running) echo "    PASS: $SN reassignment enqueued leader task (status=$ST, task=$TASKID)" ;;
      *) echo "    FAIL: $SN leader task unexpected status=$ST"; VFAIL=1 ;;
    esac
  else
    echo "    FAIL: no leader task within 60s of $SN reassignment"; VFAIL=1
  fi
  api DELETE "/issues/$ISSUE" >/dev/null
  echo "    (scratch issue deleted: $ISSUE)"
  return $VFAIL
}
verify_entry_mention_probe() { # $1 = squad name — comment mention wake path
  local SN="$1" SID ISSUE MENTION NEW_TASK VFAIL=0
  SID=$(squad_id "$SN")
  [ -n "$SID" ] || { echo "    FAIL: squad not resolved: $SN"; return 1; }
  ISSUE=$(make_scratch_issue "[seed probe] verify: $SN comment mention wake (safe to delete)")
  [ -n "$ISSUE" ] || { echo "    FAIL: scratch issue create"; return 1; }
  MENTION="[@$SN](mention://squad/$SID)"
  api POST "/issues/$ISSUE/comments" "$(jq -n --arg m "$MENTION" '{content: ("seed verify probe: 入口唤醒探针（可删除）" + $m), type: "comment"}')" >/dev/null
  NEW_TASK=$(wait_task "$ISSUE" '.[]? | select(.issue_id == $iss and .kind == "comment") | .id' 60 "comment task ($SN)") || VFAIL=1
  if [ -n "$NEW_TASK" ] && [ "$NEW_TASK" != "null" ]; then
    echo "    PASS: $SN comment mention enqueued comment-kind task ($NEW_TASK)"
  else
    echo "    FAIL: $SN comment mention did not enqueue a comment-kind task"; VFAIL=1
  fi
  api DELETE "/issues/$ISSUE" >/dev/null
  echo "    (scratch issue deleted: $ISSUE)"
  return $VFAIL
}

verify_http_probe() {
  echo "  --verify: HTTP-layer probe"
  local VFAIL=0
  # a) skill mount read-back
  local aname aid N
  for aname in $(jq -r '.agents[].name' "$ROSTER_JSON" | LC_ALL=C sort); do
    aid=$(agent_id "$aname")
    N=$(api GET "/agents/$aid/skills" | jq -r --arg s "$SKILL_ID" '[.[]? | select((.id // .skill_id) == $s)] | length')
    if [ "$N" -ge 1 ]; then echo "    PASS: skill read-back $aname"; else echo "    FAIL: skill read-back $aname"; VFAIL=1; fi
  done
  # b) squad reassignment enqueue probe (UPDATE path — same path the terminal closure uses):
  #    scratch issue -> PUT assignee_type=squad -> leader task appears in snapshot as queued
  local P1_ID ISSUE TASKID
  P1_ID=$(squad_id "aidlc-阶段一-启动")
  [ -n "$P1_ID" ] || { echo "    FAIL: P1 squad not resolved"; return 1; }
  ISSUE=$(make_scratch_issue "[seed probe] verify: squad reassignment enqueue (safe to delete)")
  [ -n "$ISSUE" ] || { echo "    FAIL: scratch issue create"; return 1; }
  api PUT "/issues/$ISSUE" "$(jq -n --arg s "$P1_ID" '{assignee_type: "squad", assignee_id: $s}')"
  TASKID=$(wait_task "$ISSUE" '.[]? | select(.issue_id == $iss and .is_leader_task == true) | .id' 60 "queued leader task") || { VFAIL=1; }
  if [ -n "$TASKID" ] && [ "$TASKID" != "null" ]; then
    ST=$(api GET /agent-task-snapshot | jq -r --arg t "$TASKID" '.[]? | select(.id == $t) | .status')
    case "$ST" in
      queued|pending|dispatched|running) echo "    PASS: leader task enqueued via squad reassignment (status=$ST, task=$TASKID)" ;;
      *) echo "    FAIL: leader task unexpected status=$ST"; VFAIL=1 ;;
    esac
  else
    echo "    FAIL: no leader task within 60s of squad reassignment"; VFAIL=1
  fi
  api DELETE "/issues/$ISSUE" >/dev/null
  echo "    (scratch issue deleted: $ISSUE)"

  # c) v1.1 entry probes: light closed-loop (express) and heavy zero-member
  #    (classic) squads via the reassignment UPDATE path, plus the comment
  #    mention wake (the real first-trigger form — mention://squad resolves to
  #    the leader agent, kind=comment task)
  verify_entry_reassign_probe "aidlc-express" || VFAIL=1
  verify_entry_reassign_probe "aidlc-classic" || VFAIL=1
  verify_entry_mention_probe "aidlc-classic" || VFAIL=1
  return $VFAIL
}

verify_full_probe() {
  echo "  --verify-full: runtime-layer checks (needs daemon online + agents bound to a live runtime)"
  local VFAIL=0 TIMEOUT P1_ID LEADER_ID ISSUE FIRST_TASK ST I COMMENTS AGENT_COMMENTS NEW_TASK
  TIMEOUT="${VERIFY_TIMEOUT_SECS:-600}"
  P1_ID=$(squad_id "aidlc-阶段一-启动")
  [ -n "$P1_ID" ] || { echo "    FAIL: P1 squad not resolved"; return 1; }
  LEADER_ID=$(agent_id "aidlc-architect")
  [ -n "$LEADER_ID" ] || { echo "    FAIL: leader agent not found"; return 1; }
  ISSUE=$(make_scratch_issue "[seed probe] verify-full: leader wake + status ban + planned re-reply (safe to delete)")
  [ -n "$ISSUE" ] || { echo "    FAIL: scratch issue create"; return 1; }
  # a) guest wake-up: squad assignment -> leader task -> daemon claims -> leader comments
  api PUT "/issues/$ISSUE" "$(jq -n --arg s "$P1_ID" '{assignee_type: "squad", assignee_id: $s}')"
  FIRST_TASK=$(wait_task "$ISSUE" '.[]? | select(.issue_id == $iss and .is_leader_task == true) | .id' 60 "first leader task") || { echo "    FAIL: no leader task"; api DELETE "/issues/$ISSUE" >/dev/null; return 1; }
  echo "    leader task enqueued: $FIRST_TASK"
  # b) wait for the leader to actually run and post its first comment
  I=0
  while :; do
    COMMENTS=$(api GET "/issues/$ISSUE/comments")
    AGENT_COMMENTS=$(echo "$COMMENTS" | jq '[.[]? | select(.author_type == "agent")] | length')
    [ "$AGENT_COMMENTS" -ge 1 ] && break
    [ "$I" -ge "$TIMEOUT" ] && { echo "    FAIL: leader produced no comment within ${TIMEOUT}s"; api DELETE "/issues/$ISSUE" >/dev/null; return 1; }
    sleep 5; I=$((I+5))
  done
  echo "    PASS: leader wake-up (agent comments: $AGENT_COMMENTS)"
  # c) guest status ban: issue must still be todo (agent never writes status)
  ST=$(api GET "/issues/$ISSUE" | jq -r '.status')
  if [ "$ST" = "todo" ]; then echo "    PASS: guest status ban holds (status=$ST)"; else echo "    FAIL: issue status changed to $ST by agent"; VFAIL=1; fi
  # d) planned re-reply probe: explicit agent mention in a new comment -> follow-up run enqueued
  MENTION="[@aidlc-architect](mention://agent/$LEADER_ID)"
  api POST "/issues/$ISSUE/comments" "$(jq -n --arg m "$MENTION" '{content: ("seed verify-full probe: 请对齐现场续跑，勿改状态。" + $m), type: "comment"}')" >/dev/null
  NEW_TASK=$(wait_task "$ISSUE" '.[]? | select(.issue_id == $iss and .kind == "comment") | .id' 60 "follow-up task") || VFAIL=1
  # dedupe: NEW_TASK must differ from the first leader task
  if [ -n "$NEW_TASK" ] && [ "$NEW_TASK" != "null" ] && [ "$NEW_TASK" != "$FIRST_TASK" ] && [ "$NEW_TASK" != "" ]; then
    echo "    PASS: planned re-reply enqueued follow-up task ($NEW_TASK)"
  else
    echo "    FAIL: explicit agent mention did not enqueue a follow-up task"; VFAIL=1
  fi
  api DELETE "/issues/$ISSUE" >/dev/null
  echo "    (scratch issue deleted: $ISSUE)"
  return $VFAIL
}

PF=0
[ "$VERIFY" = "1" ] && { verify_http_probe || PF=1; }
[ "$VERIFY_FULL" = "1" ] && { verify_full_probe || PF=1; }
echo "DONE. relay pack seeded: skill $SKILL_NAME ($SKILL_ID) + 15 agents + 16 squads (marker $MARKER)"
[ "$PF" = "0" ] || { echo "ABORT: probe failed"; exit 1; }
