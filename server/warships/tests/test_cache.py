from unittest.mock import patch

from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone

from warships.models import Player, Clan, Ship


LOCMEM_CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
        'TIMEOUT': 60,
    }
}


@override_settings(CACHES=LOCMEM_CACHES)
class LandingPlayersCacheTests(TestCase):
    def setUp(self):
        cache.clear()

    def tearDown(self):
        cache.clear()

    def test_landing_players_cache_miss_then_hit(self):
        Player.objects.create(
            name="CachePlayer", player_id=1001,
            last_battle_date=timezone.now().date(),
        )

        # First request: cache miss → hits DB
        resp1 = self.client.get("/api/landing/players/")
        self.assertEqual(resp1.status_code, 200)
        self.assertEqual(len(resp1.json()), 1)

        # Add another player — but cache should still return stale data
        Player.objects.create(
            name="NewPlayer", player_id=1002,
            last_battle_date=timezone.now().date(),
        )

        resp2 = self.client.get("/api/landing/players/")
        self.assertEqual(resp2.status_code, 200)
        # Still 1 because the cached result is served
        self.assertEqual(len(resp2.json()), 1)

    def test_landing_players_cache_clear_returns_fresh_data(self):
        Player.objects.create(
            name="CachePlayer", player_id=1001,
            last_battle_date=timezone.now().date(),
        )
        self.client.get("/api/landing/players/")

        Player.objects.create(
            name="NewPlayer", player_id=1002,
            last_battle_date=timezone.now().date(),
        )
        cache.clear()

        resp = self.client.get("/api/landing/players/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.json()), 2)


@override_settings(CACHES=LOCMEM_CACHES)
class LandingClansCacheTests(TestCase):
    def setUp(self):
        cache.clear()

    def tearDown(self):
        cache.clear()

    def test_landing_clans_cache_miss_then_hit(self):
        Clan.objects.create(clan_id=100, name="TestClan",
                            tag="TC", members_count=5)

        resp1 = self.client.get("/api/landing/clans/")
        self.assertEqual(resp1.status_code, 200)
        self.assertEqual(len(resp1.json()), 1)

        Clan.objects.create(clan_id=101, name="AnotherClan",
                            tag="AC", members_count=3)

        resp2 = self.client.get("/api/landing/clans/")
        self.assertEqual(resp2.status_code, 200)
        self.assertEqual(len(resp2.json()), 1)  # cached

    def test_landing_clans_cache_clear_returns_fresh_data(self):
        Clan.objects.create(clan_id=100, name="TestClan",
                            tag="TC", members_count=5)
        self.client.get("/api/landing/clans/")

        Clan.objects.create(clan_id=101, name="AnotherClan",
                            tag="AC", members_count=3)
        cache.clear()

        resp = self.client.get("/api/landing/clans/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.json()), 2)


@override_settings(CACHES=LOCMEM_CACHES)
class ShipInfoCacheTests(TestCase):
    def setUp(self):
        cache.clear()

    def tearDown(self):
        cache.clear()

    def test_ship_info_cached_after_first_lookup(self):
        from warships.api.ships import _fetch_ship_info

        Ship.objects.create(
            ship_id=12345, name="Shimakaze", nation="japan",
            ship_type="Destroyer", tier=10,
        )

        ship1 = _fetch_ship_info("12345")
        self.assertIsNotNone(ship1)
        self.assertEqual(ship1.name, "Shimakaze")

        # Verify it's cached
        cached = cache.get("ship:12345")
        self.assertIsNotNone(cached)
        self.assertEqual(cached.name, "Shimakaze")

        # Second call should return cached value (no DB needed)
        ship2 = _fetch_ship_info("12345")
        self.assertEqual(ship2.name, "Shimakaze")

    def test_ship_info_cache_miss_fetches_from_db(self):
        from warships.api.ships import _fetch_ship_info

        Ship.objects.create(
            ship_id=67890, name="Yamato", nation="japan",
            ship_type="Battleship", tier=10,
        )

        # No cache entry yet
        self.assertIsNone(cache.get("ship:67890"))

        ship = _fetch_ship_info("67890")
        self.assertIsNotNone(ship)
        self.assertEqual(ship.name, "Yamato")

        # Now it should be cached
        self.assertIsNotNone(cache.get("ship:67890"))

    def test_ship_info_invalid_id_returns_none(self):
        from warships.api.ships import _fetch_ship_info

        result = _fetch_ship_info("not_a_number")
        self.assertIsNone(result)

        result = _fetch_ship_info("-1")
        self.assertIsNone(result)


@override_settings(CACHES=LOCMEM_CACHES)
class RankedSeasonsMetadataCacheTests(TestCase):
    def setUp(self):
        cache.clear()

    def tearDown(self):
        cache.clear()

    @patch("warships.data._get_ranked_seasons_metadata.__wrapped__" if hasattr(
        __import__('warships.data', fromlist=[
                   '_get_ranked_seasons_metadata'])._get_ranked_seasons_metadata, '__wrapped__'
    ) else "warships.api.players._fetch_ranked_seasons_info")
    def test_ranked_seasons_cached_after_first_call(self, mock_fetch):
        from warships.data import _get_ranked_seasons_metadata, RANKED_SEASONS_CACHE_KEY

        mock_fetch.return_value = {
            "1024": {
                "season_name": "Season 24",
                "start_at": 1700000000,
                "close_at": 1703000000,
            }
        }

        result1 = _get_ranked_seasons_metadata()
        self.assertIn(1024, result1)
        self.assertEqual(result1[1024]["label"], "S24")
        mock_fetch.assert_called_once()

        # Second call should use cache — mock should not be called again
        mock_fetch.reset_mock()
        result2 = _get_ranked_seasons_metadata()
        self.assertEqual(result2[1024]["label"], "S24")
        mock_fetch.assert_not_called()

    @patch("warships.api.players._fetch_ranked_seasons_info")
    def test_ranked_seasons_cache_clear_refetches(self, mock_fetch):
        from warships.data import _get_ranked_seasons_metadata

        mock_fetch.return_value = {
            "1024": {
                "season_name": "Season 24",
                "start_at": 1700000000,
                "close_at": 1703000000,
            }
        }

        _get_ranked_seasons_metadata()
        cache.clear()

        mock_fetch.return_value = {
            "1025": {
                "season_name": "Season 25",
                "start_at": 1706000000,
                "close_at": 1709000000,
            }
        }

        result = _get_ranked_seasons_metadata()
        self.assertIn(1025, result)
        self.assertNotIn(1024, result)

    @patch("warships.api.players._fetch_ranked_seasons_info")
    def test_ranked_seasons_empty_response_not_cached(self, mock_fetch):
        from warships.data import _get_ranked_seasons_metadata, RANKED_SEASONS_CACHE_KEY

        mock_fetch.return_value = None

        result = _get_ranked_seasons_metadata()
        self.assertEqual(result, {})
        self.assertIsNone(cache.get(RANKED_SEASONS_CACHE_KEY))
