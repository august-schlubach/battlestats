from unittest.mock import patch

from django.core.cache import cache
from django.test import TestCase

from warships.landing import LANDING_CLAN_CACHE_TTL, LANDING_CLANS_CACHE_KEY, LANDING_PLAYER_CACHE_TTL, LANDING_PLAYER_LIMIT, LANDING_RECENT_CLANS_CACHE_KEY, LANDING_RECENT_PLAYERS_CACHE_KEY, get_landing_clans_payload, get_landing_clans_payload_with_cache_metadata, get_landing_players_payload, get_landing_players_payload_with_cache_metadata, invalidate_landing_clan_caches, invalidate_landing_player_caches, landing_player_cache_key, normalize_landing_player_limit, normalize_landing_player_mode


class LandingHelperTests(TestCase):
    def setUp(self):
        cache.clear()

    def test_normalize_landing_player_mode_accepts_known_modes(self):
        self.assertEqual(normalize_landing_player_mode('random'), 'random')
        self.assertEqual(normalize_landing_player_mode(' BEST '), 'best')
        self.assertEqual(normalize_landing_player_mode(None), 'random')

    def test_normalize_landing_player_mode_rejects_unknown_mode(self):
        with self.assertRaises(ValueError):
            normalize_landing_player_mode('hot')

    def test_normalize_landing_player_limit_clamps_requested_values(self):
        self.assertEqual(normalize_landing_player_limit(
            None), LANDING_PLAYER_LIMIT)
        self.assertEqual(normalize_landing_player_limit('5'), 5)
        self.assertEqual(normalize_landing_player_limit('0'), 1)
        self.assertEqual(normalize_landing_player_limit(
            '999'), LANDING_PLAYER_LIMIT)
        self.assertEqual(normalize_landing_player_limit(
            'not-a-number'), LANDING_PLAYER_LIMIT)

    def test_invalidate_landing_clan_caches_clears_current_keys(self):
        cache.set(LANDING_CLANS_CACHE_KEY, ['current'], 60)
        cache.set(LANDING_RECENT_CLANS_CACHE_KEY, ['recent'], 60)

        invalidate_landing_clan_caches()

        self.assertIsNone(cache.get(LANDING_CLANS_CACHE_KEY))
        self.assertIsNone(cache.get(LANDING_RECENT_CLANS_CACHE_KEY))

    def test_invalidate_landing_player_caches_bumps_namespace_and_clears_recent_key(self):
        original_random_key = landing_player_cache_key('random', 40)
        original_best_key = landing_player_cache_key('best', 40)
        cache.set(original_random_key, ['random'], 60)
        cache.set(original_best_key, ['best'], 60)
        cache.set(LANDING_RECENT_PLAYERS_CACHE_KEY, ['recent'], 60)

        invalidate_landing_player_caches(include_recent=True)

        refreshed_random_key = landing_player_cache_key('random', 40)
        refreshed_best_key = landing_player_cache_key('best', 40)

        self.assertNotEqual(original_random_key, refreshed_random_key)
        self.assertNotEqual(original_best_key, refreshed_best_key)
        self.assertEqual(cache.get(original_random_key), ['random'])
        self.assertEqual(cache.get(original_best_key), ['best'])
        self.assertIsNone(cache.get(refreshed_random_key))
        self.assertIsNone(cache.get(refreshed_best_key))
        self.assertIsNone(cache.get(LANDING_RECENT_PLAYERS_CACHE_KEY))

    def test_landing_clans_use_one_hour_cache_ttl(self):
        _, metadata = get_landing_clans_payload_with_cache_metadata()
        self.assertEqual(metadata['ttl_seconds'], LANDING_CLAN_CACHE_TTL)

    def test_all_landing_player_modes_use_one_hour_cache_ttl(self):
        _, random_meta = get_landing_players_payload_with_cache_metadata(
            'random', 40)
        self.assertEqual(random_meta['ttl_seconds'], LANDING_PLAYER_CACHE_TTL)

        _, best_meta = get_landing_players_payload_with_cache_metadata(
            'best', 40)
        self.assertEqual(best_meta['ttl_seconds'], LANDING_PLAYER_CACHE_TTL)

        _, sigma_meta = get_landing_players_payload_with_cache_metadata(
            'sigma', 40)
        self.assertEqual(sigma_meta['ttl_seconds'], LANDING_PLAYER_CACHE_TTL)
