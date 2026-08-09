#!/usr/bin/env bash
#
# check_env_drift.sh — reconcile production env values against the repo.
#
# WHY THIS EXISTS (2026-08-05)
# ---------------------------
# A disk-growth investigation lost time three separate ways, all the same error:
# a doc or an agent asserted a production value that nothing in the repo could
# confirm.
#
#   1. CLAUDE.md + two runbooks said battle-history retention was 92 days.
#      Live value was 105 (deliberately, to sustain the 90d rolling read).
#      An audit agent then proposed *cutting* retention as a disk lever —
#      i.e. proposed undoing a committed roadmap item.
#   2. BATTLE_OBSERVATION_COMPACT_KEEP was inferred to be the code default (3)
#      because the deploy script does not pin it. Live value is 1.
#   3. The 07-19 audit's F6 asserted the battles_json prune was "visibly
#      working", inferred from data shape. PRUNE_BATTLES_JSON_ENABLED=0 —
#      it has never run.
#
# The rule this enforces: a production value is established by the deploy
# script or the live /etc file, NEVER by a code default, NEVER by prose, and
# NEVER by inference from data shape.
#
# Read-only. SSHes to the droplet, touches nothing.
#
# Usage:
#   server/scripts/check_env_drift.sh [host]            # default: battlestats.online
#   server/scripts/check_env_drift.sh --strict [host]   # also fail on unpinned keys
#
# Exit codes: 0 = no actionable drift; 1 = drift found; 2 = could not run.
#
# By default checks 1, 3 and 4 fail the gate — a pin that production is
# ignoring, a doc that contradicts production, and an ops-email config key whose
# authorities disagree. Check 2 (behaviour keys the deploy script never pins)
# reports but does not fail: pinning that backlog is a separate reviewable
# change, and a permanently-red gate gets ignored, which is the failure mode
# this script exists to prevent. Run --strict once the backlog is pinned so it
# cannot regrow.
#
# Check 4 covers a SECOND env file that checks 1-3 structurally cannot see:
# /etc/battlestats-ops-email.env, which the deploy script does not manage. Its
# keys are reconciled three ways — live /etc, Pass, and the code default — by
# an explicit allowlist, because that file is secret-dense and checks 1-2 print
# values. See OPS_KEYS below before adding to it.

set -uo pipefail

STRICT=0
ARGS=()
for a in "$@"; do
  case "$a" in
    --strict) STRICT=1 ;;
    -h|--help) sed -n '2,40p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) ARGS+=("$a") ;;
  esac
done
set -- "${ARGS[@]+"${ARGS[@]}"}"

HOST="${1:-battlestats.online}"
SSH_USER="${BATTLESTATS_SSH_USER:-root}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEPLOY_SCRIPT="${REPO_ROOT}/server/deploy/deploy_to_droplet.sh"
REMOTE_ENV="/etc/battlestats-server.env"

# ── The second env file (check 4) ────────────────────────────────────────────
# /etc/battlestats-ops-email.env is NOT managed by the deploy script, so checks
# 1-3 cannot see it at all. It is also the most secret-dense file on the box:
# SMTP_PASS, ANTHROPIC_API_KEY, PURELYMAIL_API_TOKEN. Checks 1-2 print
# `live=<value>` freely, which would dump those to stdout.
#
# So this file is reconciled by ALLOWLIST, never by enumeration: only the keys
# named below are fetched, and the remote grep is built from that same list, so
# a secret never crosses the wire in the first place. Adding a key here means
# asserting it is safe to print. Do not add a credential.
#
# Each allowlisted key has three potential authorities, and drift means any two
# disagree: the live /etc file (what actually runs), Pass (canonical -- the
# on-disk file is generated from it, so a Pass/live split means the next
# regeneration silently reverts production), and the code default in the
# consuming script (what runs if the env file omits the key entirely).
OPS_ENV="/etc/battlestats-ops-email.env"
OPS_KEYS=(ANTHROPIC_MODEL)
declare -A OPS_PASS_ENTRY=( [ANTHROPIC_MODEL]="battlestats/anthropic-model" )
OPS_CONSUMERS=(
  "${REPO_ROOT}/server/scripts/daily_ops_email.py"
  "${REPO_ROOT}/server/scripts/daily_traffic_email.py"
)

# Docs that are allowed to state live values, and are therefore checked.
DOC_PATHS=(
  "${REPO_ROOT}/CLAUDE.md"
  "${REPO_ROOT}/agents/runbooks/ops-env-reference.md"
)

# Keys that legitimately live only in Pass / the droplet: infrastructure and
# secrets. Absence from the git-tracked deploy script is CORRECT for these,
# so they are excluded from the "unpinned" report to keep the signal clean.
INFRA_KEYS_RE='^(DB_|DJANGO_|REDIS_URL|CELERY_RESULT_BACKEND|CELERY_BROKER_URL|WG_APP_ID|ANALYTICS_IGNORE_IPS|.*_PASSWORD|.*_SECRET|.*_TOKEN)'

RED=$'\033[31m'; YEL=$'\033[33m'; GRN=$'\033[32m'; DIM=$'\033[2m'; OFF=$'\033[0m'
[[ -t 1 ]] || { RED=""; YEL=""; GRN=""; DIM=""; OFF=""; }

[[ -r "$DEPLOY_SCRIPT" ]] || { echo "${RED}cannot read ${DEPLOY_SCRIPT}${OFF}" >&2; exit 2; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Reconciling ${HOST}:${REMOTE_ENV} against the repo..."
echo

if ! ssh -o ConnectTimeout=15 -o BatchMode=yes "${SSH_USER}@${HOST}" \
      "cat ${REMOTE_ENV}" > "${TMP}/etc.raw" 2>"${TMP}/ssh.err"; then
  echo "${RED}SSH failed:${OFF} $(head -1 "${TMP}/ssh.err")" >&2
  exit 2
fi

# KEY<TAB>VALUE, quotes stripped, comments and blanks dropped.
grep -oP '^[A-Z_][A-Z0-9_]*=.*$' "${TMP}/etc.raw" \
  | sed 's/=/\t/' | sed 's/\t"/\t/; s/"$//' | sort -u > "${TMP}/etc.kv"
cut -f1 "${TMP}/etc.kv" | sort -u > "${TMP}/etc.keys"

grep -oP 'set_env_value\s+\K[A-Z_][A-Z0-9_]*\s+\S+' "$DEPLOY_SCRIPT" \
  | sed 's/\s\+/\t/' | sed 's/\t"/\t/; s/"$//' | sort -u > "${TMP}/pin.kv"
cut -f1 "${TMP}/pin.kv" | sort -u > "${TMP}/pin.keys"

drift=0
unpinned_documented=0

# ── 1. Pinned but NOT winning. The dangerous case: the repo asserts a value
#       and production disagrees. Always actionable.
echo "${DIM}── 1. Pinned in deploy script but DIVERGENT in /etc ─────────────${OFF}"
divergent=0
while IFS=$'\t' read -r key pinned; do
  [[ -n "$key" ]] || continue
  live="$(awk -F'\t' -v k="$key" '$1==k{print $2; exit}' "${TMP}/etc.kv")"
  [[ -n "$live" ]] || continue
  # Tolerate ${VAR} interpolation in the deploy script; can't resolve statically.
  [[ "$pinned" == *'${'* ]] && continue
  if [[ "$pinned" != "$live" ]]; then
    printf '  %s%-46s%s repo=%-14s live=%s\n' "$RED" "$key" "$OFF" "$pinned" "$live"
    divergent=$((divergent+1))
  fi
done < "${TMP}/pin.kv"
if [[ $divergent -eq 0 ]]; then
  echo "  ${GRN}none${OFF} — every pin is winning in production"
else
  drift=1
fi
echo

# ── 2. Live behavior keys the repo does not pin. These survive deploys
#       (set_env_value edits in place), so this is a visibility problem, not
#       an outage risk — until a droplet rebuild, when the value is simply lost.
echo "${DIM}── 2. Live in /etc but UNPINNED in the deploy script ────────────${OFF}"
comm -23 "${TMP}/etc.keys" "${TMP}/pin.keys" \
  | grep -vE "$INFRA_KEYS_RE" > "${TMP}/unpinned.keys" || true
if [[ -s "${TMP}/unpinned.keys" ]]; then
  echo "  ${DIM}(infra/secret keys excluded — those belong in Pass, not the repo)${OFF}"
  while read -r key; do
    live="$(awk -F'\t' -v k="$key" '$1==k{print $2; exit}' "${TMP}/etc.kv")"
    # Flag loudest when a doc talks about a key the repo cannot pin down.
    if grep -qlF "$key" "${DOC_PATHS[@]}" 2>/dev/null; then
      printf '  %s%-46s%s live=%-14s %s← described in docs, unverifiable from repo%s\n' \
        "$YEL" "$key" "$OFF" "$live" "$YEL" "$OFF"
      unpinned_documented=$((unpinned_documented+1))
      # Deliberately does NOT fail the gate by default. Pinning these is a
      # separate reviewable change with its own deploy risk, and a gate that is
      # permanently red gets ignored — which is how we got here. Use --strict
      # once the backlog is pinned, to keep it from regrowing.
      [[ $STRICT -eq 1 ]] && drift=1
    else
      printf '  %s%-46s live=%s%s\n' "$DIM" "$key" "$live" "$OFF"
    fi
  done < "${TMP}/unpinned.keys"
else
  echo "  ${GRN}none${OFF}"
fi
echo

# ── 3. Docs stating a literal that contradicts production. This is the check
#       that would have caught 92-vs-105.
echo "${DIM}── 3. Docs asserting a value that contradicts /etc ──────────────${OFF}"
doc_drift=0
DOC_LIST="$(printf '%s\n' "${DOC_PATHS[@]}")" ETC_KV="${TMP}/etc.kv" \
python3 - <<'PYDRIFT' > "${TMP}/doc.report"
import os, re, sys

docs = [p for p in os.environ["DOC_LIST"].splitlines() if p.strip()]
live = {}
for line in open(os.environ["ETC_KV"]):
    if "\t" not in line:
        continue
    k, v = line.rstrip("\n").split("\t", 1)
    if v.isdigit():
        live[k] = v

KEY_TOKEN = re.compile(r"[A-Z][A-Z0-9_]{3,}")
# A value-shaped number: **105**, (92), (**1 ...**), prod=45, = 30, `=1`
VALUE_NUM = re.compile(r"(?:\*\*|\(|prod=|=\s*)\**(\d{1,6})(?=\**(?:[)\s,;.]|$))")

for doc in docs:
    if not os.path.isfile(doc):
        continue
    for lineno, text in enumerate(open(doc, errors="replace"), 1):
        for key, val in live.items():
            start = text.find(key)
            if start < 0:
                continue
            # Restrict to this key's SEGMENT: from the key up to the next
            # different ALL-CAPS env-var token. Without this, a line that
            # documents several keys cross-flags every one of them with a
            # neighbour's value — the dominant false positive.
            seg_end = len(text)
            for m in KEY_TOKEN.finditer(text, start + len(key)):
                if m.group(0) != key:
                    seg_end = m.start()
                    break
            seg = text[start:seg_end]
            nums = set(VALUE_NUM.findall(seg))
            # No value-shaped number -> the line names the key without
            # asserting a value (prose, cross-reference, list). Nothing to
            # contradict.
            if not nums or val in nums:
                continue
            snippet = " ".join(seg.split())[:88]
            print("  %s:%d %s (live=%s) %s"
                  % (os.path.basename(doc), lineno, key, val, snippet))
PYDRIFT
cat "${TMP}/doc.report"
doc_drift="$(wc -l < "${TMP}/doc.report" | tr -d ' ')"
if [[ "$doc_drift" -eq 0 ]]; then
  echo "  ${GRN}none${OFF}"
else
  echo
  echo "  ${DIM}Numbers are read only from value-shaped positions (**105**, (92), prod=45)"
  echo "  and only from the segment of the line belonging to that key, so a line"
  echo "  documenting several keys no longer cross-flags. Residual false positives"
  echo "  are possible; confirm by hand. Fix by naming the authority rather than"
  echo "  restating the number — e.g. \"prod=105, pinned in deploy_to_droplet.sh\".${OFF}"
  drift=1
fi
echo

# ── 4. The ops-email env file: /etc vs Pass vs the code default.
#       Allowlisted keys only — see OPS_KEYS above for why.
echo "${DIM}── 4. ${OPS_ENV}: /etc vs Pass vs code default ──${OFF}"

# Build the remote grep from the allowlist so only those lines are ever read.
ops_pattern="^($(IFS='|'; echo "${OPS_KEYS[*]}"))="
if ! ssh -o ConnectTimeout=15 -o BatchMode=yes "${SSH_USER}@${HOST}" \
      "grep -E '${ops_pattern}' ${OPS_ENV} 2>/dev/null" > "${TMP}/ops.raw" 2>"${TMP}/ops.err"; then
  : # empty or unreadable; handled per key below
fi
sed 's/=/\t/' "${TMP}/ops.raw" | sed 's/\t"/\t/; s/"$//' | sort -u > "${TMP}/ops.kv"

# Pass needs a decrypted key. ~/.bashrc returns early for non-interactive
# shells, so __gpg_unlock is not even DEFINED here -- force a full load. A
# locked key must degrade to "unreadable", never to a false drift claim.
read_pass() {
  local entry="$1" out
  out="$(pass show "$entry" 2>/dev/null | head -1)"
  [[ -n "$out" ]] || out="$(bash -i -c "__gpg_unlock >/dev/null 2>&1; pass show '${entry}' 2>/dev/null | head -1" 2>/dev/null)"
  printf '%s' "$out"
}

ops_drift=0
for key in "${OPS_KEYS[@]}"; do
  live="$(awk -F'\t' -v k="$key" '$1==k{print $2; exit}' "${TMP}/ops.kv")"
  vault="$(read_pass "${OPS_PASS_ENTRY[$key]}")"
  # Code default: cfg("KEY", "default") in the consuming scripts. Several
  # consumers must agree with each other as well as with /etc.
  mapfile -t defaults < <(
    grep -hoP "cfg\(\"${key}\",\s*\"\K[^\"]+" "${OPS_CONSUMERS[@]}" 2>/dev/null | sort -u
  )
  code="$(IFS='/'; echo "${defaults[*]:-}")"

  if [[ -z "$live" ]]; then
    printf '  %s%-24s%s not set in /etc — the code default (%s) is what runs\n' \
      "$YEL" "$key" "$OFF" "${code:-unknown}"
    ops_drift=$((ops_drift+1))
    continue
  fi
  if [[ -z "$vault" ]]; then
    printf '  %s%-24s%s live=%-16s pass=%sunreadable%s code=%s\n' \
      "$YEL" "$key" "$OFF" "$live" "$DIM" "$OFF" "${code:-unknown}"
    echo "    ${DIM}Locked key or missing entry — these look identical from here. Try"
    echo "    __gpg_unlock (~/.bashrc:172); if it still reads empty the entry is absent."
    echo "    Not counted as drift either way: a silent gate beats a false accusation.${OFF}"
    continue
  fi
  if [[ "$live" != "$vault" ]]; then
    printf '  %s%-24s%s live=%-16s pass=%-16s %s← next regeneration reverts production%s\n' \
      "$RED" "$key" "$OFF" "$live" "$vault" "$RED" "$OFF"
    ops_drift=$((ops_drift+1))
  elif [[ -n "$code" && "$code" != "$live" ]]; then
    printf '  %s%-24s%s live=%-16s code=%-16s %s← agrees with Pass; code default would differ if /etc lost the key%s\n' \
      "$YEL" "$key" "$OFF" "$live" "$code" "$YEL" "$OFF"
    ops_drift=$((ops_drift+1))
  else
    printf '  %s%-24s%s %slive = pass = code = %s%s\n' "$GRN" "$key" "$OFF" "$DIM" "$live" "$OFF"
  fi
done
if [[ $ops_drift -gt 0 ]]; then
  drift=1
fi
echo

if [[ $drift -eq 0 ]]; then
  echo "${GRN}No actionable drift.${OFF}"
  if [[ $unpinned_documented -gt 0 ]]; then
    echo "${DIM}(${unpinned_documented} documented keys remain unpinned — informational; run --strict to gate on them.)${OFF}"
  fi
else
  echo "${YEL}Drift found — see above.${OFF} A production value is established by the"
  echo "deploy script or live /etc, never by a code default and never by prose."
fi
exit $drift
