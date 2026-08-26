#!/usr/bin/env bash
#
# Daily snapshot of SERVICE health — the axis the ops digest was structurally
# blind to until 2026-08-26. The digest runs as the unprivileged `battlestats`
# user, which is in no group but its own and therefore cannot open the journal
# at all ("No journal files were opened due to insufficient permissions"). So it
# cannot ask systemd anything directly. This script runs as ROOT, reads the
# journal, and writes a plain JSON snapshot that the digest then consumes exactly
# like observation-floor / crawl-yield / recapture-lapsed.
#
# What it captures over a trailing window:
#   * Celery task failures per queue-unit (`raised unexpected`), by task name.
#   * Backend 5xx on gunicorn (`WORKER TIMEOUT`, `Error handling request`),
#     with the offending request paths.
#
# ZERO writes to the database, and no Django: this reads journald and nothing
# else, so it keeps working when the app itself is broken — which is precisely
# when it matters. Intended to run from a systemd timer ON THE DROPLET, ahead of
# the ops digest, but is safe to run by hand.
#
# The journal on this droplet retains only ~6 days. A window longer than that
# silently measures a shorter one, so WINDOW_HOURS must stay well inside it.
#
# Env overrides (all optional):
#   APP_ROOT       deploy root          (default /opt/battlestats-server)
#   OUT_DIR        snapshot directory   (default $APP_ROOT/shared/benchmarks/service-health)
#   WINDOW_HOURS   lookback window      (default 24)
#   KEEP           snapshots to retain  (default 180)
#
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/battlestats-server}"
OUT_DIR="${OUT_DIR:-${APP_ROOT}/shared/benchmarks/service-health}"
WINDOW_HOURS="${WINDOW_HOURS:-24}"
KEEP="${KEEP:-180}"

CELERY_UNITS="battlestats-celery battlestats-celery-background battlestats-celery-floor battlestats-celery-hydration battlestats-celery-crawls battlestats-beat"
GUNICORN_UNIT="battlestats-gunicorn"

mkdir -p "$OUT_DIR"
TS="$(TZ=UTC date +%Y-%m-%d_%H%MZ)"
OUT="${OUT_DIR}/${TS}.json"
TMP="${OUT}.partial"
SINCE="$(TZ=UTC date -u -d "${WINDOW_HOURS} hours ago" +'%Y-%m-%d %H:%M:%S')"

# Journal reachability is itself a finding. If this script is ever run as a user
# that cannot read the journal, every count below would come back 0 and the
# snapshot would assert "all healthy" — the exact failure mode this file exists
# to end. Record the answer rather than inferring it from a zero.
journal_readable=true
if ! journalctl -n 1 -q >/dev/null 2>&1; then
    journal_readable=false
fi

# Per-unit Celery failures. `-g` filters server-side: piping the whole journal
# through grep serialises it and times out on a 4 GB journal.
#
# SUCCESSES are counted too, and that is the load-bearing part. Alerting on "this
# task failed at least once" fires ~8 conditions a day here, almost all of them
# cache warmers that fail a fraction of their runs and degrade to the durable
# :published copy by design. A digest that cries every morning gets ignored, and
# then it may as well not exist. What actually distinguishes a broken task is
# that it NEVER succeeds: the nightly rollup failed 5 of 5 nights. So carry both
# numbers and let the evaluator ask "did this ever succeed in the window?".
celery_raw=""
realm_ok_raw=""
for unit in $CELERY_UNITS; do
    fail_lines="$(journalctl -u "$unit" -g "raised unexpected" \
                  --since "$SINCE" --no-pager -o cat -q 2>/dev/null || true)"
    # ONE sweep serves both success tallies. Adding a third journalctl call per
    # unit would cost a sixth pass over a 4 GB journal on 2 vCPU, and this writer
    # already burns ~90s per run.
    ok_sweep="$(journalctl -u "$unit" -g 'succeeded in|Finished [a-z_0-9]+ realm=' \
                --since "$SINCE" --no-pager -o cat -q 2>/dev/null || true)"
    ok_counts="$(printf '%s\n' "$ok_sweep" \
                 | grep -a 'succeeded in' \
                 | grep -aoE 'warships\.tasks\.[a-z_0-9]+' \
                 | sort | uniq -c || true)"
    # Per-realm SUCCESS counts, from the tasks' own completion lines.
    #
    # Successes, not failures: attributing a failure to a realm would mean
    # parsing exception paths, and `succeeded in` cannot be used either because
    # a lock-skip returns {"status": "skipped"} and Celery logs THAT as
    # succeeded. The tasks emit `Finished <task> realm=<r>` only when they did
    # real work, so this counts warms rather than no-ops.
    #
    # Reuses the sweep above: one more grep, no extra journalctl call.
    realm_ok="$(printf '%s\n' "$ok_sweep" \
                | grep -aoE 'Finished [a-z_0-9]+ realm=[a-z]+' \
                | sed -E 's/Finished ([a-z_0-9]+) realm=([a-z]+)/\1 \2/' \
                | sort | uniq -c || true)"
    while read -r rcount rtask rrealm; do
        [ -n "${rcount:-}" ] || continue
        realm_ok_raw="${realm_ok_raw}warships.tasks.${rtask}|${rrealm}|${rcount}"$'\n'
    done <<< "$realm_ok"
    counts="$(printf '%s\n' "$fail_lines" \
              | grep -aoE 'warships\.tasks\.[a-z_0-9]+.*raised unexpected: [A-Za-z_]+' \
              | sed -E 's/(warships\.tasks\.[a-z_0-9]+).*raised unexpected: ([A-Za-z_]+).*/\1 \2/' \
              | sort | uniq -c | sort -rn || true)"
    while read -r count task exc; do
        [ -n "${count:-}" ] || continue
        # Successes for this exact task on this exact unit, 0 if it never did.
        ok="$(printf '%s\n' "$ok_counts" | awk -v t="$task" '$2 == t { print $1; exit }')"
        celery_raw="${celery_raw}${unit}|${task}|${exc}|${count}|${ok:-0}"$'\n'
    done <<< "$counts"
done

# gunicorn: worker timeouts and the request paths that caused them.
gunicorn_timeouts="$(journalctl -u "$GUNICORN_UNIT" -g "WORKER TIMEOUT" \
                     --since "$SINCE" --no-pager -o cat -q 2>/dev/null | grep -ac . || true)"
gunicorn_errors_raw="$(journalctl -u "$GUNICORN_UNIT" -g "Error handling request" \
                       --since "$SINCE" --no-pager -o cat -q 2>/dev/null \
                       | sed -E 's/.*Error handling request //; s/\?.*//' \
                       | sort | uniq -c | sort -rn || true)"

export SINCE WINDOW_HOURS journal_readable celery_raw realm_ok_raw gunicorn_timeouts gunicorn_errors_raw

# Assemble with python3 so the JSON is escaped correctly and validated by
# construction; a hand-built heredoc would break on the first odd path.
/usr/bin/python3 - > "$TMP" <<'PY'
import json, os
from datetime import datetime, timezone

def _int(raw, default=0):
    try:
        return int(str(raw).strip())
    except (TypeError, ValueError):
        return default

celery = []
for line in (os.environ.get("celery_raw") or "").splitlines():
    if not line.strip():
        continue
    parts = line.split("|")
    if len(parts) != 5:
        continue
    unit, task, exc, count, ok = parts
    celery.append({
        "unit": unit,
        "task": task,
        "exception": exc,
        "count": _int(count),
        # 0 successes alongside >0 failures is the signal that matters: the task
        # is not flaky, it is broken. See the comment on the collection loop.
        "succeeded": _int(ok),
    })
celery.sort(key=lambda r: (-r["count"], r["task"]))

realm_ok = []
for line in (os.environ.get("realm_ok_raw") or "").splitlines():
    parts = line.split("|")
    if len(parts) != 3:
        continue
    task, realm, count = parts
    realm_ok.append({"task": task, "realm": realm, "count": int(count)})
realm_ok.sort(key=lambda r: (r["task"], r["realm"]))

paths = []
for line in (os.environ.get("gunicorn_errors_raw") or "").splitlines():
    line = line.strip()
    if not line:
        continue
    count, _, path = line.partition(" ")
    path = path.strip()
    if path:
        paths.append({"path": path, "count": _int(count)})
paths.sort(key=lambda r: (-r["count"], r["path"]))

snapshot = {
    # Naive UTC, matching every other family; the digest parses it with
    # datetime.fromisoformat and compares against a naive utcnow().
    "captured_at": datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
    "window_hours": _int(os.environ.get("WINDOW_HOURS"), 24),
    "since": os.environ.get("SINCE"),
    # False means every count below is meaningless, NOT that the box is healthy.
    "journal_readable": (os.environ.get("journal_readable") == "true"),
    "celery_task_failures": celery,
    # Per-(task, realm) successes. Absent in older writers; the evaluator
    # treats a missing key as "not measured" rather than as zero.
    "celery_realm_successes": realm_ok,
    "celery_failure_total": sum(r["count"] for r in celery),
    "gunicorn_worker_timeouts": _int(os.environ.get("gunicorn_timeouts")),
    "gunicorn_error_paths": paths,
    "gunicorn_error_total": sum(r["count"] for r in paths),
    "status": "ok",
}
print(json.dumps(snapshot, indent=2))
PY

# Validate before publishing, so a garbled run never lands as a snapshot.
/usr/bin/python3 -c "import json,sys; json.load(open(sys.argv[1]))" "$TMP"

mv -f "$TMP" "$OUT"
echo "wrote $OUT"

# Retention: keep the newest $KEEP snapshots, prune the rest.
ls -1t "$OUT_DIR"/*.json 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f
