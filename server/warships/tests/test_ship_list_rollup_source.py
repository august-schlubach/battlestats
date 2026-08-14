"""The inline ship list reads ShipPopDailyAgg instead of re-scanning BattleEvent.

`ShipPopDailyAgg` is a per-(realm, mode, ship, day) rollup of
`PlayerDailyShipStats`, which is itself rebuilt from `BattleEvent`
(`incremental_battles.py`). Per-day sums compose associatively into the window
totals, so swapping the raw window scan for a sum over ~45 tiny rows must be
numerically invisible. That equivalence is what these tests pin, and they pin it
through the REAL pipeline — BattleEvent -> rebuild_daily_ship_stats_for_date ->
PDSS -> rollup_ship_pop_daily -> agg — rather than hand-written agg rows, which
would only prove the test author's arithmetic.

The second load-bearing case is the fallback. The rollup does not raise on a
missing day; it silently sums to less. So an incomplete window must take the raw
scan rather than serve a short window labelled as a full one.
"""

from datetime import timedelta

from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone

from warships.data import (
    SHIP_LEADERBOARD_WINDOW_DAYS,
    _season_window_datetimes,
    compute_realm_ships_by_tier_type,
)
from warships.models import (
    BattleEvent, BattleObservation, Player, Ship, ShipTopPlayerSnapshot,
)

SHIMA = 4282267344       # T10 Destroyer
GEARING = 4282267345     # T10 Destroyer
T9_DD = 3000000001       # T9 Destroyer — off-bucket filler


class ShipListRollupSourceTests(TestCase):
    def setUp(self):
        cache.clear()
        self.player = Player.objects.create(
            name="rollup_bench", player_id=889001, realm="na", pvp_battles=1000)
        Ship.objects.create(ship_id=SHIMA, name="Shimakaze", nation="japan",
                            ship_type="Destroyer", tier=10)
        Ship.objects.create(ship_id=GEARING, name="Gearing", nation="usa",
                            ship_type="Destroyer", tier=10)
        # Off-bucket filler (T9) gives every window day activity without
        # touching the T10 Destroyer bucket's ship set or its total_battles
        # denominator. Production realms always have daily activity; a
        # battle-free realm-day would legitimately read as a coverage gap.
        Ship.objects.create(ship_id=T9_DD, name="Fletcher", nation="usa",
                            ship_type="Destroyer", tier=9)
        self.captured_on = timezone.now().date()
        self.window_start_d = (
            self.captured_on - timedelta(days=SHIP_LEADERBOARD_WINDOW_DAYS))
        self.window_start, self.window_end = _season_window_datetimes(
            self.window_start_d, self.captured_on)
        for ship_id in (SHIMA, GEARING):
            ShipTopPlayerSnapshot.objects.create(
                captured_on=self.captured_on, realm="na", ship_id=ship_id,
                ship_name="x", rank=1, player=self.player,
                win_rate=50.0, battles=1)

    def _event(self, ship_id, battles, wins, *, damage=0, frags=0, day_offset=1):
        detected_at = self.window_start + timedelta(days=day_offset, hours=3)
        obs_a = BattleObservation.objects.create(player=self.player, pvp_battles=1)
        obs_b = BattleObservation.objects.create(player=self.player, pvp_battles=2)
        ev = BattleEvent.objects.create(
            player=self.player, ship_id=ship_id, ship_name="x", mode="random",
            battles_delta=battles, wins_delta=wins, losses_delta=battles - wins,
            frags_delta=frags, damage_delta=damage,
            from_observation=obs_a, to_observation=obs_b)
        BattleEvent.objects.filter(pk=ev.pk).update(detected_at=detected_at)
        return ev

    def _seed_spread_events(self):
        """Two ships' battles spread across several window days, plus one filler
        battle on EVERY window day so the rollup can cover the whole span."""
        for offset in range(SHIP_LEADERBOARD_WINDOW_DAYS):
            self._event(T9_DD, 1, 1, damage=10, day_offset=offset)
        # Shima: 100 battles / 60 wins across 3 days.
        self._event(SHIMA, 40, 25, damage=4000, frags=8, day_offset=2)
        self._event(SHIMA, 35, 20, damage=3500, frags=7, day_offset=9)
        self._event(SHIMA, 25, 15, damage=2500, frags=5, day_offset=20)
        # Gearing: 80 battles / 32 wins across 2 days.
        self._event(GEARING, 50, 20, damage=5000, frags=10, day_offset=4)
        self._event(GEARING, 30, 12, damage=3000, frags=6, day_offset=17)

    def _build_rollup(self, skip_date=None):
        """Run the real PDSS rebuild + daily rollup for every window date."""
        from warships.data import rollup_ship_pop_daily
        from warships.incremental_battles import (
            rebuild_daily_ship_stats_for_date)
        for offset in range(SHIP_LEADERBOARD_WINDOW_DAYS):
            day = self.window_start_d + timedelta(days=offset)
            if skip_date is not None and day == skip_date:
                continue
            rebuild_daily_ship_stats_for_date(day)
            rollup_ship_pop_daily("na", day)

    def _compute(self):
        cache.clear()
        return compute_realm_ships_by_tier_type(
            "na", 10, "Destroyer", use_cache=False)

    def _covers(self):
        from warships.data import ship_pop_rollup_covers_window
        return ship_pop_rollup_covers_window(
            "na", "random", self.window_start_d, self.captured_on)

    def test_rollup_path_matches_the_battleevent_scan_exactly(self):
        """The load-bearing equivalence: identical payload from either source."""
        self._seed_spread_events()

        # Source A — no rollup rows yet, so the raw BattleEvent scan runs.
        self.assertFalse(self._covers())
        from_events = self._compute()

        # Source B — the same facts, now via PDSS -> ShipPopDailyAgg.
        self._build_rollup()
        self.assertTrue(self._covers())
        from_rollup = self._compute()

        self.assertEqual(from_rollup["ships"], from_events["ships"])
        self.assertEqual(from_rollup["total_battles"],
                         from_events["total_battles"])
        # Guard against both paths being trivially empty.
        self.assertEqual(len(from_events["ships"]), 2)
        by_id = {s["ship_id"]: s for s in from_rollup["ships"]}
        self.assertEqual(by_id[SHIMA]["battles"], 100)
        self.assertEqual(by_id[SHIMA]["win_rate"], 60.0)
        self.assertEqual(by_id[GEARING]["battles"], 80)
        self.assertEqual(by_id[GEARING]["win_rate"], 40.0)
        # Ranked by win rate: Shima (60%) above Gearing (40%).
        self.assertEqual([s["ship_id"] for s in from_rollup["ships"]],
                         [SHIMA, GEARING])

    def test_one_missing_window_day_forces_the_raw_scan(self):
        """A gap must fall back, not silently sum a shorter window."""
        self._seed_spread_events()
        expected = self._compute()          # raw scan, no rollup yet

        gap = self.window_start_d + timedelta(days=9)   # a day Shima played
        self._build_rollup(skip_date=gap)
        self.assertFalse(
            self._covers(),
            "a missing interior day must not count as covered")

        # Falls back, so the numbers stay whole: the 35 battles on the skipped
        # day are still counted. Summing the incomplete rollup would have
        # reported 65 battles for Shima instead of 100, with nothing raised.
        got = self._compute()
        self.assertEqual(got["ships"], expected["ships"])
        by_id = {s["ship_id"]: s for s in got["ships"]}
        self.assertEqual(by_id[SHIMA]["battles"], 100)

    def test_rollup_span_covers_the_leaderboard_window(self):
        """Gap repair only reaches inside the catch-up span, so the span must
        cover the widest consumer, not the 30d ship-combat window it was
        originally built for."""
        from warships.data import (SHIP_COMBAT_WINDOW_DAYS,
                                   SHIP_POP_ROLLUP_WINDOW_DAYS)
        self.assertGreaterEqual(
            SHIP_POP_ROLLUP_WINDOW_DAYS, SHIP_LEADERBOARD_WINDOW_DAYS,
            "the ship list would sum unrepairable missing days")
        self.assertGreaterEqual(
            SHIP_POP_ROLLUP_WINDOW_DAYS, SHIP_COMBAT_WINDOW_DAYS)

    def test_retention_clears_the_widest_window_with_margin(self):
        """A rolled day pruned before the window ends can never be repaired.
        Pins the 45 -> 60 -> 90 roadmap: retention must outrun the window."""
        from warships.data import (SHIP_POP_ROLLUP_RETENTION_DAYS,
                                   SHIP_POP_ROLLUP_RETENTION_MARGIN_DAYS,
                                   SHIP_POP_ROLLUP_WINDOW_DAYS)
        self.assertGreaterEqual(
            SHIP_POP_ROLLUP_RETENTION_DAYS,
            SHIP_POP_ROLLUP_WINDOW_DAYS + SHIP_POP_ROLLUP_RETENTION_MARGIN_DAYS)

    def test_catchup_default_uses_the_widest_window(self):
        """`rollup_ship_pop_daily_catchup()` with no argument must span the
        leaderboard window; its old default was the 30d ship-combat one."""
        from unittest import mock
        from warships import data as D
        with mock.patch.object(D, "rollup_ship_pop_daily",
                               return_value=0) as rolled:
            D.rollup_ship_pop_daily_catchup("na")
        days = {c.args[1] for c in rolled.call_args_list}
        today = timezone.now().date()
        self.assertIn(today - timedelta(days=D.SHIP_POP_ROLLUP_WINDOW_DAYS), days)
        self.assertGreaterEqual(len(days), SHIP_LEADERBOARD_WINDOW_DAYS)
