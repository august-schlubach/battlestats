# Runbook: Daily Web-Traffic Email

_Created: 2026-08-09_
_Context: The operator asked for a morning email summarizing the previous day's site traffic: visitors, sessions, new vs returning, and events triggered. This documents the Umami schema facts the report rests on, one of which contradicts the obvious reading of the data._
_QA: Every schema claim below was read from the live Umami Postgres on the production droplet, read-only (SELECT and `\d` only). The rendered sample is real production output from the finished script, not hand-assembled._

## Purpose

`server/scripts/daily_traffic_email.py` mails a summary of the previous **UTC** day's web
traffic at **10:30 UTC**, driven by a droplet **systemd timer**. It is the analytics sibling
of `daily_ops_email.py` (11:30 UTC, the player-pipeline digest) and shares its contract:
stdlib only, no venv, secrets from an env file, fail-loud, `--dry-run`.

This is deliberately an **OS-level timer, not Celery Beat**. Three tasks in this repo have
already been truncated by Beat soft-time-limits (`recapture_lapsed_players_task`,
`enrichment_reclassify_drift_task`, the archive/prune pass). A report that silently
half-runs is worse than none.

The scheduler is a systemd timer rather than a crontab line because that is what the
existing ops digest uses (`battlestats-ops-digest.timer` →
`battlestats-ops-digest.service`); there is no battlestats line in root's crontab at all.
Matching it buys `Persistent=true` catch-up after a reboot and journal capture.

## The finding that shapes the whole report

**Umami `session` rows are durable, not per-day.**

`session_id` is a stable hash of (website, hostname, IP, user-agent) salted with a
*constant* application secret — it does **not** rotate daily. The row is written on first
sight and reused indefinitely. Therefore:

- `session.created_at` is **first-ever-seen**, not "a session that started today".
- One live row was observed spanning **2026-07-30 → 2026-08-09 with 24 visits**.
- Counting `session` rows by `created_at` per day yields **new visitors**, not daily
  sessions. Reading that number as "sessions per day" would understate traffic by roughly
  half and would silently drift as the audience matured.

The per-visit unit is `website_event.visit_id`, which Umami rotates after 30 minutes of
inactivity. That is the "session" of ordinary analytics usage.

### Verified schema (Umami v2.20.2, `/opt/umami/package.json`)

| Table | Columns this report uses |
|---|---|
| `website` | `website_id`, `domain`, `deleted_at` — three sites share the DB (Battlestats, Oturu, Metro), so **every query must scope by `website_id`** |
| `website_event` | `event_id`, `website_id`, `session_id`, `visit_id`, `created_at` (timestamptz), `url_path`, `referrer_domain`, `hostname`, `event_type`, `event_name` |
| `session` | `session_id`, `website_id`, `created_at`, `country`, `device`, `distinct_id` |
| `event_data` | `website_event_id`, `data_key`, `string_value`, `number_value` — custom event properties; not read by this report |

`event_type`: **1 = pageview, 2 = custom event**. Confirmed against live data (the 30
`event_type = 2` names on 2026-08-08 are exactly the kebab-case names emitted by
`client/app/lib/umami.ts trackEvent()`).

### Metric vocabulary the email uses

| Email term | SQL | Umami dashboard equivalent |
|---|---|---|
| Visitors | `count(DISTINCT session_id)` over the day's events | "Visitors" |
| Visits / sessions | `count(DISTINCT visit_id)` | "Visits" |
| Pageviews | `count(*) WHERE event_type = 1` | "Views" |
| Custom events (interactions) | `count(*) WHERE event_type = 2 AND event_name NOT IN INSTRUMENTATION_EVENTS` | "Events", minus page-load beacons |

**Visits do not sum across days.** A visit spanning midnight carries one `visit_id` and is
counted in both days. The report therefore averages per-day figures and never totals a
week's `visit_id` cardinality. The email states this in the Totals footnote.

## New vs returning

- **Denominator: the day's active visitors** (`count(DISTINCT session_id)` over that day's
  events), not visits and not pageviews.
- **New** = that visitor's `session.created_at` falls inside the day, i.e. first-ever-seen
  by Umami — not first-seen-in-window.
- **Returning** = first seen on an earlier day.

The definition is printed in the email body, not merely encoded in the SQL, because it is
the figure most likely to be silently wrong.

### Why not `distinct_id` / `bs-vid` as the primary lens

`bs-vid` (the durable localStorage visitor id, `client/app/lib/visitorId.ts` →
`umami.identify()` → `session.distinct_id`) exists precisely because `session_id` is an
IP+UA hash and a rotating mobile address reads as a new visitor. It cannot carry the
primary number yet:

- `distinct_id` has only been populated since **2026-07-30** (the v4.7.0 audience-growth
  instrumentation). There is no history before that.
- Coverage is partial: **125 of 293** sessions in the first eleven days.
- **All 125 `distinct_id` values map 1:1 to a single `session` row.** That is not a bug and
  not proof that nobody returns: because the session row is durable, a returning visitor on
  a stable address lands on the *same* row and `identify()` simply rewrites the same
  `distinct_id`. A duplicate only appears when the address rotates.

So the report uses `session_id` first-seen as the primary split, and prints the durable-id
lens as a **diagnostic line**: coverage, plus `new_but_known_bs_vid` — visitors counted as
new whose `distinct_id` was already bound to an older session row. That correction is
**reported alongside, never folded into** the headline, so the primary count stays
comparable day to day. It reads 0 today and will begin correcting the first time an IP
rotation actually occurs.

## Operator IP exclusion

Handled at **Umami ingest level**: `IGNORE_IP=130.44.131.215,205.220.46.214` in
`/opt/umami/.env` (home + work egress). These queries inherit it for free.

Do **not** attempt to re-filter in SQL. Umami stores no raw IP column at all — sessions are
a salted hash — so any such filter would be a fiction that dropped real visitors. There is
a test asserting no query references an IP.

## Ranking discipline

Every list (pages, route families, referrers, countries, devices, events) is ordered by
**`count(DISTINCT session_id)`**, never by raw event or view count. One visitor reloading a
page, or hammering a filter control, must not be able to promote it. Tests assert
`ORDER BY visitors DESC` on each of those queries.

Own-domain referrers (`referrer_domain = hostname`) are internal navigation and are
excluded from the acquisition table; on 2026-08-08 that row would otherwise have been the
second largest.

### Page-load beacons are not interactions (2026-08-12)

`INSTRUMENTATION_EVENTS` in the script lists the custom events that fire on **every page
load** rather than on something a visitor chose to do. `locale-active` is the whole list
today: `LocaleBeacon` emits it once per load, English included, because the locale runbook
needs English as the denominator.

Left in the roster it distorted the report three ways, all of them visible in the live
2026-08-11 email:

1. **It headed the ranking by construction.** Ranking by distinct visitors cannot demote an
   event that every visitor emits. The lead paragraph opened "the event mix is dominated by
   locale-active at 75 against a prior daily mean of 2.86" — true, and about the deploy
   rather than the day.
2. **It broke its own 7-day comparison.** The beacon shipped 2026-08-10, so the prior window
   partly predates it and any ratio against that mean measures the rollout.
3. **It silently zeroed an engagement measure.** "Single-view visits (no second event)" tests
   `pv <= 1 AND ev = 0`. Once every page load emitted a custom event, `ev = 0` became
   unreachable and the measure would have read zero forever — as an engagement *win*.

So beacons are excluded from the headline Custom events row, from **every day** of the trend
window (excluding them from the day alone would swap one discontinuity for a worse one),
from the engagement second-event test, from the feature-area roster, and from
`llm_payload()`. The `events` **query itself stays unfiltered**: the split happens in
`compute()` so the beacon's own count survives to be printed once, as a flat sentence under
Events triggered, with no delta beside it — a beacon's day-over-day movement is pageview
movement, which Totals already reports.

Verified on live data 2026-08-12: the 2026-08-11 day re-rendered with events 305 → 230 and
its prior mean 137.6 → 134.7, and the regenerated lead named search, player-insights-profile
and player-history-day instead.

**Adding a beacon later:** put the event name in `INSTRUMENTATION_EVENTS` and nothing else
changes — the SQL predicate, the Totals legend and the instrumentation sentence are all
derived from that tuple, and a test asserts the legend names every member of it. The rule of
thumb is whether a visitor could have chosen not to emit the event.

## Timezone

Everything is a whole **UTC** day, matching the rest of the project. The report defaults to
*yesterday UTC*; the 10:30 UTC slot is comfortably after that day closes and lands ~06:30
in the operator's Eastern morning. `--day=YYYY-MM-DD` re-runs any past day. The slot is a
choice, not a constraint: move the cron line if a different hour reads better.

All SQL bounds are explicit `timestamptz` literals, and day bucketing converts **both**
sides of every comparison to naive UTC via `AT TIME ZONE 'UTC'`, so the server's `TimeZone`
setting cannot shift a boundary. (It is `GMT` today; the code does not rely on that.) A
test forbids `::date` casts anywhere in the query set.

## Transport: why `psql`

The no-venv contract rules out `psycopg`, and there is no stdlib Postgres driver, so the
script shells out to `psql` (`/usr/bin/psql`, PostgreSQL 18.4 on the droplet) and reads
results back as JSON.

Each statement is wrapped as `SELECT coalesce(jsonb_agg(t), '[]'::jsonb)::text FROM (…) t`
so `psql -A -t` emits **exactly one line per query**, keeping the line/query mapping exact.
It must be `jsonb_agg`, **not** `json_agg`: `json_agg` pretty-prints its array with real
newlines between elements, which shattered nine queries into 69 output lines on the first
live run. A test asserts `jsonb_agg`.

`ON_ERROR_STOP=1` is set, the return code is checked explicitly, and a line-count mismatch
raises rather than silently misaligning results onto the wrong query.

## LLM usage

The Anthropic call writes **only the lead paragraph**. Every table, total, delta and
percentage is computed in Python, so the model cannot produce a number that reaches a
table. Extended thinking is disabled (default-on, it consumes the whole budget and returns
no text — the same trap `daily_ops_email.py` documents). An API failure, a missing key, or
an empty response degrades to the full report with a one-line note; it never blocks the
email. `--no-llm` skips the call entirely.

### The model is shown a narrowed payload, and this is load-bearing

An early live run was handed the whole computed dict. Its lead read:

> "Traffic remained mostly direct (36 of 48 visits) ... player pages continued to draw the
> bulk of activity (40 visits on /player/\*)"

Both are **false**. Neither `referrers.visits` nor `routes.visits` partitions the day's
visits: one visit spans several routes, and a referrer is recorded once per visit while
that visit's later pageviews carry none. So those columns sum past the day's distinct visit
count, and pairing either against the 48 total invents a share that does not exist. The
system prompt already forbade deriving ratios; the model did it anyway.

The fix is `llm_payload()`, which withholds the operands rather than asking for restraint.
The model now receives only whole-day totals, pre-computed deltas, per-event counts with
each event's own prior mean, and **rank-ordered labels with no counts attached** for routes,
referrers and countries. `pages`, `routes`, `referrers` and `countries` rows never reach it.
A test pins the payload's key set to an explicit allowlist, so adding a count back is a
deliberate act rather than an accident. The prompt additionally bans any "X of Y"
construction, as belt and braces.

The same doctrine settled the `locale-active` problem above: `top_event_names` is drawn from
the already-split interaction roster, so the beacon is not in the model's view at all. No
prompt rule tells it the beacon is uninteresting, because that class of instruction is the
one that already failed here once.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `TRAFFIC_EMAIL_ENV_FILE` | `/etc/battlestats-ops-email.env` | SMTP + `ANTHROPIC_API_KEY`; shared with the ops digest |
| `UMAMI_ENV_FILE` | `/opt/umami/.env` | source of `DATABASE_URL` |
| `UMAMI_DATABASE_URL` | *(unset)* | overrides the file; used by tests and staging |
| `UMAMI_SITE_DOMAIN` | `battlestats.online` | selects the website row |
| `PSQL_BIN` | `psql` | psql path |
| `TRAFFIC_EMAIL_DAY` | *(unset)* | pins the reported day; `--day=` wins over it |

`DATABASE_URL` is **not** duplicated into the ops env file. The script parses that one key
out of `/opt/umami/.env` and imports nothing else from it, so `APP_SECRET` and the rest
never enter the process environment.

**No root is required.** `/opt/umami/.env` is `battlestats:battlestats` mode **0640**, so
the service user that already runs the ops digest can read it. Verified by running the
script under `sudo -u battlestats`: it produced the full report. Setting
`UMAMI_DATABASE_URL` in an `EnvironmentFile` remains available if that ownership ever
changes, and is what the tests use.

## Scheduling (systemd timer)

Modelled directly on `battlestats-ops-digest.{service,timer}`, including
`User=battlestats` and the deliberate `/usr/bin/python3` rather than the venv, which is
what keeps the stdlib-only property honest.

`/etc/systemd/system/battlestats-traffic-digest.service`:

```ini
[Unit]
Description=Battlestats daily web-traffic email
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=battlestats
Group=battlestats
WorkingDirectory=/opt/battlestats-server/current/server
EnvironmentFile=/etc/battlestats-ops-email.env
# Deliberately /usr/bin/python3, not the venv: daily_traffic_email.py is
# stdlib-only by design and running it this way keeps that property honest.
ExecStart=/bin/bash -lc 'exec /usr/bin/python3 scripts/daily_traffic_email.py'
TimeoutStartSec=900
```

`/etc/systemd/system/battlestats-traffic-digest.timer`:

```ini
[Unit]
Description=Send the Battlestats web-traffic summary each morning

[Timer]
OnCalendar=*-*-* 10:30:00 UTC
Persistent=true
RandomizedDelaySec=300

[Install]
WantedBy=timers.target
```

```bash
systemctl daemon-reload
systemctl enable --now battlestats-traffic-digest.timer
systemctl start battlestats-traffic-digest.service   # one immediate live run
journalctl -u battlestats-traffic-digest.service -n 50 --no-pager
```

The script itself ships with the ordinary backend deploy: `server/deploy/deploy_to_droplet.sh`
rsyncs all of `server/`, so `scripts/daily_traffic_email.py` lands under
`/opt/battlestats-server/current/server/scripts/` with no deploy-script change. Only the two
unit files are manual, one time.

## Operating it

```bash
# preview yesterday without sending anything (including on failure)
python3 daily_traffic_email.py --dry-run

# a specific past day, no API call
python3 daily_traffic_email.py --dry-run --no-llm --day=2026-08-08
```

`--dry-run` sends nothing at all, failure mail included: a dry run is how this is exercised
by hand and must not be able to page the operator.

Any unhandled error still mails a `FAILED`-tagged message carrying the traceback and exits
non-zero for the cron log. This path was exercised for real during development (the
`json_agg` line-count bug produced a genuine FAILED email).

## Sample output (2026-08-08, real production data)

```
battlestats.online traffic: 2026-08-08 (UTC)

TOTALS
  Visitors             29   vs prev day -29 (-50%)     vs 7d mean -12.3 (-29.8%)
  Visits/sessions      48   vs prev day -13 (-21.3%)   vs 7d mean +4.6 (+10.6%)
  Pageviews            74   vs prev day -19 (-20.4%)   vs 7d mean +4.9 (+7.1%)
  Custom events       107   vs prev day -52 (-32.7%)   vs 7d mean -6.7 (-5.9%)

NEW VS RETURNING (denominator: the day's active visitors)
  new 13 (44.8%); returning 16 (55.2%); total 29
  bs-vid coverage 15/29; 0 "new" visitors were known browsers on a rotated address

ENGAGEMENT
  1.54 pageviews/visit; average visit 4m 08s; 25/48 single-view
```

## Tests

`server/warships/tests/test_daily_traffic_email.py` — 92 tests. The script is loaded by
path (it is a cron entrypoint, not a Django module); `run_queries` and `send_email` are
both mocked. Coverage: the delta and mean arithmetic, the new/returning denominator, the
event-family rollup, path percent-decoding, HTML escaping, the rendered legends, the SQL's
ranking and timezone discipline, the `psql` transport's error paths, config precedence, and
the FAILED path including its `--dry-run` suppression.

The shared fixture carries a `locale-active` row **at the head of the event roster**, where
the SQL's visitor ordering really puts it, so every existing assertion about totals,
rankings and families now also asserts the beacon split. `InstrumentationEventTests` pins
the rest: held out of the roster, the families, the trend SQL, the engagement SQL and the
model payload; kept in `beacon_rows`; rendered once as prose and never as a `<td>`.

## Known gaps

- **Sessions straddling midnight** are counted in both days (0–2/day at current volume).
- **`avg_visit_seconds`** is last-event-minus-first-event within a visit, so a single-event
  visit measures zero and drags the mean down. The email says so.
- **"Single-view visits" is stricter than Umami's bounce rate** and will read lower than the
  dashboard. It counts visits with at most one pageview **and zero custom events**
  (`pv <= 1 AND ev = 0`); Umami's bounce ignores custom events. On 2026-08-08 that is 25 of
  48, where the pageview-only test would have said 33. The stricter form is deliberate: a
  visitor who landed once but then filtered the ship leaderboard did not bounce. `ev` counts
  **interactions only** — see the beacon section above for why that qualifier is what keeps
  this measure alive at all.
- The **`new_but_known_bs_vid`** correction has never yet fired; it is untested against real
  positive data because no such case exists yet in production.
