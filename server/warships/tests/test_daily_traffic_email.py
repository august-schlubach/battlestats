"""Behaviour tests for server/scripts/daily_traffic_email.py.

The script is a standalone stdlib-only cron entrypoint, not a Django module, so
it is loaded by path. The database read (`run_queries`) and the send path
(`send_email`) are both mocked: these tests assert the arithmetic, the rendered
content, the SQL's ranking/timezone discipline, and the FAILED path.
"""
import ast
import importlib.util
import os
import pathlib
import re
import subprocess
import tempfile
from datetime import date
from unittest import mock

from django.test import SimpleTestCase

SCRIPT = pathlib.Path(__file__).resolve().parents[2] / "scripts" / "daily_traffic_email.py"


def _load():
    spec = importlib.util.spec_from_file_location("daily_traffic_email", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


mod = _load()


# --------------------------------------------------------------------------- #
# fixtures: the shape run_queries returns, keyed exactly like build_sqls
# --------------------------------------------------------------------------- #
DAY = date(2026, 8, 8)


def _trend():
    """Seven prior days at a flat 20 visitors, then the target day at 29."""
    rows = [
        {
            "day": f"2026-08-{d:02d}",
            "pageviews": 40,
            "events": 60,
            "visitors": 20,
            "visits": 30,
            "new_visitors": 10,
        }
        for d in range(1, 8)
    ]
    rows.append(
        {
            "day": "2026-08-08",
            "pageviews": 74,
            "events": 107,
            "visitors": 29,
            "visits": 48,
            "new_visitors": 13,
        }
    )
    return rows


RAW = {
    "trend": _trend(),
    "engagement": [
        {
            "visits": 48,
            "avg_pageviews_per_visit": 1.54,
            "avg_visit_seconds": 248,
            "single_view_visits": 25,
        }
    ],
    "identity": [
        {
            "visitors": 29,
            "new_visitors": 13,
            "returning_visitors": 16,
            "identified_visitors": 15,
            "new_but_known_bs_vid": 2,
        }
    ],
    "pages": [
        {"url_path": "/", "visitors": 11, "visits": 12, "pageviews": 17},
        {"url_path": "/player/%5BDJMAX%5D", "visitors": 2, "visits": 7, "pageviews": 11},
    ],
    "routes": [{"route": "/player/*", "visitors": 18, "visits": 34, "pageviews": 55}],
    "referrers": [
        {"source": "(direct / none)", "visitors": 16, "visits": 20},
        {"source": "t.co", "visitors": 3, "visits": 3},
    ],
    "countries": [{"country": "US", "visitors": 8}],
    "devices": [{"device": "desktop", "visitors": 20}],
    # 29 beacon-reporting visitors, 4 of them non-English.
    "locale_active": [
        {"locale": "en", "visitors": 25, "load_visits": 40},
        {"locale": "ko", "visitors": 3, "load_visits": 4},
        {"locale": "ja", "visitors": 1, "load_visits": 1},
    ],
    # 29 visitors partitioned by browser language: 13 ko/ja, 15 non-English.
    "browser_language": [
        {"lang": "en", "visitors": 13},
        {"lang": "ko", "visitors": 8},
        {"lang": "ja", "visitors": 5},
        {"lang": "de", "visitors": 2},
        {"lang": "??", "visitors": 1},
    ],
    "events": [
        {
            "event_name": "ship-leaderboard-filter",
            "events": 17,
            "visitors": 4,
            "visits": 5,
            "prior_daily_mean": 10.29,
        },
        {
            "event_name": "search",
            "events": 6,
            "visitors": 4,
            "visits": 4,
            "prior_daily_mean": 8.0,
        },
        {
            "event_name": "theme-change",
            "events": 1,
            "visitors": 1,
            "visits": 1,
            "prior_daily_mean": 0,
        },
    ],
}


def _computed(raw=None):
    return mod.compute({k: list(v) for k, v in (raw or RAW).items()}, DAY)


# --------------------------------------------------------------------------- #
# arithmetic
# --------------------------------------------------------------------------- #
class ComputeTests(SimpleTestCase):
    def test_headline_carries_the_target_days_values(self):
        h = _computed()["headline"]
        self.assertEqual(h["visitors"]["value"], 29)
        self.assertEqual(h["visits"]["value"], 48)
        self.assertEqual(h["pageviews"]["value"], 74)
        self.assertEqual(h["events"]["value"], 107)

    def test_day_over_day_delta_uses_the_immediately_prior_day(self):
        h = _computed()["headline"]
        self.assertEqual(h["visitors"]["prev_day"], 20)
        self.assertEqual(h["visitors"]["vs_prev_day"]["abs"], 9)
        self.assertEqual(h["visitors"]["vs_prev_day"]["pct"], 45.0)

    def test_seven_day_mean_excludes_the_target_day(self):
        """A mean that swallowed the target day would flatten every anomaly."""
        h = _computed()["headline"]
        self.assertEqual(h["visitors"]["mean_prior_7d"], 20.0)
        self.assertEqual(h["visitors"]["vs_mean_prior_7d"]["abs"], 9.0)

    def test_missing_target_day_degrades_to_zeros_rather_than_raising(self):
        raw = dict(RAW, trend=[r for r in _trend() if r["day"] != "2026-08-08"])
        h = mod.compute(raw, DAY)["headline"]
        self.assertEqual(h["visitors"]["value"], 0)

    def test_delta_against_a_zero_base_reports_absolute_only(self):
        self.assertEqual(mod._delta(5, 0), {"abs": 5, "pct": None})

    def test_delta_against_a_missing_base_is_not_a_zero(self):
        """No prior day must read as 'n/a', never as a 100% jump."""
        self.assertEqual(mod._delta(5, None), {"abs": None, "pct": None})


class IdentityTests(SimpleTestCase):
    def test_new_plus_returning_equals_the_days_active_visitors(self):
        ident = _computed()["identity"]
        self.assertEqual(ident["new"] + ident["returning"], ident["visitors"])

    def test_shares_are_taken_over_visitors_not_visits(self):
        """The denominator is the day's active visitors (29), not its visits (48)."""
        ident = _computed()["identity"]
        self.assertEqual(ident["new_pct"], 44.8)
        self.assertEqual(ident["returning_pct"], 55.2)

    def test_durable_id_coverage_is_reported_separately(self):
        ident = _computed()["identity"]
        self.assertEqual(ident["identified_visitors"], 15)
        self.assertEqual(ident["identified_pct"], 51.7)

    def test_bs_vid_correction_is_not_folded_into_the_primary_counts(self):
        """new_but_known_bs_vid is a diagnostic; subtracting it silently would
        make the headline incomparable with earlier days."""
        ident = _computed()["identity"]
        self.assertEqual(ident["new_but_known_bs_vid"], 2)
        self.assertEqual(ident["new"], 13)


class EventSummaryTests(SimpleTestCase):
    def test_totals_and_distinct_names(self):
        ev = _computed()["events"]
        self.assertEqual(ev["total_events"], 24)
        self.assertEqual(ev["distinct_event_names"], 3)

    def test_each_event_gets_a_delta_against_its_own_prior_mean(self):
        rows = {r["event_name"]: r for r in _computed()["events"]["rows"]}
        self.assertEqual(rows["ship-leaderboard-filter"]["vs_prior_daily_mean"]["abs"], 6.71)
        self.assertEqual(rows["search"]["vs_prior_daily_mean"]["abs"], -2.0)

    def test_families_group_by_the_first_two_segments(self):
        fams = {f["family"]: f for f in _computed()["events"]["families"]}
        self.assertIn("ship-leaderboard", fams)
        self.assertEqual(fams["ship-leaderboard"]["events"], 17)

    def test_short_names_stay_whole(self):
        self.assertEqual(mod._event_family("search"), "search")
        self.assertEqual(mod._event_family("theme-change"), "theme-change")
        self.assertEqual(mod._event_family("player-insights-profile"), "player-insights")


class LocaleTests(SimpleTestCase):
    """The locale block's two halves answer different questions. Nothing here may
    let them share a denominator: `ui_*` counts only beacon-reporting visitors,
    `browser_*` counts every visitor."""

    def test_ui_share_is_taken_against_beacon_reporting_visitors(self):
        loc = _computed()["locale"]
        self.assertEqual(loc["ui_visitors"], 29)
        self.assertEqual(loc["ui_non_english"], 4)
        self.assertEqual(loc["ui_non_english_pct"], 13.8)

    def test_browser_share_counts_every_visitor_and_folds_unknowns_out_of_non_english(self):
        loc = _computed()["locale"]
        self.assertEqual(loc["browser_visitors"], 29)
        # ko 8 + ja 5; the reachable ceiling while those are the only two locales.
        self.assertEqual(loc["browser_ko_ja"], 13)
        self.assertEqual(loc["browser_ko_ja_pct"], 44.8)
        # de counts as non-English, '??' (unset language) does not.
        self.assertEqual(loc["browser_non_english"], 15)

    def test_a_day_before_the_beacon_shipped_yields_no_share_rather_than_zero(self):
        """Absent instrumentation is not 0% adoption, and the email must not
        print it as such."""
        raw = dict(RAW, locale_active=[])
        loc = _computed(raw)["locale"]
        self.assertEqual(loc["ui_visitors"], 0)
        self.assertIsNone(loc["ui_non_english_pct"])
        # The demand half still reports; it predates the beacon entirely.
        self.assertEqual(loc["browser_ko_ja"], 13)

    def test_browser_rows_are_truncated_for_display_only_never_for_the_denominator(self):
        raw = dict(
            RAW,
            browser_language=[{"lang": f"l{i}", "visitors": 1} for i in range(mod.LOCALE_TOP_N + 4)],
        )
        loc = _computed(raw)["locale"]
        self.assertEqual(len(loc["browser_rows"]), mod.LOCALE_TOP_N)
        self.assertEqual(loc["browser_visitors"], mod.LOCALE_TOP_N + 4)

    def test_full_beacon_coverage_adds_no_caveat(self):
        """29 beacon-reporting visitors against 29 for the day: nothing to warn about."""
        loc = _computed()["locale"]
        self.assertEqual(loc["ui_coverage_pct"], 100.0)
        self.assertEqual(mod._ui_coverage_caveat(loc), "")

    def test_partial_beacon_coverage_is_declared_rather_than_left_to_the_reader(self):
        """The deploy day is the motivating case: the beacon covered its last few
        hours while browser language covered all 24, so the two shares are not
        only different populations but different spans."""
        raw = dict(
            RAW,
            locale_active=[
                {"locale": "en", "visitors": 8, "load_visits": 9},
                {"locale": "ko", "visitors": 2, "load_visits": 2},
            ],
        )
        email = mod.render(_computed(raw))
        loc = _computed(raw)["locale"]
        self.assertEqual(loc["ui_coverage_pct"], 34.5)
        self.assertIn("drawn from a subset of this day", email["html_body"])
        self.assertIn("Beacon coverage 10/29", email["text"])

    def test_the_locale_queries_read_the_beacon_and_the_session_language(self):
        from datetime import datetime, timedelta, timezone

        lo = datetime(2026, 8, 8, tzinfo=timezone.utc)
        sqls = mod.build_sqls("w-id", lo, lo + timedelta(days=1), lo - timedelta(days=7))
        self.assertIn("we.event_name = 'locale-active'", sqls["locale_active"])
        self.assertIn("ed.data_key = 'locale'", sqls["locale_active"])
        # No LIMIT on either: a truncated set would give the shares above a
        # denominator that silently excludes the tail.
        self.assertNotIn("LIMIT", sqls["locale_active"])
        self.assertNotIn("LIMIT", sqls["browser_language"])
        self.assertIn("split_part", sqls["browser_language"])


class PathTests(SimpleTestCase):
    def test_percent_encoded_player_names_are_decoded_for_display(self):
        self.assertEqual(mod._pretty_path("/player/%5BDJMAX%5D"), "/player/[DJMAX]")
        self.assertEqual(mod._pretty_path("/player/DER%20LICTH%20HAMMER"), "/player/DER LICTH HAMMER")


# --------------------------------------------------------------------------- #
# rendered content
# --------------------------------------------------------------------------- #
class RenderTests(SimpleTestCase):
    def setUp(self):
        self.email = mod.render(_computed(), lead="A quiet day.")
        self.html = self.email["html_body"]

    def test_subject_leads_with_the_three_headline_counts(self):
        self.assertEqual(
            self.email["subject"],
            "[battlestats] traffic 2026-08-08: 29 visitors, 48 visits, 74 views",
        )

    def test_lead_paragraph_is_included_when_supplied(self):
        self.assertIn("A quiet day.", self.html)

    def test_new_vs_returning_definition_is_legible_in_the_email_itself(self):
        """The definition must travel with the number, not live only in code."""
        self.assertIn("first-ever appearance in Umami", self.html)
        self.assertIn("denominator is the day&#x27;s active visitors", self.html.replace("'", "&#x27;"))
        self.assertIn("13", self.html)
        self.assertIn("44.8%", self.html)

    def test_ip_rotation_caveat_is_stated(self):
        self.assertIn("rotates", self.html)
        self.assertIn("bs-vid durable-id check", self.html)

    def test_page_paths_are_shown_decoded(self):
        self.assertIn("/player/[DJMAX]", self.html)
        self.assertNotIn("%5BDJMAX%5D", self.html)

    def test_tables_declare_that_ranking_is_by_visitors(self):
        self.assertIn("Ranked by distinct visitors, not by view count", self.html)

    def test_own_domain_referrer_exclusion_is_declared(self):
        self.assertIn("internal navigation and are excluded", self.html)

    def test_operator_ip_exclusion_is_declared(self):
        self.assertIn("excluded at Umami ingest level", self.html)

    def test_every_custom_event_name_appears(self):
        for name in ("ship-leaderboard-filter", "search", "theme-change"):
            self.assertIn(name, self.html)

    def test_html_is_escaped_not_injected(self):
        raw = dict(RAW, pages=[{"url_path": "/<script>x</script>", "visitors": 1, "visits": 1, "pageviews": 1}])
        html = mod.render(mod.compute(raw, DAY))["html_body"]
        self.assertNotIn("<script>x</script>", html)
        self.assertIn("&lt;script&gt;", html)

    def test_lead_error_is_surfaced_without_blocking_the_numbers(self):
        html = mod.render(_computed(), lead_error="HTTPError: 529")["html_body"]
        self.assertIn("HTTPError: 529", html)
        self.assertIn("computed in Python and is unaffected", html)

    def test_text_alternative_carries_the_headline_and_the_split(self):
        text = self.email["text"]
        self.assertIn("Visitors             29", text)
        self.assertIn("new 13 (44.8%); returning 16 (55.2%)", text)

    def test_language_section_states_both_denominators_in_the_email_itself(self):
        """A reader seeing 13.8% beside 44.8% must be told they are not the same
        population, or the pair reads as a 31-point shortfall in adoption."""
        self.assertIn("Language", self.html)
        self.assertIn("UI locale in effect", self.html)
        self.assertIn("Browser language", self.html)
        self.assertIn("denominator is beacon-reporting visitors, not the day", self.html)
        self.assertIn("reachable ceiling", self.html)
        self.assertIn("English remains the default", self.html)

    def test_a_day_with_no_beacon_events_reads_as_unmeasured_not_as_zero(self):
        """Every day before 2026-08-10 has no beacon data. Printing "0 (None%)"
        would read as nobody using a non-English UI, which is a different claim."""
        email = mod.render(_computed(dict(RAW, locale_active=[])))
        self.assertIn("(no locale-active events)", email["html_body"])
        self.assertIn("unmeasured rather than zero", email["html_body"])
        self.assertIn("Browser language", email["html_body"])
        self.assertIn("UI locale unmeasured on this day", email["text"])
        self.assertNotIn("None%", email["html_body"])
        self.assertNotIn("None%", email["text"])
        # No coverage caveat on top: it would qualify a figure never printed.
        self.assertNotIn("Beacon coverage", email["text"])
        self.assertNotIn("drawn from a subset of this day", email["html_body"])

    def test_text_alternative_carries_the_language_split(self):
        text = self.email["text"]
        self.assertIn("UI non-English 4/29 beacon-reporting visitors (13.8%)", text)
        self.assertIn("Browser ko/ja 13/29 visitors (44.8%)", text)

    def test_duration_is_rendered_as_minutes_and_seconds(self):
        self.assertEqual(mod._duration(248), "4m 08s")
        self.assertEqual(mod._duration(None), "n/a")

    def test_empty_day_renders_without_raising(self):
        empty = {k: [] for k in RAW}
        html = mod.render(mod.compute(empty, DAY))["html_body"]
        self.assertIn("no custom events", html)


# --------------------------------------------------------------------------- #
# SQL discipline (regression guards for bugs already paid for once)
# --------------------------------------------------------------------------- #
class SqlTests(SimpleTestCase):
    def setUp(self):
        from datetime import datetime, timedelta, timezone

        lo = datetime(2026, 8, 8, tzinfo=timezone.utc)
        self.sqls = mod.build_sqls("w-id", lo, lo + timedelta(days=1), lo - timedelta(days=7))

    def test_pages_are_ranked_by_visitors_never_by_view_count(self):
        """Raw event counts have produced misleading readouts here before."""
        self.assertIn("ORDER BY visitors DESC", self.sqls["pages"])
        self.assertIn("ORDER BY visitors DESC", self.sqls["routes"])
        self.assertIn("ORDER BY visitors DESC", self.sqls["referrers"])

    def test_events_are_ranked_by_visitors_first(self):
        self.assertIn("ORDER BY d.visitors DESC", self.sqls["events"])

    def test_pageviews_and_custom_events_use_the_right_event_types(self):
        self.assertIn("we.event_type = 1", self.sqls["pages"])
        self.assertIn("we.event_type = 2", self.sqls["events"])

    def test_no_query_casts_a_timestamp_to_date(self):
        """`(ts AT TIME ZONE 'UTC')::date` compared against a timestamptz forces an
        implicit cast through the server's TimeZone setting, which can shift a day
        boundary. Nothing casts to date; bounds are timestamptz literals."""
        for name, sql in self.sqls.items():
            self.assertNotIn("::date", sql, name)
        self.assertIn("::timestamptz", self.sqls["identity"])

    def test_trend_derives_both_sides_of_its_comparison_in_naive_utc(self):
        """The real hazard is a naive/aware comparison, not a ::date cast. Both
        `day` and `sess_first` must be produced by an explicit AT TIME ZONE 'UTC',
        so neither side of `sess_first >= day` is a bare timestamptz."""
        trend = self.sqls["trend"]
        self.assertIn("date_trunc('day', we.created_at AT TIME ZONE 'UTC') AS day", trend)
        self.assertIn("(s.created_at AT TIME ZONE 'UTC') AS sess_first", trend)
        self.assertIn("sess_first >= day", trend)
        # No bare column may appear on either side of that comparison.
        self.assertNotIn("s.created_at >= day", trend)
        self.assertNotIn("sess_first >= we.created_at", trend)

    def test_referrers_exclude_own_domain_internal_navigation(self):
        self.assertIn("we.referrer_domain, '') <> coalesce(we.hostname", self.sqls["referrers"])

    def test_no_analytics_side_ip_filter_is_attempted(self):
        """Operator IPs are excluded at Umami INGEST level (IGNORE_IP), and Umami
        stores no raw IP column at all, so any filter here would be a fiction that
        silently dropped real visitors."""
        for name, sql in self.sqls.items():
            self.assertIsNone(re.search(r"\bip\b|ip_address|IGNORE_IP", sql, re.I), name)

    def test_website_scope_is_bound_on_every_query(self):
        for name, sql in self.sqls.items():
            self.assertIn("we.website_id = 'w-id'::uuid", sql, name)

    def test_sql_literals_escape_quotes(self):
        self.assertEqual(mod._lit("o'brien"), "'o''brien'")


# --------------------------------------------------------------------------- #
# the psql transport
# --------------------------------------------------------------------------- #
class RunQueriesTests(SimpleTestCase):
    def _proc(self, stdout="", stderr="", code=0):
        return subprocess.CompletedProcess(args=[], returncode=code, stdout=stdout, stderr=stderr)

    def test_parses_one_json_line_per_query(self):
        out = '[{"a": 1}]\n[]\n'
        with mock.patch.object(mod.subprocess, "run", return_value=self._proc(stdout=out)):
            rows = mod.run_queries("dsn", ["SELECT 1", "SELECT 2"])
        self.assertEqual(rows, [[{"a": 1}], []])

    def test_uses_jsonb_agg_not_json_agg(self):
        """json_agg pretty-prints with real newlines, shattering one result across
        many lines and desynchronising the line/query mapping."""
        with mock.patch.object(mod.subprocess, "run", return_value=self._proc(stdout="[]\n")) as run:
            mod.run_queries("dsn", ["SELECT 1"])
        sql = run.call_args[0][0][-1]
        self.assertIn("jsonb_agg", sql)
        self.assertNotIn("json_agg(t), '[]'::json)", sql)

    def test_nonzero_exit_raises_with_the_psql_error(self):
        proc = self._proc(stderr="ERROR:  relation does not exist", code=1)
        with mock.patch.object(mod.subprocess, "run", return_value=proc):
            with self.assertRaises(RuntimeError) as ctx:
                mod.run_queries("dsn", ["SELECT 1"])
        self.assertIn("relation does not exist", str(ctx.exception))

    def test_line_count_mismatch_raises_rather_than_misaligning_results(self):
        with mock.patch.object(mod.subprocess, "run", return_value=self._proc(stdout="[]\n[]\n")):
            with self.assertRaises(RuntimeError) as ctx:
                mod.run_queries("dsn", ["SELECT 1"])
        self.assertIn("2 result lines for 1 queries", str(ctx.exception))

    def test_stops_on_first_sql_error(self):
        with mock.patch.object(mod.subprocess, "run", return_value=self._proc(stdout="[]\n")) as run:
            mod.run_queries("dsn", ["SELECT 1"])
        self.assertIn("ON_ERROR_STOP=1", run.call_args[0][0])


# --------------------------------------------------------------------------- #
# config
# --------------------------------------------------------------------------- #
class ConfigTests(SimpleTestCase):
    def test_explicit_env_dsn_wins_and_umami_env_file_is_never_read(self):
        with mock.patch.dict(os.environ, {"UMAMI_DATABASE_URL": "postgres://x"}, clear=False):
            self.assertEqual(mod.read_umami_dsn("/nonexistent"), "postgres://x")

    def test_reads_only_database_url_from_umamis_env_file(self):
        with tempfile.NamedTemporaryFile("w", suffix=".env", delete=False) as fh:
            fh.write('APP_SECRET=shh\nDATABASE_URL="postgres://u:p@h/db"\nIGNORE_IP=1.2.3.4\n')
            path = fh.name
        try:
            with mock.patch.dict(os.environ, {}, clear=True):
                self.assertEqual(mod.read_umami_dsn(path), "postgres://u:p@h/db")
                # The other keys must not leak into the process environment.
                self.assertNotIn("APP_SECRET", os.environ)
                self.assertNotIn("IGNORE_IP", os.environ)
        finally:
            os.unlink(path)

    def test_unreadable_env_file_raises_a_named_error(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(RuntimeError) as ctx:
                mod.read_umami_dsn("/nonexistent/umami.env")
        self.assertIn("UMAMI_DATABASE_URL", str(ctx.exception))

    def test_day_flag_overrides_everything(self):
        self.assertEqual(mod.parse_day(["--day=2026-01-02"]), date(2026, 1, 2))

    def test_default_day_is_yesterday_in_utc(self):
        from datetime import datetime, timedelta, timezone

        with mock.patch.dict(os.environ, {}, clear=True):
            now = datetime.now(timezone.utc)
            # Tolerate a UTC midnight crossing between these two reads rather
            # than leaving a once-a-day flake in the suite.
            self.assertIn(
                mod.parse_day([]),
                {(now - timedelta(days=1)).date(), (now - timedelta(days=2)).date()},
            )

    def test_no_secret_is_hard_coded_in_the_script(self):
        """The file lives in a public repo: every credential comes from an env file."""
        src = SCRIPT.read_text()
        for marker in ("postgres://", "postgresql://", "sk-ant-", "SMTP_PASS="):
            self.assertNotIn(marker, src)


# --------------------------------------------------------------------------- #
# fail-loud
# --------------------------------------------------------------------------- #
class FailureTests(SimpleTestCase):
    def test_failure_sends_a_tagged_email_carrying_the_traceback(self):
        send = mock.MagicMock()
        with mock.patch.object(mod, "send_email", send):
            mod.emit_failure("Traceback (most recent call last):\nRuntimeError: psql exited 2")
        send.assert_called_once()
        subject, html, text = send.call_args[0]
        self.assertEqual(subject, mod.FAILURE_SUBJECT)
        self.assertIn("FAILED", subject)
        self.assertIn("RuntimeError: psql exited 2", html)
        self.assertIn("RuntimeError: psql exited 2", text)

    def test_dry_run_sends_nothing_even_on_failure(self):
        send = mock.MagicMock()
        with mock.patch.object(mod, "send_email", send):
            mod.emit_failure("boom", dry_run=True)
        send.assert_not_called()

    def test_a_broken_send_path_does_not_mask_the_original_traceback(self):
        send = mock.MagicMock(side_effect=OSError("smtp down"))
        with mock.patch.object(mod, "send_email", send):
            mod.emit_failure("original boom")  # must not raise


class MainTests(SimpleTestCase):
    ENV = {"ANTHROPIC_API_KEY": "", "TRAFFIC_EMAIL_ENV_FILE": "/nonexistent.env"}

    def _run(self, argv, send):
        with mock.patch.dict(os.environ, self.ENV, clear=False), \
             mock.patch.object(mod, "load_env_file"), \
             mock.patch.object(mod, "gather", return_value=_computed()), \
             mock.patch.object(mod, "send_email", send), \
             mock.patch.object(mod.sys, "argv", ["daily_traffic_email.py"] + argv):
            return mod.main()

    def test_dry_run_prints_and_sends_nothing(self):
        send = mock.MagicMock()
        self.assertEqual(self._run(["--dry-run", "--no-llm"], send), 0)
        send.assert_not_called()

    def test_normal_run_sends_exactly_one_email(self):
        send = mock.MagicMock()
        self.assertEqual(self._run(["--no-llm"], send), 0)
        send.assert_called_once()
        subject = send.call_args[0][0]
        self.assertIn("traffic 2026-08-08", subject)

    def test_missing_api_key_still_sends_the_deterministic_report(self):
        send = mock.MagicMock()
        self._run([], send)
        send.assert_called_once()
        self.assertIn("ANTHROPIC_API_KEY not set", send.call_args[0][1])

    def test_llm_failure_never_blocks_the_email(self):
        send = mock.MagicMock()
        with mock.patch.dict(os.environ, {"ANTHROPIC_API_KEY": "k"}, clear=False), \
             mock.patch.object(mod, "load_env_file"), \
             mock.patch.object(mod, "gather", return_value=_computed()), \
             mock.patch.object(mod, "call_anthropic", side_effect=RuntimeError("529")), \
             mock.patch.object(mod, "send_email", send), \
             mock.patch.object(mod.sys, "argv", ["daily_traffic_email.py"]):
            mod.main()
        send.assert_called_once()
        self.assertIn("RuntimeError: 529", send.call_args[0][1])


class ContractTests(SimpleTestCase):
    def test_script_imports_no_django_so_it_runs_without_the_venv(self):
        """Cron runs this under bare python3: no venv, no pip installs."""
        tree = ast.parse(SCRIPT.read_text())
        imported = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                imported.update(a.name.split(".")[0] for a in node.names)
            elif isinstance(node, ast.ImportFrom) and node.module:
                imported.add(node.module.split(".")[0])
        # Everything imported must be stdlib, plus `warships.opsmail`: the one
        # sanctioned local import, itself stdlib-only by contract
        # (test_opsmail.test_module_imports_no_django).
        allowed = {
            "__future__", "json", "subprocess", "sys", "traceback",
            "urllib", "datetime", "pathlib", "warships",
        }
        self.assertEqual(imported - allowed, set())
        self.assertNotIn("django", imported)

    def test_thinking_is_bounded_by_low_effort_not_disabled(self):
        """The budget problem is solved with effort + headroom, not thinking-off.

        max_tokens caps thinking AND response text together, which is what
        produced the original empty-response failure. Disabling thinking fixes
        that but buys a worse bug: with thinking off, Opus 5 can leak <thinking>
        tags into the visible response, and this response is parsed as JSON, so
        a leaked tag breaks the parse outright.
        """
        source = SCRIPT.read_text().replace("'", '"')
        self.assertIn('"output_config": {"effort": "low"}', source)
        self.assertNotIn('"thinking": {"type": "disabled"}', source)

    def test_a_refusal_is_named_rather_than_surfacing_as_a_parse_error(self):
        """A classifier decline is HTTP 200 with no content, not an exception."""
        source = SCRIPT.read_text()
        self.assertIn('payload.get("stop_reason") == "refusal"', source)
        self.assertIn("model declined the request", source)

    def test_the_model_is_told_never_to_compute_a_number(self):
        self.assertIn("NEVER compute a number", mod.SYSTEM_PROMPT)
        self.assertIn('NEVER write a construction of the form "X of Y"', mod.SYSTEM_PROMPT)


class LlmPayloadTests(SimpleTestCase):
    """The model gets a narrowed view. A live run given the full dict wrote
    "traffic remained mostly direct (36 of 48 visits)" and "40 visits on
    /player/*" out of 48: both false, because neither column partitions the day's
    visits. Withholding the operands is the guard; the prompt alone was not."""

    def setUp(self):
        self.payload = mod.llm_payload(_computed())
        self.blob = __import__("json").dumps(self.payload)

    def test_per_route_counts_are_withheld(self):
        self.assertNotIn("routes", self.payload)
        self.assertEqual(self.payload["top_route_labels"], ["/player/*"])

    def test_payload_keys_are_an_explicit_allowlist(self):
        """Adding a field here must be a deliberate act: every count the model can
        see is a candidate operand for a fabricated share."""
        self.assertEqual(
            set(self.payload),
            {
                "day", "headline", "identity", "engagement", "top_event_names",
                "total_custom_events", "top_referrer_labels", "top_country_labels",
                "top_route_labels", "language", "top_browser_language_labels",
            },
        )

    def test_language_is_two_precomputed_percentages_with_no_operands(self):
        """The two shares have different denominators. Handed the counts, the
        model would divide one by the other and call the browser ceiling usage."""
        self.assertEqual(
            set(self.payload["language"]), {"ui_non_english_pct", "browser_ko_ja_pct"}
        )
        self.assertEqual(self.payload["language"]["ui_non_english_pct"], 13.8)
        self.assertEqual(self.payload["language"]["browser_ko_ja_pct"], 44.8)
        # The exact key set above already excludes the count fields; these check
        # they did not reach the model by some other route. Only names that are
        # not substrings of the two surviving keys can be asserted this way.
        for withheld in ("ui_visitors", "browser_visitors", "browser_rows", "ui_rows"):
            self.assertNotIn(withheld, self.blob)
        self.assertTrue(all(isinstance(v, float) for v in self.payload["language"].values()))

    def test_referrer_and_country_counts_are_withheld(self):
        self.assertNotIn("referrers", self.payload)
        self.assertNotIn("countries", self.payload)
        self.assertEqual(self.payload["top_referrer_labels"], ["(direct / none)", "t.co"])
        self.assertEqual(self.payload["top_country_labels"], ["US"])

    def test_label_lists_carry_no_numbers_at_all(self):
        for key in (
            "top_referrer_labels",
            "top_country_labels",
            "top_route_labels",
            "top_browser_language_labels",
        ):
            for item in self.payload[key]:
                self.assertIsInstance(item, str)

    def test_per_page_rows_are_withheld(self):
        self.assertNotIn("pages", self.payload)

    def test_whole_day_totals_and_precomputed_deltas_are_kept(self):
        self.assertEqual(self.payload["headline"]["visitors"]["value"], 29)
        self.assertEqual(self.payload["headline"]["visitors"]["vs_mean_prior_7d"]["abs"], 9.0)
        self.assertEqual(self.payload["identity"]["new_pct"], 44.8)

    def test_top_events_keep_their_own_prior_mean_for_context(self):
        top = self.payload["top_event_names"]
        self.assertEqual(len(top), 3)
        self.assertEqual(top[0]["event_name"], "ship-leaderboard-filter")
        self.assertEqual(top[0]["prior_daily_mean"], 10.29)

    def test_main_hands_the_narrowed_payload_to_the_model_not_the_full_dict(self):
        called = {}

        def _capture(model, key, payload):
            called["payload"] = payload
            return "lead"

        with mock.patch.dict(os.environ, {"ANTHROPIC_API_KEY": "k"}, clear=False), \
             mock.patch.object(mod, "load_env_file"), \
             mock.patch.object(mod, "gather", return_value=_computed()), \
             mock.patch.object(mod, "call_anthropic", _capture), \
             mock.patch.object(mod, "send_email", mock.MagicMock()), \
             mock.patch.object(mod.sys, "argv", ["daily_traffic_email.py"]):
            mod.main()
        self.assertNotIn("routes", called["payload"])
        self.assertNotIn("referrers", called["payload"])
        self.assertIn("top_route_labels", called["payload"])
