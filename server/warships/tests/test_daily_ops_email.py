"""Tests for the exception-only ops alert email (`server/scripts/daily_ops_email.py`).

The contract under test, in one sentence: Python decides, the LLM only writes up.

So these tests assert the *decision*, not the prose. Healthy input must send
nothing and must not even reach the Anthropic API; every individual tripped
condition must send; missing, stale, unreadable and mis-shaped snapshots must
send; and the fail-loud path must still mail on an exception, because that path
is the one thing exception-only mode must never quiet.

The script is not a package module (it is deliberately runnable by a bare
python3 with no venv), so it is loaded by path the same way cron does.
"""
import importlib.util
import json
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path
from unittest import mock
from unittest.mock import patch

from django.test import SimpleTestCase

_SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "daily_ops_email.py"


def _load_script():
    spec = importlib.util.spec_from_file_location("daily_ops_email_under_test", _SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


doe = _load_script()


# --------------------------------------------------------------------------- #
# healthy fixture: numbers taken from the middle of the observed 2026 regime
# --------------------------------------------------------------------------- #
def _obs_realm(active_7d, active_1d, productive, bulk, poll, fresh, stale):
    return {
        "active_1d": active_1d,
        "active_7d": active_7d,
        "distinct_productive": productive,
        "coverage_ratio_vs_7d": round(productive / active_7d, 4),
        "productive_rate": 0.92,
        "fresh_within_24h": fresh,
        "fresh_frac": round(fresh / active_7d, 4),
        "stale_over_24h": stale,
        "obs_bulk_floor": bulk,
        "obs_poll": poll,
        "never_observed": 0,
    }


def write_healthy_tree(root: Path, now: datetime) -> None:
    """A snapshot tree that must produce ZERO conditions."""
    obs_dir = root / "observation-floor"
    obs_dir.mkdir(parents=True, exist_ok=True)
    realms = {
        "na": _obs_realm(53078, 27293, 18626, 27351, 3833, 19977, 33101),
        "eu": _obs_realm(88278, 32182, 30377, 42491, 5037, 31449, 56829),
        "asia": _obs_realm(65352, 33805, 21242, 26038, 3666, 22205, 42880),
    }
    totals = _obs_realm(206904, 96035, 70929, 96955, 12544, 74113, 132507)
    # observation snapshot lands at 04:30; the timer runs at 11:31 -> ~7h old
    obs_ts = now - timedelta(hours=7)
    (obs_dir / f"{obs_ts:%Y-%m-%d_%H%M}Z.json").write_text(json.dumps({
        "captured_at": obs_ts.isoformat(),
        "window_hours": 24,
        "config": {"BATTLE_OBSERVATION_FLOOR_LIMIT": "12000"},
        "realms": realms,
        "totals": totals,
    }))

    # crawl passes take days; ~40h old is well inside normal
    cy_dir = root / "crawl-yield"
    cy_dir.mkdir(parents=True, exist_ok=True)
    for realm, classified, disc, react, dorm, refreshed in (
        ("na", 275600, 383, 1886, 3, 54220),
        ("eu", 473814, 1225, 10668, 9, 93011),
        ("asia", 260700, 686, 5335, 6, 64740),
    ):
        still = classified - disc - react - dorm - refreshed
        ts = now - timedelta(hours=40)
        (cy_dir / f"{ts:%Y-%m-%d_%H%M}Z_{realm}.json").write_text(json.dumps({
            "captured_at": ts.isoformat(),
            "realm": realm,
            "pass_started_at": (ts - timedelta(days=3)).isoformat(),
            "active_window_days": 7,
            "players_classified": classified,
            "buckets": {
                "discovered_active": disc, "discovered_dormant": dorm,
                "reactivated": react, "refreshed_active": refreshed,
                "still_dormant": still,
            },
            "yield_total": disc + react,
            "overlap_total": refreshed,
            "yield_frac": round((disc + react) / classified, 4),
            "overlap_frac": round(refreshed / classified, 4),
        }))

    # recapture runs daily ~10:10-10:50; the timer runs at 11:31 -> ~1h old
    rc_dir = root / "recapture-lapsed"
    rc_dir.mkdir(parents=True, exist_ok=True)
    for realm, advanced, clanless in (("na", 740, 96), ("eu", 1708, 189), ("asia", 527, 93)):
        ts = now - timedelta(hours=1)
        (rc_dir / f"{ts:%Y-%m-%d_%H%M}Z_{realm}.json").write_text(json.dumps(
            healthy_recapture(realm, ts, advanced, clanless)))


def healthy_recapture(realm, ts, advanced=740, clanless=96):
    return {
        "captured_at": ts.isoformat(),
        "realm": realm,
        "mode": "apply",
        "band_days": [8, 365],
        "active_days": 7,
        "limit": 30000,
        "partial": False,
        "candidates": 30000,
        "scanned": 30000,
        "wg_calls": 300,
        "chunk_errors": 0,
        "no_data": 9,
        "hidden": 1,
        "still_dormant": 30000 - advanced - 1 - 9,
        "advanced": advanced,
        "yield_frac": round(advanced / 30000, 4),
        "into7d": advanced,
        "into7d_clanned": advanced - clanless,
        "into7d_clanless": clanless,
        "still_lapsed": 0,
        "still_lapsed_clanless": 0,
        "cursor_stamped": 30000,
    }


BASE_ENV = {
    # a path that does not exist, so load_env_file is a no-op in tests
    "OPS_EMAIL_ENV_FILE": "/nonexistent/ops-email.env",
    # heartbeat off by default so the exception-only assertions are not
    # accidentally satisfied by "today happens to be Monday"
    "OPS_EMAIL_HEARTBEAT_DOW": "",
    "OPS_EMAIL_ALWAYS_SEND": "0",
    "ANTHROPIC_API_KEY": "test-key",
}


class OpsAlertTestCase(SimpleTestCase):
    """Base: a healthy tree on disk plus helpers to perturb one thing at a time."""

    def setUp(self):
        import tempfile
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.bench = Path(self._tmp.name)
        self.now = doe.utcnow()
        write_healthy_tree(self.bench, self.now)

    # -- helpers ---------------------------------------------------------
    def gather(self):
        now = doe.utcnow()
        return {
            "observation": doe.gather_observation(str(self.bench), now),
            "crawl_yield": doe.gather_crawl_yield(str(self.bench), now),
            "recapture": doe.gather_recapture(str(self.bench), now),
        }

    def codes(self):
        return [c["code"] for c in doe.evaluate(self.gather())]

    def rewrite_recapture(self, realm, **overrides):
        d = self.bench / "recapture-lapsed"
        for f in d.glob(f"*_{realm}.json"):
            obj = json.loads(f.read_text())
            for k, v in overrides.items():
                if v is doe_DELETE:
                    obj.pop(k, None)
                else:
                    obj[k] = v
            f.write_text(json.dumps(obj))

    def rewrite_observation(self, scope, **overrides):
        d = self.bench / "observation-floor"
        f = sorted(d.glob("*.json"))[-1]
        obj = json.loads(f.read_text())
        node = obj["totals"] if scope == "totals" else obj["realms"][scope]
        node.update(overrides)
        f.write_text(json.dumps(obj))

    def age_file(self, sub, hours, realm=None):
        """Rewrite a family's newest file(s) to look `hours` old."""
        d = self.bench / sub
        pattern = f"*_{realm}.json" if realm else "*.json"
        ts = doe.utcnow() - timedelta(hours=hours)
        for f in sorted(d.glob(pattern)):
            obj = json.loads(f.read_text())
            obj["captured_at"] = ts.isoformat()
            f.write_text(json.dumps(obj))

    def run_main(self, argv=(), env=None):
        """Run main() with send_email + the Anthropic call mocked.

        Returns (exit_code, send_mock, llm_mock).
        """
        environ = dict(BASE_ENV, BENCH_DIR=str(self.bench))
        environ.update(env or {})
        with mock.patch.dict(os.environ, environ, clear=True), \
             mock.patch.object(doe, "send_email") as send, \
             mock.patch.object(doe, "call_anthropic") as llm, \
             mock.patch.object(sys, "argv", ["daily_ops_email.py", *argv]):
            llm.return_value = {"subject": "[battlestats] ops ALERT stub",
                                "html_body": "<html><body>stub</body></html>"}
            rc = doe.main()
        return rc, send, llm


doe_DELETE = object()


# --------------------------------------------------------------------------- #
# 1. healthy input sends nothing (the whole point)
# --------------------------------------------------------------------------- #
class HealthyInputTests(OpsAlertTestCase):
    def test_healthy_tree_trips_no_conditions(self):
        self.assertEqual(self.codes(), [])

    def test_healthy_input_does_not_send(self):
        rc, send, _llm = self.run_main()
        self.assertEqual(rc, 0)
        send.assert_not_called()

    def test_healthy_input_does_not_even_call_the_llm(self):
        """Verdict-first control flow: an all-clear run must cost nothing.

        Asserting only 'send was not called' would still pass if the script
        synthesized a digest and then threw it away.
        """
        _rc, _send, llm = self.run_main()
        llm.assert_not_called()


# --------------------------------------------------------------------------- #
# 2. each individual condition sends
# --------------------------------------------------------------------------- #
class TrippedConditionTests(OpsAlertTestCase):
    def assert_quiet(self):
        self.assertEqual(self.codes(), [])

    def assert_fires(self, expected_code_prefix):
        codes = self.codes()
        self.assertTrue(
            any(c.startswith(expected_code_prefix) for c in codes),
            f"expected a {expected_code_prefix!r} condition, got {codes}",
        )
        rc, send, _llm = self.run_main()
        self.assertEqual(rc, 0)
        send.assert_called_once()
        subject = send.call_args[0][0]
        self.assertTrue(subject.startswith("[battlestats] ops ALERT"), subject)
        return codes

    # -- shape: the recapture truncation lesson --------------------------
    def test_recapture_partial_true_sends(self):
        """A truncated pass is numerically identical to a healthy one."""
        self.rewrite_recapture("eu", partial=True, scanned=11200)
        self.assert_fires("recapture_partial:eu")

    def test_recapture_partial_field_absent_sends(self):
        """`is not False`, not `is True`: a missing shape field is shape drift.

        Post-fix snapshots all carry an explicit partial=False, so a latest file
        without it means the writer changed or an old code path came back, and
        truncation would once again be undetectable.
        """
        self.rewrite_recapture("asia", partial=doe_DELETE)
        self.assert_fires("recapture_partial_field_absent:asia")

    def test_generic_status_field_sends(self):
        """Generalized: any status/partial/failed_buckets style field is checked."""
        self.rewrite_recapture("na", status="partial")
        self.assert_fires("snapshot_status:recapture-lapsed:na")

    def test_generic_failed_buckets_field_sends(self):
        self.rewrite_recapture("na", failed_buckets=["drift"])
        self.assert_fires("snapshot_failed_buckets:recapture-lapsed:na")

    def test_recapture_detect_mode_sends(self):
        self.rewrite_recapture("na", mode="detect")
        self.assert_fires("recapture_mode:na")

    # -- upstream abort collapses the cluster ----------------------------
    def test_recapture_aborted_collapses_to_one_condition(self):
        """The 2026-08-12 asia shape: one outage reported four times.

        chunk_errors is real; cursor_stamped=0 and the zero component sum are
        CORRECT BY DESIGN (a failed chunk skips the rotation stamp), and
        advanced=0 follows from both. The abort branch must report the cause once
        and suppress all four.
        """
        self.rewrite_recapture(
            "asia", aborted=True, abort_reason="10 consecutive unproductive WG chunks",
            chunk_errors=10, scanned=1000, cursor_stamped=0, advanced=0,
            still_dormant=0, hidden=0, no_data=1000, into7d=0)
        codes = self.assert_fires("recapture_aborted:asia")
        for suppressed in ("recapture_chunk_errors:asia",
                           "recapture_high_no_data:asia",
                           "recapture_cursor_stalled:asia",
                           "recapture_component_mismatch:asia",
                           "recapture_no_returners:asia",
                           "recapture_scanned_zero:asia",
                           "recapture_shape:asia"):
            self.assertNotIn(suppressed, codes,
                             f"{suppressed} is a consequence of the abort, not a "
                             f"separate fault")

    def test_recapture_aborted_still_reports_staleness(self):
        """Liveness outranks the abort: a sweep that aborted AND stopped running
        must not hide behind a permanent 'aborted'."""
        self.rewrite_recapture("asia", aborted=True, abort_reason="x",
                               captured_at="2026-01-01T00:00:00")
        codes = self.codes()
        self.assertIn("snapshot_stale:recapture-lapsed:asia", codes)
        self.assertIn("recapture_aborted:asia", codes)

    def test_recapture_aborted_false_is_quiet(self):
        """The healthy path: an explicit aborted=False changes nothing."""
        self.rewrite_recapture("na", aborted=False, abort_reason=None)
        self.assertEqual(self.codes(), [])

    def test_recapture_chunk_errors_send(self):
        self.rewrite_recapture("eu", chunk_errors=4)
        self.assert_fires("recapture_chunk_errors:eu")

    def test_recapture_high_no_data_sends(self):
        self.rewrite_recapture("eu", no_data=900, still_dormant=30000 - 1708 - 1 - 900)
        self.assert_fires("recapture_high_no_data:eu")

    def test_recapture_zero_returners_sends(self):
        self.rewrite_recapture("asia", advanced=0, into7d=0, into7d_clanned=0,
                               into7d_clanless=0, still_dormant=30000 - 1 - 9)
        self.assert_fires("recapture_no_returners:asia")

    def test_recapture_component_mismatch_sends(self):
        """Counts that do not add up mean the snapshot is not describing itself."""
        self.rewrite_recapture("na", still_dormant=12)
        self.assert_fires("recapture_component_mismatch:na")

    def test_recapture_cursor_not_advancing_sends(self):
        self.rewrite_recapture("eu", cursor_stamped=0)
        self.assert_fires("recapture_cursor_stalled:eu")

    # -- staleness / absence ---------------------------------------------
    def test_recapture_missing_realm_sends(self):
        for f in (self.bench / "recapture-lapsed").glob("*_asia.json"):
            f.unlink()
        self.assert_fires("realm_snapshot_missing:recapture-lapsed:asia")

    def test_recapture_stale_by_one_missed_daily_run_sends(self):
        """The 2026-08-06 incident signature: EU/ASIA silently stopped writing."""
        self.age_file("recapture-lapsed", 25.4, realm="eu")
        self.assert_fires("snapshot_stale:recapture-lapsed:eu")

    def test_recapture_one_day_old_but_inside_the_window_is_quiet(self):
        """23h is still same-cadence; only a genuinely missed run should fire."""
        self.age_file("recapture-lapsed", 23.0, realm="eu")
        self.assertEqual(self.codes(), [])

    def test_observation_snapshot_missing_sends(self):
        for f in (self.bench / "observation-floor").glob("*.json"):
            f.unlink()
        self.assert_fires("snapshots_missing:observation-floor")

    def test_observation_snapshot_stale_sends(self):
        self.age_file("observation-floor", 31.0)
        self.assert_fires("snapshot_stale:observation-floor")

    def test_observation_seven_hours_old_is_quiet(self):
        """The healthy age at run time; must never fire."""
        self.age_file("observation-floor", 7.0)
        self.assertEqual(self.codes(), [])

    def test_crawl_yield_stale_sends(self):
        self.age_file("crawl-yield", 200.0, realm="asia")
        self.assert_fires("snapshot_stale:crawl-yield:asia")

    def test_crawl_yield_five_days_old_is_quiet(self):
        """Passes legitimately run days apart; 131.6h was the worst healthy age."""
        self.age_file("crawl-yield", 130.0)
        self.assertEqual(self.codes(), [])

    def test_crawl_yield_missing_realm_sends(self):
        for f in (self.bench / "crawl-yield").glob("*_na.json"):
            f.unlink()
        self.assert_fires("realm_snapshot_missing:crawl-yield:na")

    def test_crawl_yield_bucket_mismatch_sends(self):
        d = self.bench / "crawl-yield"
        f = sorted(d.glob("*_eu.json"))[-1]
        obj = json.loads(f.read_text())
        obj["buckets"]["still_dormant"] += 5000
        f.write_text(json.dumps(obj))
        self.assert_fires("crawl_bucket_mismatch:eu")

    # -- per-realm classified floor -------------------------------------
    # Realms differ in size by 1.8x (asia ~260k classified vs eu ~473k), so one
    # global floor is necessarily loose for the largest realm. The old global
    # 150,000 tolerated a 68% coverage loss on eu and silently absorbed two
    # genuinely partial passes: na 2026-08-10 (93,353, the WG outage) and eu
    # 2026-07-17 (336,000). Floors are now per realm, at ~91% of each realm's
    # observed steady-state minimum.

    def set_classified(self, realm, classified):
        """Rewrite a realm's newest pass to `classified`, keeping buckets summed
        so crawl_bucket_mismatch can't fire and confound the assertion."""
        d = self.bench / "crawl-yield"
        f = sorted(d.glob(f"*_{realm}.json"))[-1]
        obj = json.loads(f.read_text())
        obj["players_classified"] = classified
        b = obj["buckets"]
        b["still_dormant"] = classified - sum(
            v for k, v in b.items() if k != "still_dormant")
        f.write_text(json.dumps(obj))

    def test_eu_partial_pass_the_old_global_floor_missed_now_fires(self):
        # The real 2026-07-17 eu pass: 336,000 of a ~473k realm — 71% coverage,
        # comfortably above the old 150,000 global, so it never alerted.
        self.set_classified("eu", 336000)
        self.assert_fires("crawl_low_classified:eu")

    def test_a_healthy_asia_sized_pass_is_partial_for_eu(self):
        # 260,000 is a normal asia pass and a 45%-loss eu pass. One global floor
        # cannot tell those apart; per-realm floors must.
        self.set_classified("asia", 260000)
        self.assert_quiet()
        self.set_classified("eu", 260000)
        self.assert_fires("crawl_low_classified:eu")

    def test_each_realm_is_quiet_just_above_and_fires_just_below(self):
        for realm in ("na", "eu", "asia"):
            floor = doe.thr_realm("crawl_classified_min", realm)
            with self.subTest(realm=realm, floor=floor):
                write_healthy_tree(self.bench, self.now)
                self.set_classified(realm, int(floor) + 1)
                self.assert_quiet()
                self.set_classified(realm, int(floor) - 1)
                self.assert_fires(f"crawl_low_classified:{realm}")

    def test_floors_are_ordered_by_realm_size(self):
        # Guards the calibration itself: eu is the largest realm and asia the
        # smallest, so a floor set from the wrong realm's band is caught here.
        asia = doe.thr_realm("crawl_classified_min", "asia")
        na = doe.thr_realm("crawl_classified_min", "na")
        eu = doe.thr_realm("crawl_classified_min", "eu")
        self.assertLess(asia, na)
        self.assertLess(na, eu)

    def test_per_realm_env_override_wins(self):
        with patch.dict(os.environ,
                        {"OPS_ALERT_CRAWL_CLASSIFIED_MIN_EU": "100000"}):
            self.set_classified("eu", 336000)
            self.assert_quiet()

    def test_unknown_realm_falls_back_to_the_global_floor(self):
        self.assertEqual(doe.thr_realm("crawl_classified_min", "zz"),
                         doe.thr("crawl_classified_min"))

    def test_crawl_yield_collapse_sends(self):
        d = self.bench / "crawl-yield"
        f = sorted(d.glob("*_na.json"))[-1]
        obj = json.loads(f.read_text())
        obj["buckets"]["discovered_active"] = 10
        obj["buckets"]["reactivated"] = 20
        obj["yield_total"] = 30
        obj["buckets"]["still_dormant"] = (
            obj["players_classified"] - 10 - 20
            - obj["buckets"]["discovered_dormant"] - obj["buckets"]["refreshed_active"]
        )
        f.write_text(json.dumps(obj))
        self.assert_fires("crawl_no_yield:na")

    # -- unreadable ------------------------------------------------------
    def test_unreadable_snapshot_sends(self):
        """A corrupt newest file used to vanish silently and read as 'fine'."""
        (self.bench / "observation-floor" / "9999-01-01_0430Z.json").write_text("{ not json")
        self.assert_fires("snapshot_unreadable:observation-floor")

    # -- observation numeric backstops -----------------------------------
    def test_observation_coverage_collapse_sends(self):
        self.rewrite_observation("totals", coverage_ratio_vs_7d=0.05, distinct_productive=10000)
        self.assert_fires("obs_low_coverage")

    def test_observation_per_realm_coverage_collapse_sends(self):
        self.rewrite_observation("asia", coverage_ratio_vs_7d=0.02, distinct_productive=1200)
        self.assert_fires("obs_low_coverage:asia")

    def test_observation_bulk_floor_collapse_sends(self):
        self.rewrite_observation("totals", obs_bulk_floor=900)
        self.assert_fires("obs_low_bulk_floor")

    def test_observation_never_observed_spike_sends(self):
        self.rewrite_observation("totals", never_observed=47601)
        self.assert_fires("obs_high_never_observed")

    def test_stale_wall_alone_is_not_an_alert(self):
        """stale_over_24h is the by-design change-gate non-mover wall.

        Alerting on it alone would cry regression on a healthy day, which is
        precisely what the /observation skill forbids.
        """
        self.rewrite_observation("totals", stale_over_24h=182000)
        self.assertEqual(self.codes(), [])

    def test_stale_wall_with_capture_drop_is_an_alert(self):
        self.rewrite_observation("totals", stale_over_24h=182000, distinct_productive=41000)
        codes = self.assert_fires("obs_stale_wall_with_capture_drop")
        self.assertIn("obs_stale_wall_with_capture_drop", codes)


# --------------------------------------------------------------------------- #
# 3. the LLM never gates, and never silences
# --------------------------------------------------------------------------- #
class LLMBoundaryTests(OpsAlertTestCase):
    def test_alert_path_uses_the_alert_system_prompt(self):
        self.rewrite_recapture("eu", partial=True, scanned=11200)
        _rc, send, llm = self.run_main()
        send.assert_called_once()
        llm.assert_called_once()
        kwargs = llm.call_args.kwargs
        self.assertEqual(kwargs.get("system"), doe.ALERT_SYSTEM_PROMPT)
        payload = llm.call_args.args[2]
        self.assertTrue(payload["tripped_conditions"])

    def test_llm_failure_still_sends_with_a_condition_naming_subject(self):
        """An Anthropic outage must not downgrade an alert into a 'digest'."""
        self.rewrite_recapture("eu", partial=True, scanned=11200)
        environ = dict(BASE_ENV, BENCH_DIR=str(self.bench))
        with mock.patch.dict(os.environ, environ, clear=True), \
             mock.patch.object(doe, "send_email") as send, \
             mock.patch.object(doe, "call_anthropic", side_effect=RuntimeError("api down")), \
             mock.patch.object(sys, "argv", ["daily_ops_email.py"]):
            rc = doe.main()
        self.assertEqual(rc, 0)
        send.assert_called_once()
        subject = send.call_args[0][0]
        self.assertTrue(subject.startswith("[battlestats] ops ALERT"), subject)
        self.assertIn("recapture_partial", subject)
        self.assertIn("TRUNCATED", send.call_args[0][1])

    def test_no_llm_flag_still_sends_the_alert(self):
        self.rewrite_recapture("eu", partial=True, scanned=11200)
        rc, send, llm = self.run_main(argv=["--no-llm"])
        self.assertEqual(rc, 0)
        llm.assert_not_called()
        send.assert_called_once()
        self.assertTrue(send.call_args[0][0].startswith("[battlestats] ops ALERT"))

    def test_subject_is_rewritten_if_the_model_ignores_the_instruction(self):
        self.rewrite_recapture("eu", partial=True, scanned=11200)
        environ = dict(BASE_ENV, BENCH_DIR=str(self.bench))
        with mock.patch.dict(os.environ, environ, clear=True), \
             mock.patch.object(doe, "send_email") as send, \
             mock.patch.object(doe, "call_anthropic") as llm, \
             mock.patch.object(sys, "argv", ["daily_ops_email.py"]):
            llm.return_value = {"subject": "[battlestats] daily ops digest",
                                "html_body": "<html><body>x</body></html>"}
            doe.main()
        self.assertTrue(send.call_args[0][0].startswith("[battlestats] ops ALERT"))


# --------------------------------------------------------------------------- #
# 4. liveness: the kill switch and the heartbeat
# --------------------------------------------------------------------------- #
class LivenessTests(OpsAlertTestCase):
    def test_always_send_kill_switch_restores_the_daily_digest(self):
        rc, send, llm = self.run_main(env={"OPS_EMAIL_ALWAYS_SEND": "1"})
        self.assertEqual(rc, 0)
        send.assert_called_once()
        # digest prompt, not the alert prompt: nothing tripped
        self.assertIsNone(llm.call_args.kwargs.get("system"))

    def test_force_flag_sends_on_a_clear_day(self):
        _rc, send, _llm = self.run_main(argv=["--force"])
        send.assert_called_once()

    def test_heartbeat_sends_on_its_configured_day(self):
        today = doe.DOW_NAMES[doe.utcnow().weekday()]
        _rc, send, _llm = self.run_main(env={"OPS_EMAIL_HEARTBEAT_DOW": today})
        send.assert_called_once()
        self.assertIn("heartbeat", send.call_args[0][0].lower() + send.call_args[0][1].lower())

    def test_heartbeat_is_quiet_on_other_days(self):
        other = doe.DOW_NAMES[(doe.utcnow().weekday() + 3) % 7]
        _rc, send, _llm = self.run_main(env={"OPS_EMAIL_HEARTBEAT_DOW": other})
        send.assert_not_called()

    def test_dry_run_never_sends(self):
        self.rewrite_recapture("eu", partial=True, scanned=11200)
        rc, send, _llm = self.run_main(argv=["--dry-run"])
        self.assertEqual(rc, 0)
        send.assert_not_called()


# --------------------------------------------------------------------------- #
# 5. thresholds are named, deterministic and overridable
# --------------------------------------------------------------------------- #
class ThresholdTests(SimpleTestCase):
    def test_env_override_wins(self):
        with mock.patch.dict(os.environ, {"OPS_ALERT_OBS_MAX_AGE_HOURS": "48"}, clear=True):
            self.assertEqual(doe.thr("obs_max_age_hours"), 48.0)

    def test_unparseable_env_falls_back_to_the_default(self):
        with mock.patch.dict(os.environ, {"OPS_ALERT_OBS_MAX_AGE_HOURS": "soon"}, clear=True):
            self.assertEqual(doe.thr("obs_max_age_hours"),
                             doe.DEFAULT_THRESHOLDS["obs_max_age_hours"])

    def test_every_threshold_referenced_by_evaluate_has_a_default(self):
        """Guards against a typo'd threshold name reaching production as a KeyError."""
        for name in doe.DEFAULT_THRESHOLDS:
            with mock.patch.dict(os.environ, {}, clear=True):
                self.assertIsInstance(doe.thr(name), float)

    def test_evaluate_is_pure_and_deterministic(self):
        data = {"observation": {"available": 0, "unreadable": []},
                "crawl_yield": {"available": 0, "unreadable": []},
                "recapture": {"available": 0, "unreadable": []}}
        first = doe.evaluate(data)
        second = doe.evaluate(data)
        self.assertEqual([c["code"] for c in first], [c["code"] for c in second])
        self.assertEqual(len(first), 3)

    def test_alert_subject_fits_the_header_limit(self):
        conds = [{"code": f"some_quite_long_condition_code:{i}", "detail": "x"} for i in range(12)]
        self.assertLessEqual(len(doe.alert_subject(conds)), 78)
        self.assertTrue(doe.alert_subject(conds).startswith("[battlestats] ops ALERT"))


# --------------------------------------------------------------------------- #
# 6. fail-loud is untouched: exception-only applies to the DIGEST, not to errors
# --------------------------------------------------------------------------- #
class FailLoudTests(SimpleTestCase):
    def test_exception_still_mails_the_failure_notice(self):
        """The one path exception-only mode must never quiet."""
        with mock.patch.dict(os.environ, dict(BASE_ENV), clear=True), \
             mock.patch.object(doe, "send_email") as send, \
             mock.patch.object(doe, "main", side_effect=ZeroDivisionError("boom")), \
             mock.patch.object(sys, "argv", ["daily_ops_email.py"]):
            # mirror the module's __main__ guard
            try:
                raise_rc = doe.main()
            except Exception:
                import traceback
                tb = traceback.format_exc()
                doe.send_email("[battlestats] daily ops email FAILED",
                               "<html><body><pre>" + doe._esc(tb) + "</pre></body></html>", tb)
                raise_rc = 1
        self.assertEqual(raise_rc, 1)
        send.assert_called_once()
        self.assertEqual(send.call_args[0][0], "[battlestats] daily ops email FAILED")
        self.assertIn("ZeroDivisionError", send.call_args[0][1])

    def test_main_guard_source_is_unconditional(self):
        """Structural check on the real __main__ block, not a re-implementation.

        The test above exercises the behaviour with a stub; this one asserts the
        shipped guard still sends without consulting any verdict or kill switch,
        so a future refactor cannot quietly fold the failure mail into the
        exception-only branch.
        """
        src = _SCRIPT.read_text()
        tail = src.split('if __name__ == "__main__":')[1]
        self.assertIn("daily ops email FAILED", tail)
        self.assertIn("send_email(", tail)
        self.assertNotIn("OPS_EMAIL_ALWAYS_SEND", tail)
        self.assertNotIn("evaluate(", tail)


class AnthropicCallShapeTests(SimpleTestCase):
    """The alert write-up call is configured for a short deterministic render."""

    def test_thinking_is_bounded_by_low_effort_not_disabled(self):
        """The budget problem is solved with effort + headroom, not thinking-off.

        max_tokens caps thinking AND response text together, which is what
        produced the original empty-text/stop_reason=max_tokens failure.
        Disabling thinking fixes that but buys a worse bug: with thinking off,
        Opus 5 can leak <thinking> tags into the visible response, and this
        response is parsed as JSON, so a leaked tag breaks the parse outright.
        """
        source = _SCRIPT.read_text().replace("'", '"')
        self.assertIn('"output_config": {"effort": "low"}', source)
        self.assertNotIn('"thinking": {"type": "disabled"}', source)

    def test_a_refusal_is_named_rather_than_surfacing_as_a_parse_error(self):
        """A classifier decline is HTTP 200 with no content, not an exception."""
        source = _SCRIPT.read_text()
        self.assertIn('payload.get("stop_reason") == "refusal"', source)
        self.assertIn("model declined the request", source)
