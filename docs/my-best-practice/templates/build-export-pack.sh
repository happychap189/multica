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
OUT_DIR="${AIDLC_EXPORT_DIR:-$HERE}"
VERSION="${AIDLC_RELAY_VERSION:-v1}"
OUT_ZIP="$OUT_DIR/aidlc-relay-export-$VERSION.zip"

[ -d "$PACK" ] || { echo "ERROR: pack dir missing: $PACK"; exit 1; }
[ -f "$PACK/SKILL.md" ] || { echo "ERROR: SKILL.md missing in $PACK/"; exit 1; }
[ -f "$ROSTER" ] || { echo "ERROR: roster missing: $ROSTER"; exit 1; }
[ -f "$SEED" ] || { echo "ERROR: seed script missing: $SEED"; exit 1; }
[ -f "$README" ] || { echo "ERROR: README missing: $README"; exit 1; }
[ -f "$DOC72" ] || { echo "ERROR: usage guide missing: $DOC72"; exit 1; }

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

STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
S="$STAGE/aidlc-relay-export"
mkdir -p "$S"
cp -R "$PACK" "$S/aidlc-relay-pack"
cp "$ROSTER" "$S/aidlc-relay-roster.json"
cp "$SEED" "$S/seed-aidlc-relay.sh"
cp "$README" "$S/README.md"
mkdir -p "$S/docs" && cp "$DOC72" "$S/docs/"

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
