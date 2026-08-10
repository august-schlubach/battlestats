#!/usr/bin/env python3
"""Daily battlestats web-traffic email (previous UTC day).

Runs unattended on the production droplet from a systemd timer at 10:30 UTC,
i.e. after the previous UTC day has closed and an hour before the ops digest.
An OS-level timer deliberately, never Celery Beat: three tasks in this repo have
already been truncated by Beat soft-time-limits, and a report that silently
half-runs is worse than none. Reads the Umami analytics Postgres directly,
computes every number in Python/SQL, and emails a summary: totals with
day-over-day and 7-day-average context, new vs returning visitors, top pages
ranked by visitors, referrers, and the custom-event roster this app emits.

Sibling of `daily_ops_email.py` (the 11:30 UTC pipeline digest). Same contract:

  * stdlib only -- no venv, no pip installs. Postgres is reached by shelling out
    to `psql` (there is no stdlib PG driver); rows come back as one JSON line per
    query via `json_agg`.
  * config and secrets come from env files, NEVER from this script: it lives in
    a public repo.
  * fail-loud: any error still sends an email tagged FAILED carrying the
    traceback, then exits non-zero for the cron log.

Deliberate difference from the ops digest: the LLM here writes ONLY a short lead
paragraph. Every table, total and delta is rendered by Python from the same dict
the model is shown, so the model cannot compute -- or miscompute -- a number that
reaches the email.

METRIC VOCABULARY (Umami v2.20 semantics, verified against the live schema):
  * `session` rows are DURABLE. `session_id` is a stable hash of
    (website, hostname, ip, user-agent); the row is created on first sight and
    reused forever after. `session.created_at` is therefore FIRST-EVER-SEEN, not
    "a session that started today". One live row was observed spanning
    2026-07-30 -> 2026-08-09 with 24 visits.
  * Visitors      = COUNT(DISTINCT session_id) over the day's events.
  * Visits        = COUNT(DISTINCT visit_id). Umami opens a new visit_id after
    30 minutes of inactivity. This is the "session" in ordinary analytics usage.
  * Pageviews     = event_type 1. Custom events = event_type 2.
  * New visitor   = a visitor whose session.created_at falls inside the day.
    Returning     = first seen on an earlier day. Denominator is the day's
    active visitors, not visits. See NEW_VS_RETURNING_NOTE below for the caveat.

Operator IP exclusion is handled at Umami INGEST level (`IGNORE_IP` in
/opt/umami/.env). These queries inherit it for free and must not re-filter.

Flags:
  --dry-run          Render to stdout; do not send.
  --no-llm           Skip the Anthropic lead paragraph (also the automatic
                     fallback when the API errors or returns nothing).
  --day=YYYY-MM-DD   Report on an explicit UTC day instead of yesterday.
"""

from __future__ import annotations

import json
import subprocess
import sys
import traceback
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import unquote

# Shared send path. The sys.path insert keeps the no-venv guarantee: opsmail is
# stdlib-only by contract (enforced by test_opsmail.test_module_imports_no_django),
# so a bare python3 can import it straight from the server/ package directory.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from warships.opsmail import cfg, load_env_file, send_email  # noqa: E402

DEFAULT_ENV_FILE = "/etc/battlestats-ops-email.env"
DEFAULT_UMAMI_ENV_FILE = "/opt/umami/.env"
DEFAULT_SITE_DOMAIN = "battlestats.online"
DEFAULT_PSQL = "psql"

ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION = "2023-06-01"

# Days of history pulled for the trend table and the 7-day mean.
TREND_DAYS = 7

NEW_VS_RETURNING_NOTE = (
    "New = this visitor's first-ever appearance in Umami (session.created_at "
    "falls inside the day). Returning = first seen on an earlier day. The "
    "denominator is the day's active visitors, not visits. Caveat: a visitor is "
    "keyed by a hash of IP + user-agent, so someone whose address rotates "
    "(mobile carriers do this constantly) reads as new. The bs-vid durable-id "
    "correction below is what catches that."
)


# --------------------------------------------------------------------------- #
# config
# --------------------------------------------------------------------------- #
def read_umami_dsn(umami_env_file: str) -> str:
    """DATABASE_URL out of umami's own env file, and nothing else from it.

    A blanket load_env_file() here would drag APP_SECRET, IGNORE_IP and every
    other umami variable into os.environ; only the one key is wanted.

    No elevated privilege is needed: /opt/umami/.env is battlestats:battlestats
    mode 0640, so the same service user that runs the ops digest can read it.

    An explicit UMAMI_DATABASE_URL in the environment always wins, so a test, a
    staging run, or a future change of that file's ownership never has to touch
    /opt/umami.
    """
    override = cfg("UMAMI_DATABASE_URL")
    if override:
        return override
    try:
        content = Path(umami_env_file).read_text()
    except (FileNotFoundError, PermissionError, OSError) as exc:
        raise RuntimeError(
            f"cannot read DATABASE_URL from {umami_env_file} ({type(exc).__name__}); "
            "set UMAMI_DATABASE_URL instead"
        ) from exc
    for raw in content.splitlines():
        line = raw.strip()
        if line.startswith("DATABASE_URL=") and not line.startswith("#"):
            return line.partition("=")[2].strip().strip('"').strip("'")
    raise RuntimeError(f"no DATABASE_URL line in {umami_env_file}")


# --------------------------------------------------------------------------- #
# postgres access (stdlib only: shell out to psql, read back JSON)
# --------------------------------------------------------------------------- #
def _lit(value) -> str:
    """Single-quoted SQL literal. Inputs here are config/computed, never user input."""
    return "'" + str(value).replace("'", "''") + "'"


def run_queries(dsn: str, sqls: list[str], psql_bin: str = DEFAULT_PSQL) -> list[list[dict]]:
    """Run each SQL and return its rows. Every SQL yields exactly one JSON line.

    Each statement is wrapped in an aggregate so `psql -A -t` prints exactly one
    line per query regardless of row count, keeping the line/query
    correspondence exact. It must be `jsonb_agg`, not `json_agg`: `json_agg`
    pretty-prints its array with real newlines between elements, which shatters
    one result into many lines. jsonb's text output is compact and single-line,
    and any newline inside a string value is escaped as the two characters \\n.
    """
    args = [psql_bin, dsn, "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-P", "pager=off"]
    for sql in sqls:
        args += ["-c", f"SELECT coalesce(jsonb_agg(t), '[]'::jsonb)::text FROM ({sql}) t"]
    proc = subprocess.run(args, capture_output=True, text=True, timeout=180)
    if proc.returncode != 0:
        raise RuntimeError(
            f"psql exited {proc.returncode}: {(proc.stderr or proc.stdout or '').strip()[:800]}"
        )
    lines = [ln for ln in proc.stdout.splitlines() if ln.strip()]
    if len(lines) != len(sqls):
        raise RuntimeError(
            f"psql returned {len(lines)} result lines for {len(sqls)} queries; "
            f"stderr={(proc.stderr or '').strip()[:400]}"
        )
    return [json.loads(ln) for ln in lines]


# --------------------------------------------------------------------------- #
# SQL
# --------------------------------------------------------------------------- #
def resolve_website_sql(domain: str) -> str:
    return (
        "SELECT website_id::text, name FROM website "
        f"WHERE domain = {_lit(domain)} AND deleted_at IS NULL "
        "ORDER BY created_at LIMIT 1"
    )


def build_sqls(website_id: str, day_lo: datetime, day_hi: datetime, trend_lo: datetime) -> dict:
    """The report's queries, keyed by name; insertion order is the run order.

    Every boundary is bound as an explicit `timestamptz` literal, and day
    bucketing converts BOTH sides of a comparison to naive UTC
    (`AT TIME ZONE 'UTC'`), so the server's TimeZone setting can never shift a
    day boundary. The live server is GMT today; this does not rely on that.
    """
    w = _lit(website_id)
    lo, hi, tlo = _lit(day_lo.isoformat()), _lit(day_hi.isoformat()), _lit(trend_lo.isoformat())
    scope = f"we.website_id = {w}::uuid"
    in_day = f"we.created_at >= {lo}::timestamptz AND we.created_at < {hi}::timestamptz"

    return {
        # --- per-day trend, including the target day itself ------------------
        "trend": f"""
            WITH ev AS (
              SELECT date_trunc('day', we.created_at AT TIME ZONE 'UTC') AS day,
                     we.session_id, we.visit_id, we.event_type,
                     (s.created_at AT TIME ZONE 'UTC') AS sess_first
              FROM website_event we JOIN session s USING (session_id)
              WHERE {scope}
                AND we.created_at >= {tlo}::timestamptz
                AND we.created_at <  {hi}::timestamptz
            )
            SELECT to_char(day, 'YYYY-MM-DD') AS day,
                   count(*) FILTER (WHERE event_type = 1) AS pageviews,
                   count(*) FILTER (WHERE event_type = 2) AS events,
                   count(DISTINCT session_id) AS visitors,
                   count(DISTINCT visit_id) AS visits,
                   count(DISTINCT session_id) FILTER (WHERE sess_first >= day) AS new_visitors
            FROM ev GROUP BY day ORDER BY day
        """,
        # --- depth / duration for the target day -----------------------------
        "engagement": f"""
            WITH v AS (
              SELECT we.visit_id,
                     count(*) FILTER (WHERE we.event_type = 1) AS pv,
                     count(*) FILTER (WHERE we.event_type = 2) AS ev,
                     extract(epoch FROM max(we.created_at) - min(we.created_at)) AS dur
              FROM website_event we WHERE {scope} AND {in_day} GROUP BY 1
            )
            SELECT count(*) AS visits,
                   round(avg(pv)::numeric, 2) AS avg_pageviews_per_visit,
                   round(avg(dur)::numeric) AS avg_visit_seconds,
                   count(*) FILTER (WHERE pv <= 1 AND ev = 0) AS single_view_visits
            FROM v
        """,
        # --- new vs returning + durable-id (bs-vid) corroboration ------------
        "identity": f"""
            WITH day_sessions AS (
              SELECT DISTINCT we.session_id, s.created_at AS sess_first, s.distinct_id
              FROM website_event we JOIN session s USING (session_id)
              WHERE {scope} AND {in_day}
            )
            SELECT count(*) AS visitors,
                   count(*) FILTER (WHERE sess_first >= {lo}::timestamptz) AS new_visitors,
                   count(*) FILTER (WHERE sess_first <  {lo}::timestamptz) AS returning_visitors,
                   count(distinct_id) AS identified_visitors,
                   count(*) FILTER (
                     WHERE sess_first >= {lo}::timestamptz AND distinct_id IS NOT NULL
                       AND EXISTS (
                         SELECT 1 FROM session older
                         WHERE older.website_id = {w}::uuid
                           AND older.distinct_id = day_sessions.distinct_id
                           AND older.session_id <> day_sessions.session_id
                           AND older.created_at < {lo}::timestamptz)
                   ) AS new_but_known_bs_vid
            FROM day_sessions
        """,
        # --- top pages, RANKED BY VISITORS (never by raw view count) ---------
        "pages": f"""
            SELECT we.url_path,
                   count(DISTINCT we.session_id) AS visitors,
                   count(DISTINCT we.visit_id) AS visits,
                   count(*) AS pageviews
            FROM website_event we
            WHERE {scope} AND {in_day} AND we.event_type = 1
            GROUP BY 1 ORDER BY visitors DESC, pageviews DESC LIMIT 10
        """,
        # --- route families (player pages are high-cardinality by design) ----
        "routes": f"""
            SELECT CASE
                     WHEN we.url_path = '/' THEN '/ (landing)'
                     WHEN we.url_path LIKE '/player/%' THEN '/player/*'
                     WHEN we.url_path LIKE '/clan/%'   THEN '/clan/*'
                     WHEN we.url_path LIKE '/ship/%'   THEN '/ship/*'
                     ELSE we.url_path
                   END AS route,
                   count(DISTINCT we.session_id) AS visitors,
                   count(DISTINCT we.visit_id) AS visits,
                   count(*) AS pageviews
            FROM website_event we
            WHERE {scope} AND {in_day} AND we.event_type = 1
            GROUP BY 1 ORDER BY visitors DESC, pageviews DESC LIMIT 8
        """,
        # --- acquisition. Own-domain referrers are internal nav, not sources.
        "referrers": f"""
            SELECT coalesce(nullif(we.referrer_domain, ''), '(direct / none)') AS source,
                   count(DISTINCT we.session_id) AS visitors,
                   count(DISTINCT we.visit_id) AS visits
            FROM website_event we
            WHERE {scope} AND {in_day} AND we.event_type = 1
              AND coalesce(we.referrer_domain, '') <> coalesce(we.hostname, '')
            GROUP BY 1 ORDER BY visitors DESC LIMIT 8
        """,
        "countries": f"""
            SELECT coalesce(s.country, '??') AS country,
                   count(DISTINCT we.session_id) AS visitors
            FROM website_event we JOIN session s USING (session_id)
            WHERE {scope} AND {in_day}
            GROUP BY 1 ORDER BY visitors DESC LIMIT 8
        """,
        "devices": f"""
            SELECT coalesce(s.device, 'unknown') AS device,
                   count(DISTINCT we.session_id) AS visitors
            FROM website_event we JOIN session s USING (session_id)
            WHERE {scope} AND {in_day}
            GROUP BY 1 ORDER BY visitors DESC
        """,
        # --- UI locale actually in effect, from the locale-active beacon ------
        # Supply side. Only page loads on a build carrying the beacon report at
        # all (shipped v5.2.1, 2026-08-10), so this partitions beacon-reporting
        # visitors, NOT the day's visitors. No LIMIT: three values exist, and a
        # truncated set would give the share below a wrong denominator.
        "locale_active": f"""
            SELECT ed.string_value AS locale,
                   count(DISTINCT we.session_id) AS visitors,
                   count(DISTINCT we.visit_id) AS load_visits
            FROM website_event we
            JOIN event_data ed
              ON ed.website_event_id = we.event_id AND ed.data_key = 'locale'
            WHERE {scope} AND {in_day}
              AND we.event_type = 2 AND we.event_name = 'locale-active'
            GROUP BY 1 ORDER BY visitors DESC, locale
        """,
        # --- browser language: the demand side, captured since long before the
        # locale feature existed. One language per session, so these rows do
        # partition the day's visitors. Folded to the primary subtag (ko-KR and
        # ko are one language). No LIMIT, same denominator reason as above.
        "browser_language": f"""
            SELECT lower(split_part(coalesce(nullif(s.language, ''), '??'), '-', 1)) AS lang,
                   count(DISTINCT we.session_id) AS visitors
            FROM website_event we JOIN session s USING (session_id)
            WHERE {scope} AND {in_day}
            GROUP BY 1 ORDER BY visitors DESC, lang
        """,
        # --- custom events. Ranked by visitors; prior-window mean for context.
        "events": f"""
            WITH day_ev AS (
              SELECT we.event_name,
                     count(*) AS events,
                     count(DISTINCT we.session_id) AS visitors,
                     count(DISTINCT we.visit_id) AS visits
              FROM website_event we
              WHERE {scope} AND {in_day} AND we.event_type = 2 AND we.event_name IS NOT NULL
              GROUP BY 1
            ),
            prior AS (
              SELECT we.event_name, count(*)::numeric / {TREND_DAYS} AS prior_daily_mean
              FROM website_event we
              WHERE {scope} AND we.event_type = 2 AND we.event_name IS NOT NULL
                AND we.created_at >= {tlo}::timestamptz
                AND we.created_at <  {lo}::timestamptz
              GROUP BY 1
            )
            SELECT d.event_name, d.events, d.visitors, d.visits,
                   round(coalesce(p.prior_daily_mean, 0), 2) AS prior_daily_mean
            FROM day_ev d LEFT JOIN prior p USING (event_name)
            ORDER BY d.visitors DESC, d.events DESC
        """,
    }


# --------------------------------------------------------------------------- #
# derived arithmetic (all deltas computed here; never by the model)
# --------------------------------------------------------------------------- #
def _num(value):
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, str):
        try:
            return float(value) if "." in value else int(value)
        except ValueError:
            return None
    return value


def _mean(values: list) -> float | None:
    nums = [v for v in (_num(x) for x in values) if v is not None]
    return round(sum(nums) / len(nums), 1) if nums else None


def _pct(part, whole) -> float | None:
    part, whole = _num(part), _num(whole)
    if not whole or part is None:
        return None
    return round(100.0 * part / whole, 1)


def _delta(cur, prev) -> dict:
    cur, prev = _num(cur), _num(prev)
    if cur is None or prev is None:
        return {"abs": None, "pct": None}
    diff = round(cur - prev, 2)
    return {"abs": diff, "pct": round(100.0 * diff / prev, 1) if prev else None}


HEADLINE_METRICS = ("visitors", "visits", "pageviews", "events")


def compute(raw: dict, day: date) -> dict:
    """Turn the raw query rows into every number the email prints."""
    day_key = day.isoformat()
    trend = raw.get("trend") or []
    by_day = {r["day"]: r for r in trend}
    blank = {m: 0 for m in HEADLINE_METRICS}
    blank["new_visitors"] = 0
    today = by_day.get(day_key, blank)
    prior = [r for r in trend if r["day"] < day_key]
    yesterday = prior[-1] if prior else None

    headline = {}
    for metric in HEADLINE_METRICS:
        cur = _num(today.get(metric)) or 0
        mean7 = _mean([r.get(metric) for r in prior])
        headline[metric] = {
            "value": cur,
            "prev_day": _num(yesterday.get(metric)) if yesterday else None,
            "vs_prev_day": _delta(cur, yesterday.get(metric) if yesterday else None),
            "mean_prior_7d": mean7,
            "vs_mean_prior_7d": _delta(cur, mean7),
        }

    ident = (raw.get("identity") or [{}])[0]
    visitors = _num(ident.get("visitors")) or 0
    identified = _num(ident.get("identified_visitors")) or 0
    identity = {
        "visitors": visitors,
        "new": _num(ident.get("new_visitors")) or 0,
        "returning": _num(ident.get("returning_visitors")) or 0,
        "new_pct": _pct(ident.get("new_visitors"), visitors),
        "returning_pct": _pct(ident.get("returning_visitors"), visitors),
        "identified_visitors": identified,
        "identified_pct": _pct(identified, visitors),
        "new_but_known_bs_vid": _num(ident.get("new_but_known_bs_vid")) or 0,
    }

    eng = (raw.get("engagement") or [{}])[0]
    engagement = {
        "visits": _num(eng.get("visits")) or 0,
        "avg_pageviews_per_visit": _num(eng.get("avg_pageviews_per_visit")),
        "avg_visit_seconds": _num(eng.get("avg_visit_seconds")),
        "single_view_visits": _num(eng.get("single_view_visits")) or 0,
        "single_view_pct": _pct(eng.get("single_view_visits"), eng.get("visits")),
    }

    events = raw.get("events") or []
    for row in events:
        row["vs_prior_daily_mean"] = _delta(row.get("events"), row.get("prior_daily_mean"))
    event_summary = {
        "total_events": sum((_num(r.get("events")) or 0) for r in events),
        "distinct_event_names": len(events),
        "rows": events,
        "families": _event_families(events),
    }

    pages = [dict(r, label=_pretty_path(r["url_path"])) for r in (raw.get("pages") or [])]
    locale = _locale_summary(raw)

    return {
        "day": day_key,
        "generated_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "headline": headline,
        "identity": identity,
        "engagement": engagement,
        "trend": trend,
        "pages": pages,
        "routes": raw.get("routes") or [],
        "referrers": raw.get("referrers") or [],
        "countries": raw.get("countries") or [],
        "devices": raw.get("devices") or [],
        "events": event_summary,
        "locale": locale,
    }


# The two halves answer different questions and must never share a denominator:
# `ui` is which language the interface actually ran in (supply, beacon-reporting
# visitors only), `browser` is which language the visitor's browser asks for
# (demand, every visitor). The gap between them is the discoverability signal
# the locale runbook is about, so both shares are computed HERE rather than left
# for a reader — or for the model — to divide.
LOCALE_TOP_N = 6


def _locale_summary(raw: dict) -> dict:
    ui_rows = raw.get("locale_active") or []
    ui_total = sum((_num(r.get("visitors")) or 0) for r in ui_rows)
    ui_non_en = sum(
        (_num(r.get("visitors")) or 0) for r in ui_rows if (r.get("locale") or "") != "en"
    )

    browser_rows = raw.get("browser_language") or []
    browser_total = sum((_num(r.get("visitors")) or 0) for r in browser_rows)
    browser_non_en = sum(
        (_num(r.get("visitors")) or 0)
        for r in browser_rows
        if (r.get("lang") or "") not in ("en", "??")
    )
    # Korean and Japanese specifically: the only two the UI can currently serve,
    # so this is the reachable ceiling for the share above it.
    browser_cjk = sum(
        (_num(r.get("visitors")) or 0) for r in browser_rows if (r.get("lang") or "") in ("ko", "ja")
    )

    return {
        "ui_rows": ui_rows,
        "ui_visitors": ui_total,
        "ui_non_english": ui_non_en,
        "ui_non_english_pct": _pct(ui_non_en, ui_total),
        "browser_rows": browser_rows[:LOCALE_TOP_N],
        "browser_visitors": browser_total,
        "browser_non_english": browser_non_en,
        "browser_non_english_pct": _pct(browser_non_en, browser_total),
        "browser_ko_ja": browser_cjk,
        "browser_ko_ja_pct": _pct(browser_cjk, browser_total),
        # What fraction of the day's visitors the beacon saw at all. Below 100
        # means the UI share above is drawn from a subset of the day, for any of
        # three reasons: a cached bundle predating the beacon, a visitor who
        # never triggered a full page load, or the deploy day itself, where the
        # beacon existed for only part of the day while the browser-language
        # half covered all 24 hours. Without this the two shares look like one
        # population measured two ways.
        "ui_coverage_pct": _pct(ui_total, browser_total),
    }


def _pretty_path(path: str) -> str:
    """Percent-decode for display; player and clan names are URL-encoded on the way in."""
    try:
        return unquote(path)
    except Exception:
        return path


def _event_family(name: str) -> str:
    """Group kebab-case event names by their first two segments when there are
    three or more (`ship-leaderboard-filter` -> `ship-leaderboard`), otherwise by
    the whole name (`search`, `realm-change`)."""
    parts = name.split("-")
    return "-".join(parts[:2]) if len(parts) >= 3 else name


def _event_families(rows: list[dict]) -> list[dict]:
    agg: dict[str, dict] = {}
    for row in rows:
        fam = _event_family(row.get("event_name") or "(unnamed)")
        node = agg.setdefault(fam, {"family": fam, "events": 0, "names": 0})
        node["events"] += _num(row.get("events")) or 0
        node["names"] += 1
    return sorted(agg.values(), key=lambda n: (-n["events"], n["family"]))


# --------------------------------------------------------------------------- #
# rendering (deterministic; the model contributes only `lead`)
# --------------------------------------------------------------------------- #
def _esc(text) -> str:
    return str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _fmt_delta(delta: dict) -> str:
    abs_, pct = delta.get("abs"), delta.get("pct")
    if abs_ is None:
        return "n/a"
    sign = "+" if abs_ > 0 else ""
    body = f"{sign}{abs_:g}"
    return f"{body} ({sign}{pct:g}%)" if pct is not None else body


def _duration(seconds) -> str:
    if seconds is None:
        return "n/a"
    seconds = int(seconds)
    return f"{seconds // 60}m {seconds % 60:02d}s"


TD = "padding:4px 10px 4px 0;border-bottom:1px solid #eee;"
TH = "padding:4px 10px 4px 0;border-bottom:2px solid #ccc;text-align:left;font-weight:600;"


def _table(headers: list[str], rows: list[list], note: str = "") -> str:
    head = "".join(f"<th style='{TH}'>{_esc(h)}</th>" for h in headers)
    body = "".join(
        "<tr>" + "".join(f"<td style='{TD}'>{_esc(c)}</td>" for c in row) + "</tr>" for row in rows
    )
    tail = (
        f"<div style='font-size:11px;color:#777;margin:2px 0 0'>{_esc(note)}</div>" if note else ""
    )
    return (
        "<table style='border-collapse:collapse;font-size:13px;width:100%;margin:4px 0 14px'>"
        f"<tr>{head}</tr>{body}</table>{tail}"
    )


# Below this, the UI share is drawn from too small a slice of the day to be read
# beside the browser figure without saying so. 90 rather than 100 because a few
# visitors on stale bundles are normal and unremarkable.
UI_COVERAGE_CAVEAT_PCT = 90


def _ui_coverage_caveat(loc: dict) -> str:
    pct = loc.get("ui_coverage_pct")
    if pct is None or pct >= UI_COVERAGE_CAVEAT_PCT:
        return ""
    return (
        f" Note that the beacon reported for {loc['ui_visitors']} of the day's "
        f"{loc['browser_visitors']} visitors ({pct}%), so the interface figure is drawn from a "
        "subset of this day and is not comparable to the browser figure at face value."
    )


def _h2(text: str) -> str:
    return f"<h2 style='font:600 15px/1.3 system-ui,sans-serif;margin:20px 0 4px'>{_esc(text)}</h2>"


def render(data: dict, lead: str = "", lead_error: str = "") -> dict:
    d, h, ident, eng = data["day"], data["headline"], data["identity"], data["engagement"]

    subject = (
        f"[battlestats] traffic {d}: {h['visitors']['value']} visitors, "
        f"{h['visits']['value']} visits, {h['pageviews']['value']} views"
    )

    parts = [
        "<html><body style='font:14px/1.5 system-ui,-apple-system,sans-serif;"
        "color:#222;max-width:760px;margin:0 auto;padding:12px'>",
        "<h1 style='font:600 19px/1.3 system-ui,sans-serif;margin:0 0 2px'>"
        f"battlestats.online traffic: {_esc(d)} (UTC)</h1>",
        f"<div style='font-size:11px;color:#777'>generated {_esc(data['generated_at_utc'])}; "
        "every day below is a whole UTC day</div>",
    ]

    if lead:
        parts.append(
            "<p style='background:#f6f8fa;border-left:3px solid #567;padding:8px 12px;"
            f"margin:14px 0'>{_esc(lead)}</p>"
        )
    if lead_error:
        parts.append(
            "<p style='font-size:11px;color:#b00;margin:8px 0'>Lead-paragraph synthesis "
            f"skipped: {_esc(lead_error)}. Every number below is computed in Python and is "
            "unaffected.</p>"
        )

    parts.append(_h2("Totals"))
    parts.append(
        _table(
            ["Metric", d, "Prev day", "vs prev day", "7d mean before", "vs 7d mean"],
            [
                [
                    label,
                    h[key]["value"],
                    h[key]["prev_day"] if h[key]["prev_day"] is not None else "n/a",
                    _fmt_delta(h[key]["vs_prev_day"]),
                    h[key]["mean_prior_7d"] if h[key]["mean_prior_7d"] is not None else "n/a",
                    _fmt_delta(h[key]["vs_mean_prior_7d"]),
                ]
                for key, label in (
                    ("visitors", "Visitors (distinct devices)"),
                    ("visits", "Visits / sessions"),
                    ("pageviews", "Pageviews"),
                    ("events", "Custom events"),
                )
            ],
            "Visitors = distinct Umami session_id, a hash of IP + user-agent. Visits = "
            "distinct visit_id; Umami opens a new visit after 30 minutes idle. Visits are "
            "averaged per day, never summed: a visit straddling midnight belongs to both days.",
        )
    )

    parts.append(_h2("Engagement"))
    parts.append(
        _table(
            ["Measure", "Value"],
            [
                ["Pageviews per visit", eng["avg_pageviews_per_visit"] or "n/a"],
                ["Average visit duration", _duration(eng["avg_visit_seconds"])],
                [
                    "Single-view visits (no second event)",
                    f"{eng['single_view_visits']} of {eng['visits']}"
                    + (
                        f" ({eng['single_view_pct']}%)"
                        if eng["single_view_pct"] is not None
                        else ""
                    ),
                ],
            ],
            "Duration is last event minus first event within a visit, so a single-event "
            "visit measures zero and pulls the mean down.",
        )
    )

    parts.append(_h2("New vs returning visitors"))
    parts.append(
        _table(
            ["Group", "Visitors", "Share"],
            [
                [
                    "New (first ever seen)",
                    ident["new"],
                    f"{ident['new_pct']}%" if ident["new_pct"] is not None else "n/a",
                ],
                [
                    "Returning (seen on an earlier day)",
                    ident["returning"],
                    f"{ident['returning_pct']}%" if ident["returning_pct"] is not None else "n/a",
                ],
                ["Total active visitors", ident["visitors"], "100%"],
            ],
            NEW_VS_RETURNING_NOTE,
        )
    )
    parts.append(
        "<div style='font-size:12px;color:#555;margin:-8px 0 14px'>"
        f"<b>bs-vid durable-id check:</b> {ident['identified_visitors']} of {ident['visitors']} "
        "visitors carried a durable id"
        + (f" ({ident['identified_pct']}%)" if ident["identified_pct"] is not None else "")
        + f"; {ident['new_but_known_bs_vid']} of the \"new\" visitors were in fact known "
        "browsers arriving on a rotated address. That correction is not folded into the "
        "table above; it is reported alongside it so the primary count stays comparable "
        "day to day.</div>"
    )

    parts.append(_h2(f"Last {len(data['trend'])} days"))
    parts.append(
        _table(
            ["Day", "Visitors", "New", "Visits", "Pageviews", "Events"],
            [
                [
                    r["day"] + ("  <-- this report" if r["day"] == d else ""),
                    r["visitors"],
                    r["new_visitors"],
                    r["visits"],
                    r["pageviews"],
                    r["events"],
                ]
                for r in data["trend"]
            ]
            or [["(no data)", "", "", "", "", ""]],
        )
    )

    parts.append(_h2("Top pages"))
    parts.append(
        _table(
            ["Page", "Visitors (sort)", "Visits", "Views"],
            [[r["label"], r["visitors"], r["visits"], r["pageviews"]] for r in data["pages"]]
            or [["(no pageviews)", "", "", ""]],
            "Ranked by distinct visitors, not by view count: one visitor reloading a page "
            "cannot promote it.",
        )
    )
    parts.append(
        _table(
            ["Route family", "Visitors (sort)", "Visits", "Views"],
            [[r["route"], r["visitors"], r["visits"], r["pageviews"]] for r in data["routes"]]
            or [["(none)", "", "", ""]],
        )
    )

    parts.append(_h2("Acquisition"))
    parts.append(
        _table(
            ["Referrer", "Visitors (sort)", "Visits"],
            [[r["source"], r["visitors"], r["visits"]] for r in data["referrers"]]
            or [["(none)", "", ""]],
            "Own-domain referrers are internal navigation and are excluded.",
        )
    )
    parts.append(
        _table(
            ["Country", "Visitors (sort)"],
            [[r["country"], r["visitors"]] for r in data["countries"]] or [["(none)", ""]],
        )
    )
    parts.append(
        _table(
            ["Device", "Visitors (sort)"],
            [[r["device"], r["visitors"]] for r in data["devices"]] or [["(none)", ""]],
        )
    )

    loc = data["locale"]
    parts.append(_h2("Language"))
    parts.append(
        _table(
            ["UI locale in effect", "Visitors (sort)", "Page loads"],
            [[r["locale"], r["visitors"], r["load_visits"]] for r in loc["ui_rows"]]
            or [["(no locale-active events)", "", ""]],
            "From the locale-active beacon, which reports the locale a page load actually ran "
            "in. Its denominator is beacon-reporting visitors, not the day's visitors: a visitor "
            "on a cached pre-v5.2.1 bundle reports nothing.",
        )
    )
    parts.append(
        _table(
            ["Browser language", "Visitors (sort)"],
            [[r["lang"], r["visitors"]] for r in loc["browser_rows"]] or [["(none)", ""]],
            "What the visitor's browser asks for, folded to the primary subtag and captured "
            "since long before the locale feature. One language per visitor, so these do "
            "partition the day.",
        )
    )
    parts.append(
        "<div style='font-size:12px;color:#555;margin:-8px 0 14px'><b>Supply vs demand:</b> "
        + (
            f"the interface ran non-English for {loc['ui_non_english']} of "
            f"{loc['ui_visitors']} beacon-reporting visitors "
            f"({loc['ui_non_english_pct']}%)"
            if loc["ui_non_english_pct"] is not None
            else "no visitor reported a UI locale on this day, so the interface side is "
            "unmeasured rather than zero (the beacon shipped 2026-08-10)"
        )
        + f"; {loc['browser_ko_ja']} of {loc['browser_visitors']} visitors arrived with a Korean "
        "or Japanese browser"
        + (f" ({loc['browser_ko_ja_pct']}%)" if loc["browser_ko_ja_pct"] is not None else "")
        + ", which is the reachable ceiling while ko and ja are the only translations. English "
        "remains the default for every new arrival; the gap between the two figures is a "
        "discoverability measure, not a demand measure."
        + _ui_coverage_caveat(loc)
        + "</div>"
    )

    ev = data["events"]
    parts.append(_h2("Events triggered"))
    parts.append(
        f"<div style='font-size:13px;margin:0 0 8px'>{ev['total_events']} custom events across "
        f"{ev['distinct_event_names']} distinct event names.</div>"
    )
    parts.append(
        _table(
            ["Feature area", "Events", "Event names"],
            [[r["family"], r["events"], r["names"]] for r in ev["families"]]
            or [["(none)", "", ""]],
        )
    )
    parts.append(
        _table(
            ["Event", "Visitors (sort)", "Visits", "Events", "7d mean", "vs 7d mean"],
            [
                [
                    r["event_name"],
                    r["visitors"],
                    r["visits"],
                    r["events"],
                    r["prior_daily_mean"],
                    _fmt_delta(r["vs_prior_daily_mean"]),
                ]
                for r in ev["rows"]
            ]
            or [["(no custom events)", "", "", "", "", ""]],
            "Ranked by distinct visitors. \"7d mean\" is that event's mean daily count over "
            "the seven days before this one; an event first emitted since then shows 0.",
        )
    )

    parts.append(
        "<hr style='border:0;border-top:1px solid #ddd;margin:22px 0 8px'>"
        "<div style='font-size:11px;color:#777'>Source: the Umami analytics Postgres, read "
        "directly. The operator's home and work IPs are excluded at Umami ingest level, so "
        "they never enter these counts. Every figure is computed in SQL and Python; the "
        "model wrote only the lead paragraph.</div></body></html>"
    )

    return {"subject": subject, "html_body": "".join(parts), "text": render_text(data, lead)}


def render_text(data: dict, lead: str = "") -> str:
    h, ident, eng = data["headline"], data["identity"], data["engagement"]
    out = [f"battlestats.online traffic: {data['day']} (UTC)", ""]
    if lead:
        out += [lead, ""]
    out.append("TOTALS")
    for key, label in (
        ("visitors", "Visitors"),
        ("visits", "Visits/sessions"),
        ("pageviews", "Pageviews"),
        ("events", "Custom events"),
    ):
        node = h[key]
        out.append(
            f"  {label:<16} {node['value']:>6}   vs prev day {_fmt_delta(node['vs_prev_day'])}"
            f"   vs 7d mean {_fmt_delta(node['vs_mean_prior_7d'])}"
        )
    out += [
        "",
        "NEW VS RETURNING (denominator: the day's active visitors)",
        f"  new {ident['new']} ({ident['new_pct']}%); returning {ident['returning']} "
        f"({ident['returning_pct']}%); total {ident['visitors']}",
        f"  bs-vid coverage {ident['identified_visitors']}/{ident['visitors']}; "
        f"{ident['new_but_known_bs_vid']} \"new\" visitors were known browsers on a rotated address",
        "",
        "ENGAGEMENT",
        f"  {eng['avg_pageviews_per_visit']} pageviews/visit; average visit "
        f"{_duration(eng['avg_visit_seconds'])}; {eng['single_view_visits']}/{eng['visits']} single-view",
        "",
        "TOP PAGES (ranked by visitors)",
    ]
    out += [f"  {r['visitors']:>3}  {r['label']}" for r in data["pages"]] or ["  (none)"]
    loc = data["locale"]
    out += [
        "",
        "LANGUAGE",
        (
            f"  UI non-English {loc['ui_non_english']}/{loc['ui_visitors']} beacon-reporting "
            f"visitors ({loc['ui_non_english_pct']}%)"
            if loc["ui_non_english_pct"] is not None
            else "  UI locale unmeasured on this day: no beacon events "
            "(the beacon shipped 2026-08-10)"
        ),
        f"  Browser ko/ja {loc['browser_ko_ja']}/{loc['browser_visitors']} visitors "
        f"({loc['browser_ko_ja_pct']}%) -- the reachable ceiling; English is still the default",
    ]
    if _ui_coverage_caveat(loc):
        out.append(
            f"  Beacon coverage {loc['ui_visitors']}/{loc['browser_visitors']} of the day's "
            f"visitors ({loc['ui_coverage_pct']}%): the UI figure is a subset of this day"
        )
    out += [f"  {r['visitors']:>3}  browser {r['lang']}" for r in loc["browser_rows"]] or [
        "  (none)"
    ]
    out += ["", "EVENTS TRIGGERED (ranked by visitors)"]
    out += [
        f"  {r['visitors']:>3}  {r['event_name']} ({r['events']} events)"
        for r in data["events"]["rows"]
    ] or ["  (none)"]
    return "\n".join(out)


# --------------------------------------------------------------------------- #
# LLM lead paragraph (prose only; it never emits a figure it had to derive)
# --------------------------------------------------------------------------- #
SYSTEM_PROMPT = """You write the one-paragraph lead of a daily web-traffic email \
for battlestats.online, a World of Warships player and clan statistics site run \
by a single operator. You are given a JSON object of already-computed figures for \
one UTC day; the email renders every table itself.

Write 2-4 sentences. Voice: Data from Star Trek -- warm, analytical, precise; no \
hype, no flattery. Use colons and semicolons, never em dashes.

Rules:
- NEVER compute a number. Only restate figures already present in the JSON, and \
only where naming one adds meaning. Never derive a percentage, a difference or a \
ratio that is not already a field.
- NEVER write a construction of the form "X of Y", "X out of Y", or "N% of", and \
never place two figures side by side so that one reads as a share of the other. \
The lists named `top_*_labels` are rank-ordered labels with no counts: say "led \
by" or "mostly", never a quantity.
- Say what matters: whether the day is ordinary or unusual against the 7-day mean, \
where the traffic came from, and which feature the events show people using. \
Traffic here is tens of visitors per day; a single-day swing is normally noise. \
Say "within the usual range" when it is, rather than inventing a trend.
- The two `language` percentages have DIFFERENT denominators and are not \
comparable as parts of one whole. `ui_non_english_pct` is the share of \
beacon-reporting visitors whose interface ran in Korean or Japanese; \
`browser_ko_ja_pct` is the share of all visitors whose BROWSER asks for Korean \
or Japanese, which is a ceiling, not usage. English is the default for every \
new arrival, so a low first figure beside a high second one is the expected \
state and not a fault. Mention them only when one has moved; never subtract \
them, and never call the second one usage.
- Do not recommend actions. Do not speculate about causes you cannot see.

Output STRICT JSON only, no markdown fences: {"lead": "..."}"""


def llm_payload(data: dict) -> dict:
    """The narrowed view of the day handed to the model.

    The model is deliberately NOT shown per-route, per-referrer or per-country
    counts. Given them, it juxtaposes a row's count with the day's total and
    writes a share that does not exist: an early live run produced "traffic
    remained mostly direct (36 of 48 visits)" and "40 visits on /player/*" out of
    48, both false, because those columns do not partition the day's visits (one
    visit spans several routes, and a referrer is recorded once per visit while
    the visit's later pageviews carry none). Instructing the model not to derive
    ratios did not stop it; withholding the operands does.

    What remains is either a whole-day total, a pre-computed delta, or a label
    with no number attached, so a cross-denominator ratio has no operands to be
    built from.
    """
    return {
        "day": data["day"],
        "headline": data["headline"],
        "identity": {
            k: data["identity"][k]
            for k in ("visitors", "new", "returning", "new_pct", "returning_pct")
        },
        "engagement": {
            k: data["engagement"][k]
            for k in ("avg_pageviews_per_visit", "avg_visit_seconds")
        },
        "top_event_names": [
            {
                "event_name": r.get("event_name"),
                "events": r.get("events"),
                "prior_daily_mean": r.get("prior_daily_mean"),
            }
            for r in data["events"]["rows"][:3]
        ],
        "total_custom_events": data["events"]["total_events"],
        # Percentages only, both pre-computed, each against its own denominator.
        # The counts behind them are withheld for the reason in this docstring:
        # given both operands the model writes a share across the two.
        "language": {
            "ui_non_english_pct": data["locale"]["ui_non_english_pct"],
            "browser_ko_ja_pct": data["locale"]["browser_ko_ja_pct"],
        },
        # Labels only, in rank order. No counts.
        "top_browser_language_labels": [r.get("lang") for r in data["locale"]["browser_rows"][:3]],
        "top_referrer_labels": [r.get("source") for r in data["referrers"][:3]],
        "top_country_labels": [r.get("country") for r in data["countries"][:3]],
        "top_route_labels": [r.get("route") for r in data["routes"][:3]],
    }


def call_anthropic(model: str, api_key: str, data: dict) -> str:
    body = {
        # max_tokens caps thinking AND response text together, which is what
        # produced the earlier empty-response failure. The fix is headroom plus
        # low effort, NOT thinking={"type": "disabled"}: with thinking off,
        # Opus 5 can leak <thinking> tags into the visible response, and this
        # response is parsed as JSON, so a leaked tag breaks the parse.
        "model": model,
        "max_tokens": 4000,
        "output_config": {"effort": "low"},
        "system": SYSTEM_PROMPT,
        "messages": [
            {
                "role": "user",
                "content": "Figures for the day. Write the lead.\n\n"
                + json.dumps(data, indent=2, default=str),
            }
        ],
    }
    req = urllib.request.Request(
        ANTHROPIC_URL,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "x-api-key": api_key,
            "anthropic-version": ANTHROPIC_VERSION,
            "content-type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    # A safety-classifier decline is HTTP 200 with stop_reason=refusal and no
    # content, so name it before the generic empty-response case below.
    if payload.get("stop_reason") == "refusal":
        raise RuntimeError(
            f"model declined the request (category="
            f"{(payload.get('stop_details') or {}).get('category')})"
        )
    text = "".join(
        blk.get("text", "") for blk in payload.get("content", []) if blk.get("type") == "text"
    ).strip()
    if not text:
        raise RuntimeError(f"empty response (stop_reason={payload.get('stop_reason')})")
    if text.startswith("```"):
        text = text.strip("`")
        text = text[text.find("{"): text.rfind("}") + 1]
    lead = json.loads(text).get("lead", "").strip()
    if not lead:
        raise RuntimeError("response carried no lead")
    return lead


# --------------------------------------------------------------------------- #
# main
# --------------------------------------------------------------------------- #
def parse_day(argv: list[str]) -> date:
    for arg in argv:
        if arg.startswith("--day="):
            return date.fromisoformat(arg.split("=", 1)[1])
    override = cfg("TRAFFIC_EMAIL_DAY")
    if override:
        return date.fromisoformat(override)
    return (datetime.now(timezone.utc) - timedelta(days=1)).date()


def gather(day: date) -> dict:
    dsn = read_umami_dsn(cfg("UMAMI_ENV_FILE", DEFAULT_UMAMI_ENV_FILE))
    psql_bin = cfg("PSQL_BIN", DEFAULT_PSQL)
    domain = cfg("UMAMI_SITE_DOMAIN", DEFAULT_SITE_DOMAIN)

    site = run_queries(dsn, [resolve_website_sql(domain)], psql_bin)[0]
    if not site:
        raise RuntimeError(f"no Umami website row for domain {domain!r}")
    website_id = site[0]["website_id"]

    day_lo = datetime.combine(day, datetime.min.time(), tzinfo=timezone.utc)
    day_hi = day_lo + timedelta(days=1)
    trend_lo = day_lo - timedelta(days=TREND_DAYS)

    sqls = build_sqls(website_id, day_lo, day_hi, trend_lo)
    results = run_queries(dsn, list(sqls.values()), psql_bin)
    return compute(dict(zip(sqls.keys(), results)), day)


def main() -> int:
    args = sys.argv[1:]
    dry_run = "--dry-run" in args
    no_llm = "--no-llm" in args

    load_env_file(cfg("TRAFFIC_EMAIL_ENV_FILE", DEFAULT_ENV_FILE))
    day = parse_day(args)
    data = gather(day)

    lead, lead_error = "", ""
    if not no_llm:
        api_key = cfg("ANTHROPIC_API_KEY")
        if not api_key:
            lead_error = "ANTHROPIC_API_KEY not set"
        else:
            try:
                lead = call_anthropic(
                    cfg("ANTHROPIC_MODEL", "claude-opus-5"), api_key, llm_payload(data)
                )
            except Exception as exc:
                detail = exc
                if isinstance(exc, urllib.error.HTTPError):
                    try:
                        detail = f"{exc} :: {exc.read().decode('utf-8')[:400]}"
                    except Exception:
                        detail = str(exc)
                lead_error = f"{type(exc).__name__}: {detail}"

    email = render(data, lead=lead, lead_error=lead_error)

    if dry_run:
        print("SUBJECT:", email["subject"])
        print("---- TEXT ----")
        print(email["text"])
        print("---- HTML ----")
        print(email["html_body"])
        if lead_error:
            print("---- LEAD ERROR ----\n", lead_error)
        return 0

    send_email(email["subject"], email["html_body"], email["text"])
    print(f"[ok] sent: {email['subject']}")
    return 0


FAILURE_SUBJECT = "[battlestats] daily traffic email FAILED"


def emit_failure(tb: str, dry_run: bool = False) -> None:
    """Fail loud: mail the traceback so a broken cron run is never silent.

    A dry run is how this script is exercised by hand, so it must send nothing
    at all -- including this. It must also never raise: a failure inside the
    failure handler would replace a useful traceback with a useless one.
    """
    sys.stderr.write(tb + "\n")
    if dry_run:
        sys.stderr.write("[dry-run] failure email suppressed\n")
        return
    try:
        body = (
            "<html><body><h2>battlestats daily traffic email FAILED</h2><pre>"
            + _esc(tb)
            + "</pre></body></html>"
        )
        send_email(FAILURE_SUBJECT, body, tb)
        print("[warn] sent failure notification email")
    except Exception:
        sys.stderr.write("could not send failure email:\n" + traceback.format_exc() + "\n")


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        emit_failure(traceback.format_exc(), dry_run="--dry-run" in sys.argv[1:])
        sys.exit(1)
