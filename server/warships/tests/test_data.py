from datetime import datetime, timedelta
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone

from warships.data import update_snapshot_data, fetch_activity_data, fetch_randoms_data
from warships.models import Player, Snapshot


class SnapshotDataTests(TestCase):
    @patch("warships.data._fetch_snapshot_data")
    def test_update_snapshot_data_creates_29_day_snapshots_and_intervals(self, mock_fetch_snapshot_data):
        player = Player.objects.create(name="ActivityUser", player_id=222)

        today = datetime.now().date()
        start_date = today - timedelta(days=28)
        sample_date_1 = (start_date + timedelta(days=5)).strftime("%Y%m%d")
        sample_date_2 = (start_date + timedelta(days=6)).strftime("%Y%m%d")

        def fake_stats(_player_id, dates_param):
            date_set = set(dates_param.split(","))
            data = {}
            if sample_date_1 in date_set:
                data[sample_date_1] = {
                    "battles": 100,
                    "wins": 50,
                    "survived_battles": 10,
                    "battle_type": "pvp",
                }
            if sample_date_2 in date_set:
                data[sample_date_2] = {
                    "battles": 103,
                    "wins": 52,
                    "survived_battles": 11,
                    "battle_type": "pvp",
                }
            return data

        mock_fetch_snapshot_data.side_effect = fake_stats

        update_snapshot_data(player.player_id)

        snapshots = Snapshot.objects.filter(player=player).order_by("date")
        self.assertEqual(snapshots.count(), 29)

        day_1 = snapshots.get(date=start_date + timedelta(days=5))
        day_2 = snapshots.get(date=start_date + timedelta(days=6))

        self.assertEqual(day_1.battles, 100)
        self.assertEqual(day_2.battles, 103)
        self.assertEqual(day_2.interval_battles, 3)
        self.assertEqual(day_2.interval_wins, 2)


class ActivityDataRefreshTests(TestCase):
    @patch("warships.data.update_activity_data")
    @patch("warships.data.update_snapshot_data")
    def test_fetch_activity_data_refreshes_cumulative_spike_cache(
        self,
        mock_update_snapshot_data,
        mock_update_activity_data,
    ):
        player = Player.objects.create(
            name="SpikeUser",
            player_id=333,
            activity_json=[
                {"date": "2026-03-01", "battles": 0, "wins": 0},
                {"date": "2026-03-02", "battles": 6500, "wins": 3000},
            ],
            activity_updated_at=timezone.now(),
        )

        fetch_activity_data(player.player_id)

        mock_update_snapshot_data.assert_called_once_with(player.player_id)
        mock_update_activity_data.assert_called_once_with(player.player_id)


class RandomsDataRefreshTests(TestCase):
    @patch("warships.data.update_randoms_data")
    @patch("warships.data.update_battle_data")
    def test_fetch_randoms_data_refreshes_stale_cache_synchronously(
        self,
        mock_update_battle_data,
        mock_update_randoms_data,
    ):
        player = Player.objects.create(
            name="RandomsUser",
            player_id=444,
            battles_json=[
                {
                    "ship_name": "Old Ship",
                    "ship_type": "Destroyer",
                    "ship_tier": 8,
                    "pvp_battles": 10,
                    "win_ratio": 0.5,
                    "wins": 5,
                }
            ],
            randoms_json=[
                {
                    "ship_name": "Old Ship",
                    "ship_type": "Destroyer",
                    "ship_tier": 8,
                    "pvp_battles": 10,
                    "win_ratio": 0.5,
                    "wins": 5,
                }
            ],
            battles_updated_at=timezone.now() - timedelta(hours=1),
            randoms_updated_at=timezone.now() - timedelta(days=2),
        )

        def write_fresh_rows(player_id):
            p = Player.objects.get(player_id=player_id)
            p.randoms_json = [
                {
                    "ship_name": "Fresh Ship",
                    "ship_type": "Cruiser",
                    "ship_tier": 10,
                    "pvp_battles": 99,
                    "win_ratio": 0.6,
                    "wins": 59,
                }
            ]
            p.randoms_updated_at = timezone.now()
            p.save(update_fields=["randoms_json", "randoms_updated_at"])

        mock_update_randoms_data.side_effect = write_fresh_rows

        rows = fetch_randoms_data(player.player_id)

        self.assertEqual(rows[0]["ship_name"], "Fresh Ship")
        mock_update_battle_data.assert_called_once_with(player.player_id)
        mock_update_randoms_data.assert_called_once_with(player.player_id)
