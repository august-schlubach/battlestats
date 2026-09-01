#!/usr/bin/env bash
# event_check.sh — One-shot health snapshot of the battlestats event-processing
# system: Celery workers (default/background/hydration/crawls/floor), RabbitMQ
# broker, and Beat. Read via the Flower API + the RabbitMQ management API +
# systemd, in a single SSH call. READ-ONLY — never restarts anything.
#
# Usage: ./server/scripts/event_check.sh [host]
#   Default host: battlestats.online
#
# Backing observability stack: agents/runbooks/runbook-flower-observability-2026-04-02.md
set -uo pipefail
HOST="${1:-battlestats.online}"

echo "========================================"
echo "  Event System Check"
echo "  Host: $HOST"
echo "  Time: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "========================================"

# NB the parse steps use `python3 -c '<prog>'` (program as an arg), so the curl
# JSON stays on stdin. `curl | python3 - <<'PY'` does NOT work: the heredoc
# replaces the pipe as stdin and Python reads an empty stream.
ssh "root@${HOST}" bash -s <<'REMOTE'
set -uo pipefail
F=/etc/battlestats-flower.env
FBA="$(grep -oP '^FLOWER_BASIC_AUTH=\K.*' "$F" 2>/dev/null)"
RMQ_AUTH="$(grep -oP '^FLOWER_BROKER_API=\K.*' "$F" 2>/dev/null | sed -E 's#https?://([^@]+)@.*#\1#')"
FAPI="http://127.0.0.1:5555/flower/api"
MAPI="http://127.0.0.1:15672/api"

echo; echo "## HOST"
uptime | sed 's/^/  load:/'
free -m | awk '/^Mem:/{printf "  mem: used=%sMB avail=%sMB\n",$3,$7} /^Swap:/{printf "  swap: used=%sMB\n",$3}'

echo; echo "## SERVICES"
for u in nginx redis-server rabbitmq-server battlestats-gunicorn battlestats-beat \
         battlestats-celery battlestats-celery-background battlestats-celery-hydration \
         battlestats-celery-crawls battlestats-celery-floor battlestats-flower; do
  printf "  %-32s %s\n" "$u" "$(systemctl is-active "$u" 2>/dev/null)"
done
failed="$(systemctl --failed --no-legend --plain 2>/dev/null | awk '{print $1}' | paste -sd, -)"
echo "  failed_units: ${failed:-none}"

echo; echo "## QUEUES (RabbitMQ mgmt API)"
curl -s -u "$RMQ_AUTH" "$MAPI/queues/%2F" 2>/dev/null | python3 -c '
import sys, json
try:
    qs = json.load(sys.stdin)
except Exception as e:
    print("  ERROR reading queues API:", e); sys.exit(0)
rows=[]
for q in qs:
    n=q.get("name","")
    if "pidbox" in n or n.startswith("celeryev"): continue
    ms=q.get("message_stats",{}) or {}
    pub=ms.get("publish_details",{}).get("rate",0.0)
    ack=ms.get("ack_details",{}).get("rate",0.0)
    rows.append((n, q.get("messages_ready",0), q.get("messages_unacknowledged",0),
                 q.get("consumers",0), pub, ack))
print("  %-12s %7s %8s %10s %8s %8s" % ("queue","ready","unacked","consumers","pub/s","ack/s"))
for n,r,u,c,p,a in sorted(rows):
    print("  %-12s %7d %8d %10d %8.2f %8.2f" % (n,r,u,c,p,a))
'

echo; echo "## BROKER OVERVIEW (RabbitMQ)"
curl -s -u "$RMQ_AUTH" "$MAPI/overview" 2>/dev/null | python3 -c '
import sys, json
try: d=json.load(sys.stdin)
except Exception as e: print("  ERROR:", e); sys.exit(0)
qt=d.get("queue_totals",{}) or {}; ms=d.get("message_stats",{}) or {}
print("  rabbitmq_version:", d.get("rabbitmq_version"))
print("  totals: ready=%s unacked=%s" % (qt.get("messages_ready",0), qt.get("messages_unacknowledged",0)))
print("  rates/s: publish=%.2f deliver=%.2f ack=%.2f" % (
    ms.get("publish_details",{}).get("rate",0.0),
    ms.get("deliver_get_details",{}).get("rate",0.0),
    ms.get("ack_details",{}).get("rate",0.0)))
'

echo; echo "## WORKERS (Flower API)"
curl -s -u "$FBA" "$FAPI/workers?refresh=1" 2>/dev/null | python3 -c '
import sys, json
try: d=json.load(sys.stdin)
except Exception as e: print("  ERROR:", e); sys.exit(0)
if not isinstance(d,dict) or not d:
    # Flower with an empty registry is a FLOWER fault, not proof the workers
    # are down — cross-check the RabbitMQ consumer counts above before
    # concluding anything. A dead Flower broker connection looks exactly like
    # this (2026-07-27: stale credentials, blind for a month).
    print("  STALE: no workers reported by Flower")
    print("  -> Flower cannot see the cluster. Check its broker connection:")
    print("     journalctl -u battlestats-flower -n 50 | grep -i refused")
    print("  -> Trust the QUEUES consumers column above for real worker liveness.")
    sys.exit(0)
print("  online:", len(d))
for name in sorted(d):
    w=d[name] or {}
    act=w.get("active")
    actn=len(act) if isinstance(act,list) else (act if isinstance(act,int) else "?")
    print("  %-28s active=%s" % (name, actn))
'

echo; echo "## RECENT TASKS (Flower API, last 500 seen)"
# Flower runs --persistent=True, so its db SURVIVES a dead event stream: when
# the broker connection breaks it keeps serving the last rows it ever saw, and
# they read as current. That is how a month-old snapshot was reported as live
# on 2026-07-27. Anything older than TASK_STALE_AFTER_S is refused outright
# rather than summarised.
TASK_STALE_AFTER_S=${TASK_STALE_AFTER_S:-600}
curl -s -u "$FBA" "$FAPI/tasks?limit=500" 2>/dev/null | TASK_STALE_AFTER_S="$TASK_STALE_AFTER_S" python3 -c '
import sys, json, collections, os, time
try: d=json.load(sys.stdin)
except Exception as e: print("  ERROR:", e); sys.exit(0)
items = list(d.values()) if isinstance(d,dict) else (d or [])
stale_after = float(os.environ.get("TASK_STALE_AFTER_S", "600"))
stamps = [t.get("received") or t.get("timestamp") for t in items if isinstance(t,dict)]
stamps = [t for t in stamps if isinstance(t,(int,float))]
if stamps:
    age = time.time() - max(stamps)
    if age > stale_after:
        newest = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(max(stamps)))
        print("  STALE: newest task event is %s (%.1f hours old)" % (newest, age/3600.0))
        print("  REFUSING to summarise — these are persisted rows, not live traffic.")
        print("  -> Either Flower lost its broker connection, or the workers are")
        print("     not emitting task events (CELERY_WORKER_SEND_TASK_EVENTS).")
        print("  -> Real throughput lives in the QUEUES ack/s column above.")
        sys.exit(0)
    print("  freshness: newest event %.0fs ago" % age)
st=collections.Counter(); names=collections.Counter(); fails=[]
fail_by_name=collections.Counter()
for t in items:
    if not isinstance(t,dict): continue
    s=t.get("state","?"); st[s]+=1
    nm=(t.get("name") or "?").split(".")[-1]
    names[nm]+=1
    if s == "FAILURE": fail_by_name[nm]+=1
    if s in ("FAILURE","RETRY"):
        fails.append((nm, str(t.get("exception") or "")[:90]))
total=sum(st.values())
print("  sampled:", total)
if total:
    print("  states:", ", ".join("%s=%d"%(k,v) for k,v in st.most_common()))
    print("  top tasks:", ", ".join("%s=%d"%(k,v) for k,v in names.most_common(6)))
    print("  failure_rate: %.1f%%" % (st.get("FAILURE",0)/total*100))
    # Every FAILURE is attributed by task name, unlike the FAIL sample below
    # which is capped at 8. Netting out a by-design long-cycle truncation
    # (crawl_all_clans_task) needs the FULL count, not the visible slice.
    if fail_by_name:
        print("  failures_by_task:", ", ".join("%s=%d"%(k,v) for k,v in fail_by_name.most_common()))
    for n,e in fails[:8]:
        print("  FAIL %s :: %s (sample capped at 8)" % (n,e))
else:
    print("  (no tasks captured yet — task-events may have just been (re)enabled)")
'

echo; echo "## RECENT ERRORS (journal, last 1h, error-level)"
any=0
for u in battlestats-celery battlestats-celery-background battlestats-celery-hydration \
         battlestats-celery-floor battlestats-celery-crawls battlestats-gunicorn battlestats-beat; do
  # journalctl prints "-- No entries --" when empty; filter it before counting.
  out="$(journalctl -u "$u" --since '1 hour ago' -p err --no-pager 2>/dev/null | grep -vF -- '-- No entries --')"
  n=$(printf '%s' "$out" | grep -c .)
  if [ "${n:-0}" -gt 0 ]; then
    last=$(printf '%s\n' "$out" | tail -1 | sed -E 's/^[A-Za-z]{3} [0-9 :]+ [^ ]+ //' | cut -c1-110)
    printf "  %-32s %s  | %s\n" "$u" "$n" "$last"; any=1
  fi
done
[ "$any" -eq 0 ] && echo "  none"

echo; echo "## PUBLIC SERVING (liveness; full surface = scripts/healthcheck.sh)"
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "https://battlestats.online/" 2>/dev/null)
printf "  %-20s %s\n" "GET /" "$code"
REMOTE
