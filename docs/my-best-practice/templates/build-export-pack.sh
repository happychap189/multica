#!/usr/bin/env bash
# build-export-pack.sh — assemble the cross-PC export zip for the aidlc relay pack:
#   aidlc-relay-pack/ (skill source) + roster + seed script + README + SHA256SUMS.
# Credential scan runs on the FINAL zip contents.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
PACK="$HERE/aidlc-relay-pack"
ROSTER="$HERE/aidlc-relay-roster.json"
SEED="$HERE/seed-aidlc-relay.sh"
README="$HERE/aidlc-relay-pack-export-README.md"
DOC72="$HERE/../72-aidlc-relay-usage-guide.md"
DOC73="$HERE/../73-aidlc-relay-profiles.md"
OUT_DIR="${AIDLC_EXPORT_DIR:-$HERE}"
VERSION="${AIDLC_RELAY_VERSION:-v1}"
OUT_ZIP="$OUT_DIR/aidlc-relay-export-$VERSION.zip"

[ -d "$PACK" ] || { echo "ERROR: pack dir missing: $PACK"; exit 1; }
[ -f "$PACK/SKILL.md" ] || { echo "ERROR: SKILL.md missing in $PACK/"; exit 1; }
[ -f "$ROSTER" ] || { echo "ERROR: roster missing: $ROSTER"; exit 1; }
[ -f "$SEED" ] || { echo "ERROR: seed script missing: $SEED"; exit 1; }
[ -f "$README" ] || { echo "ERROR: README missing: $README"; exit 1; }
[ -f "$DOC72" ] || { echo "ERROR: usage guide missing: $DOC72"; exit 1; }
[ -f "$DOC73" ] || { echo "ERROR: profiles guide missing: $DOC73"; exit 1; }

command -v jq >/dev/null 2>&1 || { echo "ERROR: jq required"; exit 1; }
command -v zip >/dev/null 2>&1 || { echo "ERROR: zip binary required"; exit 1; }
command -v unzip >/dev/null 2>&1 || { echo "ERROR: unzip binary required"; exit 1; }
if command -v shasum >/dev/null 2>&1; then SHA="shasum -a 256"; else SHA="sha256sum"; fi

# pre-flight: seed script must be syntactically valid before it ships
bash -n "$SEED"

# 33-contract assertions (deferred until W1b landed; slug set derived from
# refs/aidlc-workflows/core/aidlc-common/stages/<phase>/<slug>.md frontmatter).
CANONICAL_SLUGS="approval-handoff build-and-test ci-pipeline code-generation contract-design delivery-planning deployment-execution deployment-pipeline domain-design environment-provisioning feasibility feedback-optimization functional-design incident-response infrastructure-design intent-capture market-research nfr-design nfr-requirements observability-setup performance-validation practices-discovery refined-mockups requirements-analysis reverse-engineering rough-mockups scope-definition state-init team-formation units-generation user-stories workspace-detection workspace-scaffold"
STAGES_DIR="$PACK/references/stages"
ACTUAL_COUNT=$(find "$STAGES_DIR" -maxdepth 1 -name '*.md' | wc -l | tr -d ' ')
[ "$ACTUAL_COUNT" = "33" ] || { echo "ERROR: stage contracts count=$ACTUAL_COUNT (expect 33) in $STAGES_DIR"; exit 1; }
ACTUAL_SLUGS=$(find "$STAGES_DIR" -maxdepth 1 -name '*.md' -exec basename {} .md \; | LC_ALL=C sort)
EXPECTED_SORTED=$(printf '%s\n' $CANONICAL_SLUGS | LC_ALL=C sort)
DIFF_OUT=$(comm -3 <(echo "$EXPECTED_SORTED") <(echo "$ACTUAL_SLUGS") || true)
if [ -n "$DIFF_OUT" ]; then
  echo "ERROR: stage slug set mismatch (expected vs actual):"
  echo "$DIFF_OUT"
  exit 1
fi
echo "stage contracts: 33/33, slug set matches refs-derived set"
# pack completeness: protocol docs + 5 squad instruction files
for req in SKILL.md relay-protocol.md bugfix-relay-path.md squad-instructions/phase-1-initialization.md squad-instructions/phase-2-ideation.md squad-instructions/phase-3-inception.md squad-instructions/phase-4-construction.md squad-instructions/phase-5-operation.md; do
  [ -f "$PACK/$req" ] || { echo "ERROR: pack file missing: $req"; exit 1; }
done
echo "pack completeness: SKILL + protocol + bugfix path + 5 squad instructions"

# v1.1 profile-entry pack completeness: profiles route file + 11 entry
# instruction files (12 new files on top of the v1 completeness list above)
for req in \
  profiles-relay-paths.md \
  squad-instructions/entry-classic.md \
  squad-instructions/entry-express.md \
  squad-instructions/entry-feature.md \
  squad-instructions/entry-enterprise.md \
  squad-instructions/entry-mvp.md \
  squad-instructions/entry-poc.md \
  squad-instructions/entry-bugfix.md \
  squad-instructions/entry-refactor.md \
  squad-instructions/entry-infra.md \
  squad-instructions/entry-security-patch.md \
  squad-instructions/entry-workshop.md; do
  [ -f "$PACK/$req" ] || { echo "ERROR: pack file missing: $req"; exit 1; }
done
echo "pack completeness: profiles route file + 11 entry instructions (12 files)"

# v1.1 assertion scratch space + shared fail helper for the new sections
RTMP="$(mktemp -d)"
fail_assert() { echo "ERROR: $*" >&2; rm -rf "$RTMP"; exit 1; }

# roster sync: each squad's inline instructions must equal its squad-instructions
# file byte-for-byte after symmetric normalization — strip the leading header
# blockquote block (file side embeds md links; roster side carries the same
# blockquote with links flattened to plain text), skipping the leading blank
# lines and the title line, then trim trailing blank lines and trailing
# whitespace on the final line. Both sides get identical treatment (never
# strip one side only). All 16 squads are checked.
normalize_instructions() { # stdin -> stdout
  awk 'BEGIN { st = 0 }
    st == 0 { if ($0 ~ /^[[:space:]]*$/) next; print; st = 1; next }
    st == 1 { if ($0 ~ /^[[:space:]]*$/) next
              if ($0 ~ /^>/) { st = 2; next }
              print; st = 3; next }
    st == 2 { if ($0 ~ /^>/) next
              print; st = 3; next }
    { print }' \
  | awk '{ L[NR] = $0 }
    END { n = NR; while (n > 0 && L[n] ~ /^[[:space:]]*$/) n--; for (i = 1; i <= n; i++) print L[i] }' \
  | sed -e '$s/[[:space:]]*$//'
}

assert_instruction_sync() { # $1 = squad name, $2 = pack-relative instructions file
  local sname="$1" fpath="$2" inst
  [ -f "$PACK/$fpath" ] || fail_assert "squad-instructions file missing: $fpath"
  inst=$(jq -r --arg n "$sname" '.squads[] | select(.name == $n) | .instructions' "$ROSTER")
  [ -n "$inst" ] || fail_assert "roster instructions empty/missing for squad: $sname"
  normalize_instructions < "$PACK/$fpath" > "$RTMP/f.norm"
  printf '%s' "$inst" | normalize_instructions > "$RTMP/r.norm"
  if ! diff -u "$RTMP/f.norm" "$RTMP/r.norm" > "$RTMP/diff.out" 2>&1; then
    sed -n '1,40p' "$RTMP/diff.out"
    fail_assert "roster inline instructions diverge from $fpath for squad: $sname"
  fi
}

assert_instruction_sync "aidlc-阶段一-启动" "squad-instructions/phase-1-initialization.md"
assert_instruction_sync "aidlc-阶段二-构思" "squad-instructions/phase-2-ideation.md"
assert_instruction_sync "aidlc-阶段三-孵化" "squad-instructions/phase-3-inception.md"
assert_instruction_sync "aidlc-阶段四-构建" "squad-instructions/phase-4-construction.md"
assert_instruction_sync "aidlc-阶段五-运营" "squad-instructions/phase-5-operation.md"
assert_instruction_sync "aidlc-classic" "squad-instructions/entry-classic.md"
assert_instruction_sync "aidlc-express" "squad-instructions/entry-express.md"
assert_instruction_sync "aidlc-feature" "squad-instructions/entry-feature.md"
assert_instruction_sync "aidlc-enterprise" "squad-instructions/entry-enterprise.md"
assert_instruction_sync "aidlc-mvp" "squad-instructions/entry-mvp.md"
assert_instruction_sync "aidlc-poc" "squad-instructions/entry-poc.md"
assert_instruction_sync "aidlc-bugfix" "squad-instructions/entry-bugfix.md"
assert_instruction_sync "aidlc-refactor" "squad-instructions/entry-refactor.md"
assert_instruction_sync "aidlc-infra" "squad-instructions/entry-infra.md"
assert_instruction_sync "aidlc-security-patch" "squad-instructions/entry-security-patch.md"
assert_instruction_sync "aidlc-workshop" "squad-instructions/entry-workshop.md"
echo "roster sync: 16/16 squads inline == squad-instructions files (normalized)"

# route consistency (four assertions, one shared parser per plan W4-3):
#   1) light entries: every route-table lead/reviewer persona must be a squad
#      member (or a 队长/dispatcher placeholder cell)
#   2) heavy entries: every phase-squad name token appearing anywhere in the
#      entry's section (kickoff templates included) must be one of the roster's
#      5 phase squads (residual scan: legit names removed, then no token left)
#   3) coverage+subset: each kickoff stage subset must equal the route table's
#      stages for that phase, and subsets jointly cover exactly the entry's
#      non-init stages (P1 init is dispatcher-self-run)
#   4) entry-*.md stage order table == profiles route table (same entry)
# Parsing contract (plan W1② fixed column order — profiles-relay-paths.md and
# entry-*.md order tables must follow it):
#   - entry sections open with a heading containing the bare token aidlc-<profile>
#   - route table header: | # | slug | lead | reviewer | 条件标注 |
#   - data rows: col1 = #N or bare N (N 1-33, normalized), col2 = bare slug, exactly 5 columns
#   - phase from stage number: P1 #1-3 / P2 #4-10 / P3 #11-19 / P4 #20-26 / P5 #27-33
#   - heavy kickoff machine lines: "- P3 → 阶段三队（aidlc-阶段三-孵化）: 子集 11 requirements-analysis, …；锚分母 n=9；末位 …"
ENTRIES="aidlc-classic,aidlc-express,aidlc-feature,aidlc-enterprise,aidlc-mvp,aidlc-poc,aidlc-bugfix,aidlc-refactor,aidlc-infra,aidlc-security-patch,aidlc-workshop"
HEAVY="aidlc-classic,aidlc-mvp,aidlc-feature,aidlc-enterprise,aidlc-infra,aidlc-workshop"
PROFILES="$PACK/profiles-relay-paths.md"

parse_route_tables() { # $1 = entries csv, $2 = heavy csv ("" = none), $3 = input file
  awk -v ENTRIES="$1" -v HEAVY="$2" '
    BEGIN { FS = "|"
            m = split(ENTRIES, E, ",")
            h = split(HEAVY, H, ",")
            for (i = 1; i <= h; i++) HVY[H[i]] = 1 }
    /^#{1,6} / {
      newcur = ""
      for (i = 1; i <= m; i++) if (index($0, E[i])) { newcur = E[i]; break }
      if (newcur != "") cur = newcur
      next }
    cur == "" { next }
    /^>/ { if (cur in HVY && $0 ~ /aidlc-阶段/) print "T\t" cur "\t" $0; next }
    {
      num = $2;   gsub(/^[[:space:]]+|[[:space:]]+$/, "", num)
      slug = $3;  gsub(/^[[:space:]]+|[[:space:]]+$/, "", slug)
      lead = $4;  gsub(/^[[:space:]]+|[[:space:]]+$/, "", lead)
      rev = $5;   gsub(/^[[:space:]]+|[[:space:]]+$/, "", rev)
      if (num ~ /^#?[0-9]+$/ && slug ~ /^[a-z0-9][a-z0-9-]*$/) {
        if (NF != 7) { print "X\t" cur "\t" $0; next }
        sub(/^#/, "", num)
        print "R\t" cur "\t" num "\t" slug "\t" lead "\t" rev
        next }
      if ($0 ~ /^[-*] P[0-9]+ →/) {
        print "K\t" cur "\t" $0; next }
      if (cur in HVY && $0 ~ /aidlc-阶段/) print "T\t" cur "\t" $0
    }' "$3"
}

parse_route_tables "$ENTRIES" "$HEAVY" "$PROFILES" > "$RTMP/routes.tsv"

# row-shape violations fail loudly (contract: exactly 5 columns)
if grep -q '^X' "$RTMP/routes.tsv"; then
  grep '^X' "$RTMP/routes.tsv" | head -5
  fail_assert "route table row shape violation (expected 5 columns | # | slug | lead | reviewer | 条件标注 |)"
fi

# sanity: all 11 entries must contribute route rows
DISTINCT_ENTRIES=$(awk -F'\t' '$1 == "R" { print $2 }' "$RTMP/routes.tsv" | sort -u | wc -l | tr -d ' ')
[ "$DISTINCT_ENTRIES" = "11" ] || fail_assert "profiles route tables: expected 11 entries with stage rows, got $DISTINCT_ENTRIES"

# --- assertion 1: light entries — personas ⊆ members ∪ {dispatcher} ---
PHASE_NAMES=$(jq -r '.squads[] | select(.name | startswith("aidlc-阶段")) | .name' "$ROSTER" | LC_ALL=C sort -u)
[ "$(printf '%s\n' "$PHASE_NAMES" | grep -c .)" = "5" ] || fail_assert "roster must contain exactly 5 aidlc-阶段* phase squads (got: $PHASE_NAMES)"

for entry in express poc bugfix refactor security-patch; do
  squad="aidlc-$entry"
  MEMBERS=$(jq -r --arg n "$squad" '.squads[] | select(.name == $n) | .members[].name' "$ROSTER" | LC_ALL=C sort -u)
  [ -n "$MEMBERS" ] || fail_assert "light squad has no members in roster: $squad"
  BAD_PERSONAS=$(awk -F'\t' -v e="$squad" '$1 == "R" && $2 == e { print $5; print $6 }' "$RTMP/routes.tsv" | sed -E -e 's/[（(].*$//' -e 's/[[:space:]]+$//' | LC_ALL=C sort -u)
  while IFS= read -r p; do
    [ -z "$p" ] && continue
    case "$p" in
      无*|-*|队长*|dispatcher*|aidlc-dispatcher*) : ;;
      *) echo "$MEMBERS" | grep -qx "$p" || fail_assert "light entry $squad: persona '$p' not in squad members ∪ {dispatcher} (route table lead/reviewer cell)" ;;
    esac
  done <<< "$BAD_PERSONAS"
done
echo "route assertion 1/4: light-entry personas ⊆ members ∪ {dispatcher}"

# --- assertion 2: heavy entries — team tokens all legit (residual scan) ---
for entry in classic mvp feature enterprise infra workshop; do
  squad="aidlc-$entry"
  awk -F'\t' -v e="$squad" '$1 == "T" && $2 == e { line = $3; for (i = 4; i <= NF; i++) line = line "\t" $i; print line }' "$RTMP/routes.tsv" > "$RTMP/heavy-section.txt"
  SED_REMOVE=()
  while IFS= read -r n; do
    [ -n "$n" ] && SED_REMOVE+=(-e "s/$n//g")
  done <<< "$PHASE_NAMES"
  RESIDUAL=$(sed "${SED_REMOVE[@]}" "$RTMP/heavy-section.txt" | grep 'aidlc-阶段' || true)
  [ -z "$RESIDUAL" ] || fail_assert "heavy entry $squad references unknown phase squad name: $RESIDUAL"
done
echo "route assertion 2/4: heavy kickoff team names all legit phase squads"

# --- assertion 3: kickoff subsets == route-table phase stages + coverage ---
# parse the delivered kickoff-line format:
#   "- P3 → 阶段三队（aidlc-阶段三-孵化）: 子集 11 requirements-analysis, 12 user-stories, …；锚分母 n=9；末位 …"
# emits entry / team / "num slug" pairs for the per-team comparison
awk -F'\t' '
  $1 == "K" {
    line = $3
    if (match(line, /队（aidlc-阶段[^）]*）/) == 0) next
    team = substr(line, RSTART, RLENGTH)
    sub(/^队（/, "", team)
    sub(/）$/, "", team)
    p = index(line, "子集 ")
    if (p == 0) next
    rest = substr(line, p + 7)
    semi = index(rest, "；")
    if (semi > 0) rest = substr(rest, 1, semi - 1)
    while (match(rest, /[0-9]+ [a-z0-9-]+/)) {
      print $2 "\t" team "\t" substr(rest, RSTART, RLENGTH)
      rest = substr(rest, RSTART + RLENGTH)
    }
  }' "$RTMP/routes.tsv" | LC_ALL=C sort > "$RTMP/kickoff-pairs.tsv"

for entry in classic mvp feature enterprise infra workshop; do
  squad="aidlc-$entry"
  TEAMS=$(awk -F'\t' -v e="$squad" '$1 == e { print $2 }' "$RTMP/kickoff-pairs.tsv" | LC_ALL=C sort -u)
  [ -n "$TEAMS" ] || fail_assert "heavy entry has no kickoff 目标小队 lines: $squad"
  for team in $TEAMS; do
    case "$team" in
      *阶段一*) ph=1 ;;
      *阶段二*) ph=2 ;;
      *阶段三*) ph=3 ;;
      *阶段四*) ph=4 ;;
      *阶段五*) ph=5 ;;
      *) fail_assert "heavy entry $squad: kickoff team not a 阶段 squad: $team" ;;
    esac
    WANT=$(awk -F'\t' -v e="$squad" -v p="$ph" '$1 == "R" && $2 == e { n = $3 + 0; q = (n <= 3) ? 1 : (n <= 10) ? 2 : (n <= 19) ? 3 : (n <= 26) ? 4 : 5; if (q == p) print $3 "\t" $4 }' "$RTMP/routes.tsv" | LC_ALL=C sort -u)
    GOT=$(awk -F'\t' -v e="$squad" -v t="$team" '$1 == e && index($2, t) == 1 && length($2) == length(t) { split($3, a, " "); print a[1] "\t" a[2] }' "$RTMP/kickoff-pairs.tsv" | LC_ALL=C sort -u)
    [ "$WANT" = "$GOT" ] || fail_assert "heavy entry $squad: kickoff subset for $team does not match route-table phase stages (want: $(printf '%s' "$WANT" | tr '\n' ' ') got: $(printf '%s' "$GOT" | tr '\n' ' '))"
  done
  ALLK=$(awk -F'\t' -v e="$squad" '$1 == e { split($3, a, " "); print a[1] }' "$RTMP/kickoff-pairs.tsv" | LC_ALL=C sort -u)
  ALLW=$(awk -F'\t' -v e="$squad" '$1 == "R" && $2 == e && ($3 + 0) > 3 { print $3 }' "$RTMP/routes.tsv" | LC_ALL=C sort -u)
  [ "$ALLK" = "$ALLW" ] || fail_assert "heavy entry $squad: kickoff subsets do not cover exactly the non-init route stages"
done
echo "route assertion 3/4: kickoff subsets == route-table phase stages, coverage complete"

# --- assertion 4: entry files vs profiles (same-entry stage sets) ---
for entry in classic express feature enterprise mvp poc bugfix refactor infra security-patch workshop; do
  squad="aidlc-$entry"
  f="$PACK/squad-instructions/entry-$entry.md"
  parse_route_tables "aidlc-$entry" "" "$f" > "$RTMP/entry-parse.tsv"
  grep -q '^X' "$RTMP/entry-parse.tsv" && fail_assert "entry file $f: route table row shape violation (expected 5 columns)"
  awk -F'\t' '$1 == "R" { print $3 "\t" $4 }' "$RTMP/entry-parse.tsv" | LC_ALL=C sort > "$RTMP/entry-rows.tsv"
  awk -F'\t' -v e="$squad" '$1 == "R" && $2 == e { print $3 "\t" $4 }' "$RTMP/routes.tsv" | LC_ALL=C sort > "$RTMP/profiles-rows.tsv"
  if ! diff "$RTMP/entry-rows.tsv" "$RTMP/profiles-rows.tsv" > "$RTMP/e4.diff" 2>&1; then
    sed -n '1,40p' "$RTMP/e4.diff"
    fail_assert "entry file stage order table diverges from profiles route table: entry-$entry.md vs $squad"
  fi
done
echo "route assertion 4/4: entry-*.md stage order tables == profiles route tables (11/11)"

# --- assertion 5: entry terminal-phase labels match end-of-route map ---
# light entries: "末位 phase（P5）…"; heavy entries: "末位 phase = P4/P5 …"
ENDPH_express=5; ENDPH_poc=4; ENDPH_bugfix=5; ENDPH_refactor=5; ENDPH_security_patch=5
ENDPH_classic=4; ENDPH_mvp=4; ENDPH_feature=5; ENDPH_enterprise=5; ENDPH_infra=5; ENDPH_workshop=5
for entry in classic express feature enterprise mvp poc bugfix refactor infra security-patch workshop; do
  f="$PACK/squad-instructions/entry-$entry.md"
  var="ENDPH_$entry"; var="${var//-/_}"
  WANT="${!var}"
  GOT=$(grep -oE '末位 phase.*P[0-9]' "$f" | head -1 | grep -oE 'P[0-9]' | head -1 || true)
  [ "$GOT" = "P$WANT" ] || fail_assert "entry terminal-phase label wrong: $entry got '$GOT' want P$WANT"
done
echo "route assertion 5/5: entry terminal-phase labels match end-of-route map (11/11)"
rm -rf "$RTMP"

STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
S="$STAGE/aidlc-relay-export"
mkdir -p "$S"
cp -R "$PACK" "$S/aidlc-relay-pack"
cp "$ROSTER" "$S/aidlc-relay-roster.json"
cp "$SEED" "$S/seed-aidlc-relay.sh"
cp "$README" "$S/README.md"
mkdir -p "$S/docs" && cp "$DOC72" "$S/docs/"
cp "$DOC73" "$S/docs/"

# manifest over staged content (sorted, LC_ALL=C)
(
  cd "$S" && find . -type f ! -name SHA256SUMS -print0 \
    | LC_ALL=C sort -z \
    | xargs -0 $SHA \
    | sed 's| \./| |' > "$S/SHA256SUMS"
)

# credential scan on the FINAL zip contents (plan P4: scan what actually ships)
ZIP_IN_STAGE="$STAGE/aidlc-relay-export-$VERSION.zip"
(
  cd "$STAGE" && zip -qr "$ZIP_IN_STAGE" aidlc-relay-export
)
HITS=0
while IFS= read -r f; do
  if unzip -p "$ZIP_IN_STAGE" "$f" | grep -nE 'mul_[A-Za-z0-9_-]{8,}|Bearer [A-Za-z0-9._-]{8,}|localhost|127\.0\.0\.1' >/dev/null 2>&1; then
    echo "CREDENTIAL SCAN HIT: $f"
    unzip -p "$ZIP_IN_STAGE" "$f" | grep -nE 'mul_[A-Za-z0-9_-]{8,}|Bearer [A-Za-z0-9._-]{8,}|localhost|127\.0\.0\.1' | head -5
    HITS=$((HITS+1))
  fi
done < <(unzip -Z1 "$ZIP_IN_STAGE" | grep -v '/$')
if [ "$HITS" -gt 0 ]; then
  echo "ERROR: credential scan found $HITS file(s) with token literals / localhost in the final zip"; exit 1
fi
echo "credential scan clean over $(unzip -Z1 "$ZIP_IN_STAGE" | grep -v '/$' | wc -l | tr -d ' ') files"

mv "$ZIP_IN_STAGE" "$OUT_ZIP"
echo "DONE. export zip: $OUT_ZIP"
$SHA "$OUT_ZIP"
