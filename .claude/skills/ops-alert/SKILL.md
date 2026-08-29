---
name: ops-alert
description: Pull the newest battlestats ops mail from the operator's Gmail, recover the deterministic condition codes behind it, investigate each one against the right instrument, and carry the fix through to production. Use when the user says "/ops-alert", "pull the latest ops alert", "check my ops email", "what did the digest say", "investigate the alert", "did anything trip overnight", "any alerts?", or forwards an ops ALERT subject line. Mutating on the remedy path — the investigation is read-only, but fixes may be committed and deployed, and a handled mail is marked read and archived so the inbox stays a true to-do queue.
---

# ops-alert

Reads the morning mail from the `battlestats-ops-digest` timer, converts it back
into the **deterministic condition codes** that caused it, investigates each one
with the instrument that owns it, and — unlike every sibling ops skill — carries
the remedy through under the autonomy rules below, ending by marking the mail
read and archiving it so the inbox keeps meaning "not yet dealt with".

The digest is **exception-only** (`server/scripts/daily_ops_email.py`, systemd
`battlestats-ops-digest.timer`, 11:30 UTC ±300s). Python's `evaluate()` decides
whether to mail at all; the LLM is invoked only to *write up* conditions Python
already committed to sending, and it is forbidden to comment on anything outside
`tripped_conditions`. Design and every threshold's derivation:
`agents/runbooks/runbook-ops-email-exception-only-2026-08-09.md`.

**Scope.** This skill starts from *the mail* and ends at *a remedy*. For a
standing readout with no alert behind it, use the instrument directly:
`/observation` (floor coverage), `/crawl-yield` (clan-crawl yield), `/recapture`
(lapsed-player sweep), `event-check` (live Celery/queues), `enrichment-status`
(crawler health), `/feedback` (visitor reports).

## Three mail types, three different jobs

Route on the subject **before** reading a word of the body:

| Subject | What it means | What to do |
|---|---|---|
| `[battlestats] ops ALERT: …` | Conditions tripped. The rest of the subject is LLM prose, not the codes. | Full procedure below. |
| `[battlestats] ops heartbeat: all clear` | Weekly Monday proof-of-life (`OPS_EMAIL_HEARTBEAT_DOW`, default `mon`). **Not an alert.** | Say "no alert outstanding", note the heartbeat date, stop. |
| `[battlestats] daily ops email FAILED` | The `__main__` guard fired. **No conditions were evaluated at all** — this is the reporting path itself broken. | Read the traceback; it is not a condition list. Fix the digest, then re-run it dry to get a real verdict. |

## Procedure

### 1. Find the newest ops mail

```
mcp__mailcap__gmail_search  query: from:sysop@tamezz.com subject:ops  max_results: 10
```

`subject:ops` is chosen so all three subjects match. Do **not** search
`subject:"[battlestats] ops"` — Gmail treats it as a phrase and the FAILED mail
(`[battlestats] daily ops email FAILED`) does not contain it, so the one message
you least want to miss is exactly the one that gets dropped.

Then `gmail_get_message` with `format=metadata` for Subject and Date.

**No results is a finding, not an all-clear.** Exception-only mail makes silence
ambiguous between health and a dead reporting path. Resolve it at the timer, not
by assumption — step 3's journal read is the proof. The weekly heartbeat exists
precisely to close this gap; if no `ops heartbeat` mail has arrived on any recent
Monday, treat that as a condition in its own right and check
`OPS_EMAIL_HEARTBEAT_DOW` on the droplet.

**The mailbox is not the send record.** Verified 2026-08-28: the timer journal
showed alerts sent on 08-23, 08-26, 08-27, 08-28 and a heartbeat on 08-24, while
the mailbox held only 08-27 and 08-28. Mail is deleted, filtered, or lost between
the droplet and the inbox. So Gmail answers "what did the operator see"; only
`journalctl -u battlestats-ops-digest` answers "what did the platform report".
Read both before concluding a quiet stretch was quiet.

### 2. Extract the body — `get_message` will not give it to you

The mail is `multipart/alternative` whose `text/plain` part is the stub
**"See the HTML version of this message."** Both `format=full` and `format=raw`
return that stub. An agent that stops there concludes the alert is empty.

Export and strip the HTML part:

```
mcp__mailcap__gmail_export_messages  message_ids: ["<id>"]  path: <scratchpad>/ops-alert.mbox
```

```bash
python3 - <<'PY'
import mailbox, html, re
m = list(mailbox.mbox('<scratchpad>/ops-alert.mbox'))[-1]
print('SUBJECT:', m['Subject']); print('DATE:', m['Date'])
for p in m.walk():
    if p.get_content_type() == 'text/html':
        t = p.get_payload(decode=True).decode('utf-8', 'replace')
        t = re.sub(r'<(script|style).*?</\1>', '', t, flags=re.S | re.I)
        t = re.sub(r'<(br|/p|/div|/h[1-6]|/li|/tr)[^>]*>', '\n', t, flags=re.I)
        print(re.sub(r'\n{3,}', '\n\n', html.unescape(re.sub(r'<[^>]+>', '', t))).strip())
PY
```

The body names each condition code as a numbered section. Those codes, not the
prose around them, are what you investigate.

### 3. Get the authoritative verdict from the droplet

The email is a *rendering*. Re-run the evaluator for the codes themselves:

```bash
ssh root@battlestats.online 'cd /opt/battlestats-server/current/server && \
  /usr/bin/python3 scripts/daily_ops_email.py --dry-run --no-llm'
```

`--dry-run` returns before `send_email`; `--no-llm` skips the Anthropic call.
Together they are deterministic, send nothing, and cost nothing. Output is
`VERDICT: N condition(s) tripped` then one `[code] detail` line each.

**What the dry run buys is the exact codes, not fresher truth.** Every family it
reads is a once-daily file — service-health 11:00 UTC, recapture 10:10/10:30/10:50,
observation 04:30 — and the digest mails at 11:30. Re-run the same afternoon and
it reads the *same* snapshots, so it reproduces the morning's verdict almost by
construction. It shows drift only if a producer wrote a late file since.

**Live recovery is confirmed in the worker journal, never in the dry run.**
Verified 2026-08-28: asia correlations succeeded at 16:58 and the dry run still
listed `celery_task_realm_failing:…:asia`, because the 11:01 snapshot is all it
can see. An agent that trusts the dry run for "now" reports a recovered realm as
still dark. For each condition, go to the owning unit's journal for the window
*since* the snapshot before calling anything unresolved.

Also read the timer journal, which is the only place an all-clear day is
recorded:

```bash
ssh root@battlestats.online 'journalctl -u battlestats-ops-digest \
  --since "10 days ago" --no-pager | tail -30'
```

`[ok] all clear …` lines prove the timer ran and chose silence. Their **absence**
on a day with no mail means the timer, not the platform, is what to fix.

### 4. Investigate each condition with its owning instrument

Work the codes in the order the alert recommends, or worst-first. `{r}` is a
realm.

**Service health** — from `snapshot_service_health.sh`, a root-run journal scan
at 11:00 UTC, half an hour before the digest. This family exists because the
digest runs as the app user and **cannot open the journal at all**; without it
the digest is blind to Celery and gunicorn entirely.

| Code | First probe |
|---|---|
| `celery_task_failing:<task>` | The task raised ≥1× and **succeeded 0 times** in 24h — broken, not flaky (a task with any success is filtered out deliberately). `journalctl -u <unit> --since "24 hours ago" \| grep <task>`. Then `event-check` for the queue behind it. **First ask whether the task's unit of work fits in 24h.** A task whose work spans several dispatches by design has legitimate zero-success days, and this rule reads that as broken: `crawl_all_clans_task` completes a pass every 2-4 dispatches, so 4 days in 7 look like a total failure. Those tasks are judged by the staleness rule on their *output* instead, and are listed in `LONG_CYCLE_TASKS` (`server/scripts/daily_ops_email.py`). If a zero-success task is not in that set, check its cadence before believing the condition. |
| `celery_task_realm_failing:<task>:{r}` | The task completed 0× for that realm while succeeding on another. Two candidates only: it is no longer **dispatched** for that realm (check `signals.py` Beat registration and per-realm striping), or it fails only there. Confirm which before touching code. |
| `gunicorn_worker_timeouts` | Each is a 500 with an **empty body**. The load-bearing rule from CLAUDE.md applies: no `/api/fetch/*` endpoint may block the request thread. But **the named paths are an attribution heuristic, not a diagnosis** — the writer reports paths seen near the timeout. Get the real `[CRITICAL] WORKER TIMEOUT` lines (`journalctl -u battlestats-gunicorn \| grep "WORKER TIMEOUT"`) and read their timestamps: several workers dying in the same second is a shared-resource stall (DB, lock), not a slow handler, and chasing the named path then wastes the whole investigation. |
| `journal_unreadable:service-health` | The writer could not read the journal, so every count in the family is an invented zero meaning "not measured", **not** "nothing failed". Check the unit still runs as root. All other counts this run are void. |
| `snapshot_stale:service-health` | `battlestats-service-health.timer` is late or dead. Fix it before believing any zero. |

**Recapture** (`recapture_*`, `realm_snapshot_missing:recapture-lapsed:{r}`,
`snapshot_stale:recapture-lapsed:{r}`) — use `/recapture`. Read `aborted`,
`partial`, and `flush_failed` as three independent axes, in that order; an
aborted run is non-informative, not zero-yield. A **missing** snapshot outranks
any field in the previous day's file: on 2026-08-15 the run crashed in its own
truncation handler and the alert's `partial` operands belonged to a different
pass.

**Crawl yield** (`crawl_low_classified:{r}`, `crawl_no_yield:{r}`,
`crawl_bucket_mismatch:{r}`, `snapshot_stale:crawl-yield:{r}`) — use
`/crawl-yield`. `players_classified` floors are **per realm**; the realms differ
1.8×. A low-classified condition has read as a WG-side outage before
(2026-08-10, na) rather than a defect here.

**Observation floor** (`obs_low_coverage:{r}`, `obs_low_distinct_productive:{r}`,
`snapshot_partial:observation-floor`, `snapshot_stale`) — use `/observation`.
These numeric rules are **catastrophe backstops** set outside the whole observed
envelope; none has fired historically. If one fires, something large broke —
do not treat it as drift.

**Any `snapshot_*` / `realm_snapshot_missing` code** — the producing task, not
the metric. Shape is checked before counts everywhere for one reason: a
truncated pass is numerically indistinguishable from a healthy one, so the shape
field is the only signal. Never explain away a shape condition with a number.

### 5. Check whether the fix is already in flight

**Before writing any code.** The cheapest step and the easiest to skip:

```bash
git log --oneline -15 --all -- <suspect file>
git branch -a --sort=-committerdate | head -15
```

A known defect may already be fixed on an unmerged branch — the
`/api/landing/player-suggestions` timeout was diagnosed and fixed on a branch on
2026-08-26 and kept firing because the fix was never merged and deployed. If a
fix exists, the remedy is merge + deploy, not a second implementation.

### 6. Remedy

Two lanes. Know which one you are in before acting.

**Autonomous** (CLAUDE.md grants these outright; do not stop to ask):
repo file edits, tests, `./run_test_suite.sh` or `/release-gate`, branch and
commit, `./scripts/release.sh patch|minor|major`, and deploys via
`./server/deploy/deploy_to_droplet.sh battlestats.online` /
`./client/deploy/deploy_to_droplet.sh battlestats.online`.

Two standing obligations on this lane: a `feat:`/`fix:` that reaches users gets
a version bump, and **every** bump — backend-only included — is followed by a
client deploy, because `NEXT_PUBLIC_APP_VERSION` is captured at build time.

**One at a time, with the user's acknowledgement between each** — these are
production levers whose effects are hard to attribute if you pull two together:
changing an env var or an `OPS_ALERT_*` threshold on the droplet, restarting a
worker or timer, flipping a concurrency setting, deleting a Redis lock,
dispatching a manual task run. Propose the single next lever with its exact
command, wait, then reassess. Raising a threshold to quiet a condition is a last
resort and needs the user's explicit decision: it removes a detector.

Confirm before force-pushing main, dropping a table, or deleting a remote branch.
Nothing else.

If a condition turns out to be a true positive with no safe same-session fix,
say so plainly and name the next step rather than shipping something speculative.

### 7. Report

```
Ops alert — <mail date> — <N> condition(s)

<code>              <one line: what it means, what you found>
…

Now (dry run <time>): <codes still tripped, or "clear">
Remedied:            <what you changed and shipped, or "none">
Next:                <the single next lever, or "nothing pending">
```

Lead with the condition that is at zero successes or costing users requests.
State plainly when a condition cleared on its own, and when one is a known
false-fire (the recapture 24h rule has only 40–80 minutes of healthy margin and
will false-fire on a sweep that starts after ~11:15 UTC).

### 8. Close the loop in the mailbox

**Not optional, and not cosmetic.** The operator's only at-a-glance signal for
"has this been dealt with" is whether the mail is still sitting unread in the
inbox. A handled alert left there is indistinguishable from one nobody has
opened, so the next morning's mail arrives on top of a queue that no longer means
anything. Finish the job in the mailbox, then say in the report that you did.

```
mcp__mailcap__gmail_modify_message  message_id: <id>  remove_label_ids: ["UNREAD", "INBOX"]
```

Removing `INBOX` **archives**; it does not delete. The mail stays in All Mail and
stays findable by the same `from:sysop@tamezz.com subject:ops` search, so nothing
about step 1 changes for a future run.

**Archive only from a terminal state.** One of:

- the remedy shipped (or the condition proved to be a false fire / an artifact
  that cannot recur), or
- it is a true positive with no safe same-session fix, and the report names the
  next step.

**Do not archive** a run you abandoned midway, one blocked waiting on the user's
acknowledgement for a production lever, or one where you could not reach the
droplet. Leave it unread: that is exactly the case the inbox signal exists for.
Archiving early makes the mailbox lie in the one direction that costs something.

The other two mail types:

| Subject | Action |
|---|---|
| `ops heartbeat: all clear` | Mark read and archive as soon as you have noted its date. It is proof-of-life, not a task. |
| `daily ops email FAILED` | Archive **only after the digest itself is fixed and a dry run returns a real verdict.** Until then the reporting path is down and the mail is the only thing saying so. |

Archiving loses no audit trail. Per step 1 the mailbox was never the send record:
`journalctl -u battlestats-ops-digest` is, and it is unaffected.

If several older ops mails are still in the inbox, do not sweep them on the way
past. Archive one only when you can point at the evidence it was remediated
(a shipped version, a runbook, a commit); otherwise name it in the report and
leave it for the operator to judge.

## Red flags

- **Reading the subject line as the condition list.** It is LLM prose;
  `alert_subject()` with the real codes is only the fallback when the API fails.
- **"The body is empty."** You read the stub text part. Go back to step 2.
- **Explaining a shape condition with a number.** Shape first, always.
- **Trusting a zero from a family whose snapshot is stale or whose journal was
  unreadable.** Those zeros mean "not measured".
- **No mail today, therefore healthy.** Check the timer journal.
- **Pulling two production levers in one turn.** One, then acknowledgement.
- **Naming the path in a `gunicorn_worker_timeouts` detail as the culprit** without
  reading the `WORKER TIMEOUT` lines' own timestamps.
- **Reading "succeeded 0 times" as broken without checking the task's cadence.**
  Some units of work are larger than the 24h window.
- **Finishing the remediation and leaving the mail unread in the inbox.** The
  operator reads the inbox as the to-do queue; a handled alert left in it is
  indistinguishable from an ignored one. Step 8.
- **Archiving before the remedy landed**, or while waiting on an acknowledgement
  for a production lever. The inbox signal only has value in that direction.
