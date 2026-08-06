"""Tests for the lapsed-player recapture sweep.

Command: ``recapture_lapsed_players`` (+ ``recapture_lapsed_players_task``).
See agents/runbooks/runbook-recapture-lapsed-players-2026-06-26.md.
"""
import os
from datetime import timedelta
from io import StringIO
from unittest.mock import patch

from celery.exceptions import SoftTimeLimitExceeded
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from warships.models import Player


def _info(pid, days_ago, hidden=False):
    """A WG account/info row whose last_battle_time is `days_ago` days back."""
    if hidden:
        return {"account_id": pid, "nickname": f"P{pid}", "hidden_profile": True}
    ts = int((timezone.now() - timedelta(days=days_ago)).timestamp())
    return {"account_id": pid, "nickname": f"P{pid}", "last_battle_time": ts}


class RecaptureLapsedPlayersTests(TestCase):
    def _mk(self, pid, days_idle, **kw):
        """Create a player whose stored last battle is `days_idle` days ago."""
        lbd = timezone.now().date() - timedelta(days=days_idle)
        d = dict(
            realm="na", is_hidden=False, pvp_battles=1000, pvp_wins=550,
            last_battle_date=lbd, days_since_last_battle=days_idle,
            last_fetch=timezone.now() - timedelta(days=50),
            last_idle_check_at=None,
        )
        d.update(kw)
        return Player.objects.create(name=f"P{pid}", player_id=pid, **d)

    def _run(self, side, **extra):
        with patch("warships.api.players._bulk_fetch_account_info",
                   side_effect=side) as m:
            call_command("recapture_lapsed_players", "--realm", "na",
                         "--delay", "0", stdout=StringIO(), **extra)
        return m

    def test_detect_only_makes_no_writes(self):
        p = self._mk(7001, days_idle=100)
        # WG says they played yesterday — a returner — but detect-only writes nothing.
        self._run(lambda ids, realm: ({str(i): _info(i, 1) for i in ids}, None))
        p.refresh_from_db()
        self.assertEqual(p.last_battle_date,
                         timezone.now().date() - timedelta(days=100))
        self.assertIsNone(p.last_idle_check_at)

    def test_apply_promotes_returner_into_floor_scope(self):
        p = self._mk(7002, days_idle=120)
        before_fetch = p.last_fetch
        self._run(lambda ids, realm: ({str(i): _info(i, 1) for i in ids}, None),
                  apply=True)
        p.refresh_from_db()
        # last_battle_date advanced to ~yesterday -> back inside active_7d.
        self.assertEqual(p.last_battle_date,
                         timezone.now().date() - timedelta(days=1))
        self.assertEqual(p.days_since_last_battle, 1)
        # cursor stamped; last_fetch NOT bumped (floor refresh stays armed).
        self.assertIsNotNone(p.last_idle_check_at)
        self.assertEqual(p.last_fetch, before_fetch)

    def test_apply_stamps_cursor_but_does_not_promote_still_dormant(self):
        p = self._mk(7003, days_idle=100)
        # WG reports the SAME old battle -> not a returner.
        self._run(lambda ids, realm: ({str(i): _info(i, 100) for i in ids}, None),
                  apply=True)
        p.refresh_from_db()
        self.assertEqual(p.last_battle_date,
                         timezone.now().date() - timedelta(days=100))
        # still checked -> cursor advances so we rotate past them next run.
        self.assertIsNotNone(p.last_idle_check_at)

    def test_band_excludes_active_and_deep_tail(self):
        active = self._mk(7004, days_idle=3)     # inside active_7d
        deep = self._mk(7005, days_idle=400)     # past the 365d default ceiling
        lapsed = self._mk(7006, days_idle=50)    # in band
        seen = {}

        def side(ids, realm):
            seen["ids"] = list(ids)
            return ({str(i): _info(i, 1) for i in ids}, None)

        self._run(side, apply=True)
        self.assertEqual(seen["ids"], [lapsed.player_id])
        for p in (active, deep):
            p.refresh_from_db()
            self.assertIsNone(p.last_idle_check_at)

    def test_emits_structured_summary_line(self):
        # The /recapture readout skill greps this line out of the worker journal.
        self._mk(7009, days_idle=100)
        with self.assertLogs(
                "warships.management.commands.recapture_lapsed_players",
                level="INFO") as cm:
            self._run(lambda ids, realm: ({str(i): _info(i, 1) for i in ids}, None),
                      apply=True)
        line = next(m for m in cm.output if "recapture-summary" in m)
        self.assertIn("realm=na", line)
        self.assertIn("mode=apply", line)
        self.assertIn("advanced=1", line)
        self.assertIn("into7d=1", line)

    def test_writes_yield_snapshot_file(self):
        # The /recapture skill reads these per-run JSON snapshots.
        import json
        import tempfile
        self._mk(7010, days_idle=100)
        with tempfile.TemporaryDirectory() as d:
            with patch(
                "warships.management.commands.recapture_lapsed_players."
                "RECAPTURE_BENCHMARK_DIR", d):
                self._run(
                    lambda ids, realm: ({str(i): _info(i, 1) for i in ids}, None),
                    apply=True)
            files = os.listdir(d)
            self.assertEqual(len(files), 1)
            self.assertTrue(files[0].endswith("_na.json"))
            with open(os.path.join(d, files[0])) as fh:
                snap = json.load(fh)
        self.assertEqual(snap["mode"], "apply")
        self.assertEqual(snap["advanced"], 1)
        self.assertEqual(snap["into7d"], 1)
        self.assertEqual(snap["cursor_stamped"], 1)

    def test_lru_cursor_orders_never_checked_first(self):
        recent = self._mk(7007, days_idle=60,
                          last_idle_check_at=timezone.now())
        fresh = self._mk(7008, days_idle=60, last_idle_check_at=None)
        seen = {}

        def side(ids, realm):
            seen.setdefault("ids", []).extend(ids)
            return ({str(i): _info(i, 60) for i in ids}, None)

        # Only room for one this run -> the never-checked row must win.
        self._run(side, apply=True, limit=1)
        self.assertEqual(seen["ids"], [fresh.player_id])
        recent.refresh_from_db()
        # the recently-checked row keeps its old (now-ish) cursor, untouched here.
        self.assertEqual(seen["ids"].count(recent.player_id), 0)


class RecaptureSoftTimeLimitTests(TestCase):
    """A truncated pass must keep what it earned.

    Until 2026-08-06 every write sat past the end of the scan, so a run that blew
    the worker's soft time limit lost the whole pass — WG calls spent, no promotes,
    no cursor advance, no snapshot. EU and ASIA hit that daily (ASIA's last complete
    pass was 2026-07-20) and the /recapture readout simply went stale.
    """

    def _mk_band(self, n, start_pid=7100):
        """`n` in-band players, all never-checked, distinct idle depths."""
        made = []
        for i in range(n):
            days = 20 + i
            made.append(Player.objects.create(
                name=f"T{start_pid + i}", player_id=start_pid + i, realm="na",
                is_hidden=False, pvp_battles=1000, pvp_wins=550,
                last_battle_date=timezone.now().date() - timedelta(days=days),
                days_since_last_battle=days,
                last_fetch=timezone.now() - timedelta(days=50),
                last_idle_check_at=None,
            ))
        return made

    def _run_interrupted(self, tmpdir, batch=10, fail_on_call=3, limit=0):
        """Run with the soft limit landing at the start of `fail_on_call`."""
        seen, calls = [], {"n": 0}

        def side(ids, realm):
            calls["n"] += 1
            if calls["n"] >= fail_on_call:
                raise SoftTimeLimitExceeded()
            seen.extend(ids)
            return ({str(i): _info(i, 1) for i in ids}, None)

        with patch("warships.api.players._bulk_fetch_account_info", side_effect=side):
            with patch(
                "warships.management.commands.recapture_lapsed_players."
                "RECAPTURE_BENCHMARK_DIR", tmpdir
            ):
                outcome = call_command(
                    "recapture_lapsed_players", "--realm", "na", "--delay", "0",
                    "--batch-size", str(batch), "--limit", str(limit),
                    apply=True, stdout=StringIO())
        return seen, outcome

    def test_truncated_run_persists_completed_batches(self):
        import tempfile
        self._mk_band(30)
        with tempfile.TemporaryDirectory() as d:
            seen, outcome = self._run_interrupted(d)
            snap = _read_snapshot(d)

        # Two batches completed before the limit landed; both are durable.
        self.assertEqual(len(seen), 20)
        for pid in seen:
            p = Player.objects.get(player_id=pid, realm="na")
            self.assertEqual(p.last_battle_date,
                             timezone.now().date() - timedelta(days=1),
                             "a checked returner must be promoted")
            self.assertIsNotNone(p.last_idle_check_at)
        # The interrupted batch was never answered — neither promoted nor rotated
        # past. Stamping it would hide those rows for a whole LRU cycle.
        untouched = Player.objects.filter(
            realm="na", last_idle_check_at__isnull=True)
        self.assertEqual(untouched.count(), 10)

        self.assertEqual(outcome, "partial")
        self.assertTrue(snap["partial"])
        self.assertEqual(snap["scanned"], 20)
        self.assertEqual(snap["candidates"], 30)
        self.assertEqual(snap["advanced"], 20)
        self.assertEqual(snap["cursor_stamped"], 20)

    def test_complete_run_is_not_partial(self):
        import tempfile
        self._mk_band(20)
        with tempfile.TemporaryDirectory() as d:
            # fail_on_call past the end -> the scan finishes normally.
            seen, outcome = self._run_interrupted(d, fail_on_call=99)
            snap = _read_snapshot(d)
        self.assertEqual(len(seen), 20)
        self.assertIsNone(outcome)
        self.assertFalse(snap["partial"])
        self.assertEqual(snap["scanned"], snap["candidates"])

    def test_advanced_accumulates_across_flushes_without_double_counting(self):
        """`advanced` is the headline number in the daily mail.

        It used to be `len(promote)` read once at the end; it now sums across
        flushes, so a failed chunk between two good ones is the case to pin.
        """
        import tempfile
        self._mk_band(30)
        calls = {"n": 0}

        def side(ids, realm):
            calls["n"] += 1
            if calls["n"] == 2:                       # middle chunk fails
                return (None, "REQUEST_LIMIT_EXCEEDED")
            return ({str(i): _info(i, 1) for i in ids}, None)

        with tempfile.TemporaryDirectory() as d:
            with patch("warships.api.players._bulk_fetch_account_info",
                       side_effect=side):
                with patch("warships.management.commands."
                           "recapture_lapsed_players.RECAPTURE_BENCHMARK_DIR", d):
                    call_command("recapture_lapsed_players", "--realm", "na",
                                 "--delay", "0", "--batch-size", "10",
                                 apply=True, stdout=StringIO(), stderr=StringIO())
            snap = _read_snapshot(d)
        self.assertEqual(snap["advanced"], 20, "the failed chunk must not count")
        self.assertEqual(snap["cursor_stamped"], 20)
        self.assertEqual(snap["chunk_errors"], 1)
        self.assertFalse(snap["partial"])
        # The failed chunk's rows keep a NULL cursor -> retried next run.
        self.assertEqual(
            Player.objects.filter(realm="na",
                                  last_idle_check_at__isnull=True).count(), 10)

    def test_incremental_flush_lands_before_the_end_of_the_scan(self):
        """Writes must not all sit past the scan — that was the original defect."""
        import tempfile
        self._mk_band(30)
        with tempfile.TemporaryDirectory() as d:
            # Flush every 10 checked rows -> batches 1 and 2 each flush in-loop.
            with patch("warships.management.commands.recapture_lapsed_players."
                       "CURSOR_STAMP_CHUNK", 10):
                seen, _ = self._run_interrupted(d)
            snap = _read_snapshot(d)
        self.assertEqual(snap["cursor_stamped"], 20)
        self.assertEqual(
            Player.objects.filter(realm="na",
                                  last_idle_check_at__isnull=False).count(), 20)


def _read_snapshot(d):
    import json
    files = os.listdir(d)
    assert len(files) == 1, files
    with open(os.path.join(d, files[0])) as fh:
        return json.load(fh)


class RecaptureLapsedTaskGateTests(TestCase):
    def test_task_skips_when_disabled(self):
        from warships.tasks import recapture_lapsed_players_task
        with patch.dict("os.environ", {"RECAPTURE_LAPSED_ENABLED": "0"}):
            res = recapture_lapsed_players_task.run(realm="na")
        self.assertEqual(res, {"status": "skipped", "reason": "disabled"})

    def test_task_reports_partial_when_the_command_truncated(self):
        from warships.tasks import recapture_lapsed_players_task
        with patch.dict("os.environ", {"RECAPTURE_LAPSED_ENABLED": "1"}):
            with patch("warships.tasks.call_command", return_value="partial"):
                res = recapture_lapsed_players_task.run(realm="na")
        self.assertEqual(res, {"status": "partial"})

    def test_task_reports_completed_on_a_full_pass(self):
        from warships.tasks import recapture_lapsed_players_task
        with patch.dict("os.environ", {"RECAPTURE_LAPSED_ENABLED": "1"}):
            with patch("warships.tasks.call_command", return_value=None):
                res = recapture_lapsed_players_task.run(realm="na")
        self.assertEqual(res, {"status": "completed"})

    def test_task_budget_clears_a_full_prod_sized_pass(self):
        """540s (TASK_OPTS) truncated EU/ASIA daily; the sweep needs its own budget."""
        from warships.tasks import (PLAYER_REFRESH_LOCK_TIMEOUT,
                                    RECAPTURE_TASK_OPTS)
        soft = RECAPTURE_TASK_OPTS["soft_time_limit"]
        hard = RECAPTURE_TASK_OPTS["time_limit"]
        self.assertGreater(soft, 540)
        # Invariant: soft < hard <= lock TTL, with room for the final flush.
        self.assertLess(soft, hard)
        self.assertLessEqual(hard, PLAYER_REFRESH_LOCK_TIMEOUT)
