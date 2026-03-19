from unittest.mock import patch

from django.core.cache import cache
from django.test import TestCase

from warships.landing import LANDING_CLAN_CACHE_TTL, LANDING_CLANS_BEST_CACHE_KEY, LANDING_CLANS_BEST_CACHE_METADATA_KEY, LANDING_CLANS_CACHE_KEY, LANDING_CLANS_CACHE_METADATA_KEY, LANDING_PLAYER_CACHE_TTL, LANDING_PLAYER_LIMIT, LANDING_RANDOM_CLAN_QUEUE_KEY, LANDING_RANDOM_PLAYER_QUEUE_KEY, LANDING_RECENT_CLANS_CACHE_KEY, LANDING_RECENT_PLAYERS_CACHE_KEY, get_landing_best_clans_payload_with_cache_metadata, get_landing_clans_payload, get_landing_clans_payload_with_cache_metadata, get_landing_players_payload, get_landing_players_payload_with_cache_metadata, get_random_landing_clan_queue_payload, get_random_landing_player_queue_payload, invalidate_landing_clan_caches, invalidate_landing_player_caches, landing_player_cache_key, normalize_landing_clan_mode, normalize_landing_player_limit, normalize_landing_player_mode, refill_random_landing_clan_queue, refill_random_landing_player_queue


class LandingHelperTests(TestCase):
    def setUp(self):
        cache.clear()

    def test_normalize_landing_player_mode_accepts_known_modes(self):
        self.assertEqual(normalize_landing_player_mode('random'), 'random')
        self.assertEqual(normalize_landing_player_mode(' BEST '), 'best')
        self.assertEqual(normalize_landing_player_mode(' sigma '), 'sigma')
        self.assertEqual(normalize_landing_player_mode(None), 'random')

    def test_normalize_landing_player_mode_rejects_unknown_mode(self):
        with self.assertRaisesMessage(ValueError, 'mode must be one of: random, best, sigma'):
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
        cache.set(LANDING_CLANS_CACHE_METADATA_KEY, {'ttl_seconds': 60}, 60)
        cache.set(LANDING_CLANS_BEST_CACHE_KEY, ['best'], 60)
        cache.set(LANDING_CLANS_BEST_CACHE_METADATA_KEY,
                  {'ttl_seconds': 60}, 60)
        cache.set(LANDING_RECENT_CLANS_CACHE_KEY, ['recent'], 60)

        invalidate_landing_clan_caches()

        self.assertIsNone(cache.get(LANDING_CLANS_CACHE_KEY))
        self.assertIsNone(cache.get(LANDING_CLANS_CACHE_METADATA_KEY))
        self.assertIsNone(cache.get(LANDING_CLANS_BEST_CACHE_KEY))
        self.assertIsNone(cache.get(LANDING_CLANS_BEST_CACHE_METADATA_KEY))
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

    def test_invalidate_landing_player_caches_preserves_recent_key_by_default(self):
        original_random_key = landing_player_cache_key('random', 40)
        cache.set(original_random_key, ['random'], 60)
        cache.set(LANDING_RECENT_PLAYERS_CACHE_KEY, ['recent'], 60)

        invalidate_landing_player_caches()

        refreshed_random_key = landing_player_cache_key('random', 40)
        self.assertNotEqual(original_random_key, refreshed_random_key)
        self.assertEqual(cache.get(original_random_key), ['random'])
        self.assertEqual(
            cache.get(LANDING_RECENT_PLAYERS_CACHE_KEY), ['recent'])

    def test_landing_clans_use_one_hour_cache_ttl(self):
        _, metadata = get_landing_clans_payload_with_cache_metadata()
        self.assertEqual(metadata['ttl_seconds'], LANDING_CLAN_CACHE_TTL)

    def test_all_landing_player_modes_use_one_hour_cache_ttl(self):
        _, best_meta = get_landing_players_payload_with_cache_metadata(
            'best', 40)
        self.assertEqual(best_meta['ttl_seconds'], LANDING_PLAYER_CACHE_TTL)

        _, sigma_meta = get_landing_players_payload_with_cache_metadata(
            'sigma', 40)
        self.assertEqual(sigma_meta['ttl_seconds'], LANDING_PLAYER_CACHE_TTL)

    def test_random_landing_player_queue_payload_uses_zero_ttl_metadata(self):
        with patch('warships.landing.peek_random_landing_player_ids', return_value=([11, 12], 55)), patch('warships.landing.resolve_landing_players_by_id_order', return_value=[{'name': 'Player A'}, {'name': 'Player B'}]), patch('warships.tasks.queue_random_landing_player_queue_refill', return_value={'status': 'queued'}):
            payload, metadata = get_random_landing_player_queue_payload(
                40,
                pop=False,
                schedule_refill=True,
            )

        self.assertEqual(payload, [{'name': 'Player A'}, {'name': 'Player B'}])
        self.assertEqual(metadata['ttl_seconds'], 0)
        self.assertEqual(metadata['queue_remaining'], 55)
        self.assertEqual(metadata['served_count'], 2)
        self.assertTrue(metadata['refill_scheduled'])

    def test_landing_clan_metadata_is_rebuilt_when_payload_exists_without_metadata(self):
        cache.set(LANDING_CLANS_CACHE_KEY, [{'name': 'cached'}], 60)

        payload, metadata = get_landing_clans_payload_with_cache_metadata()

        self.assertEqual(payload, [{'name': 'cached'}])
        self.assertEqual(metadata['ttl_seconds'], LANDING_CLAN_CACHE_TTL)
        self.assertIsNotNone(cache.get(LANDING_CLANS_CACHE_METADATA_KEY))

    def test_landing_players_metadata_is_rebuilt_when_payload_exists_without_metadata(self):
        player_cache_key = landing_player_cache_key('random', 40)
        cache.set(player_cache_key, [{'name': 'cached-player'}], 60)

        payload, metadata = get_landing_players_payload_with_cache_metadata(
            'random', 40)

        self.assertEqual(payload, [{'name': 'cached-player'}])
        self.assertEqual(metadata['ttl_seconds'], LANDING_PLAYER_CACHE_TTL)
        metadata_key = player_cache_key.replace(':40', ':40:meta')
        self.assertIsNotNone(cache.get(metadata_key))

    def test_normalize_landing_clan_mode_accepts_known_modes(self):
        self.assertEqual(normalize_landing_clan_mode('random'), 'random')
        self.assertEqual(normalize_landing_clan_mode(' BEST '), 'best')

    def test_normalize_landing_clan_mode_rejects_unknown_mode(self):
        with self.assertRaisesMessage(ValueError, 'mode must be one of: random, best'):
            normalize_landing_clan_mode('sigma')

    def test_force_refresh_rebuilds_cached_landing_clans_payload(self):
        with patch('warships.landing._build_landing_clans', side_effect=[[{'name': 'old'}], [{'name': 'new'}]]) as mock_builder:
            first_payload = get_landing_clans_payload()
            refreshed_payload = get_landing_clans_payload(force_refresh=True)

        self.assertEqual(first_payload, [{'name': 'old'}])
        self.assertEqual(refreshed_payload, [{'name': 'new'}])
        self.assertEqual(mock_builder.call_count, 2)
        self.assertEqual(cache.get(LANDING_CLANS_CACHE_KEY), [{'name': 'new'}])

    def test_force_refresh_rebuilds_cached_landing_players_payload(self):
        with patch('warships.landing._build_random_landing_players', side_effect=[[{'name': 'old'}], [{'name': 'new'}]]) as mock_builder:
            first_payload = get_landing_players_payload('random', 40)
            refreshed_payload = get_landing_players_payload(
                'random', 40, force_refresh=True)

        self.assertEqual(first_payload, [{'name': 'old'}])
        self.assertEqual(refreshed_payload, [{'name': 'new'}])
        self.assertEqual(mock_builder.call_count, 2)
        self.assertEqual(cache.get(landing_player_cache_key(
            'random', 40)), [{'name': 'new'}])

    def test_random_landing_player_queue_payload_pops_ids_in_order(self):
        cache.set(LANDING_RANDOM_PLAYER_QUEUE_KEY,
                  [101, 102, 103], timeout=None)

        with patch('warships.landing.resolve_landing_players_by_id_order', return_value=[{'name': 'P1'}, {'name': 'P2'}]), patch('warships.tasks.queue_random_landing_player_queue_refill', return_value={'status': 'queued'}):
            payload, metadata = get_random_landing_player_queue_payload(
                2,
                pop=True,
                schedule_refill=True,
            )

        self.assertEqual(payload, [{'name': 'P1'}, {'name': 'P2'}])
        self.assertEqual(cache.get(LANDING_RANDOM_PLAYER_QUEUE_KEY), [103])
        self.assertEqual(metadata['queue_remaining'], 1)
        self.assertTrue(metadata['refill_scheduled'])

    def test_random_landing_clan_queue_payload_uses_zero_ttl_metadata(self):
        with patch('warships.landing.peek_random_landing_clan_ids', return_value=([21, 22], 55)), patch('warships.landing.resolve_landing_clans_by_id_order', return_value=[{'name': 'Clan A'}, {'name': 'Clan B'}]), patch('warships.tasks.queue_random_landing_clan_queue_refill', return_value={'status': 'queued'}):
            payload, metadata = get_random_landing_clan_queue_payload(
                40,
                pop=False,
                schedule_refill=True,
            )

        self.assertEqual(payload, [{'name': 'Clan A'}, {'name': 'Clan B'}])
        self.assertEqual(metadata['ttl_seconds'], 0)
        self.assertEqual(metadata['queue_remaining'], 55)
        self.assertEqual(metadata['served_count'], 2)
        self.assertTrue(metadata['refill_scheduled'])

    def test_random_landing_clan_queue_payload_pops_ids_in_order(self):
        cache.set(LANDING_RANDOM_CLAN_QUEUE_KEY,
                  [201, 202, 203], timeout=None)

        with patch('warships.landing.resolve_landing_clans_by_id_order', return_value=[{'name': 'C1'}, {'name': 'C2'}]), patch('warships.tasks.queue_random_landing_clan_queue_refill', return_value={'status': 'queued'}):
            payload, metadata = get_random_landing_clan_queue_payload(
                2,
                pop=True,
                schedule_refill=True,
            )

        self.assertEqual(payload, [{'name': 'C1'}, {'name': 'C2'}])
        self.assertEqual(cache.get(LANDING_RANDOM_CLAN_QUEUE_KEY), [203])
        self.assertEqual(metadata['queue_remaining'], 1)
        self.assertTrue(metadata['refill_scheduled'])

    def test_landing_players_endpoint_uses_queue_path_for_random_mode(self):
        with patch('warships.views.get_random_landing_player_queue_payload', return_value=(
            [{'name': 'QueuePlayer'}],
            {
                'ttl_seconds': 0,
                'cached_at': 'now',
                'expires_at': 'now',
                'served_count': 1,
                'queue_remaining': 59,
                'refill_scheduled': True,
            },
        )) as mock_queue_payload:
            response = self.client.get('/api/landing/players/?mode=random')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [{'name': 'QueuePlayer'}])
        self.assertEqual(response['X-Landing-Players-Cache-Mode'], 'random')
        self.assertEqual(response['X-Landing-Queue-Type'], 'players-random')
        self.assertEqual(response['X-Landing-Queue-Served-Count'], '1')
        self.assertEqual(response['X-Landing-Queue-Remaining'], '59')
        self.assertEqual(response['X-Landing-Queue-Refill-Scheduled'], 'true')
        mock_queue_payload.assert_called_once_with(
            limit=40,
            pop=True,
            schedule_refill=True,
        )

    def test_landing_clans_endpoint_uses_queue_path_for_random_mode(self):
        with patch('warships.views.get_random_landing_clan_queue_payload', return_value=(
            [{'name': 'QueueClan'}],
            {
                'ttl_seconds': 0,
                'cached_at': 'now',
                'expires_at': 'now',
                'served_count': 1,
                'queue_remaining': 59,
                'refill_scheduled': True,
            },
        )) as mock_queue_payload:
            response = self.client.get('/api/landing/clans/?mode=random')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [{'name': 'QueueClan'}])
        self.assertEqual(response['X-Landing-Clans-Cache-Mode'], 'random')
        self.assertEqual(response['X-Landing-Queue-Type'], 'clans-random')
        self.assertEqual(response['X-Landing-Queue-Served-Count'], '1')
        self.assertEqual(response['X-Landing-Queue-Remaining'], '59')
        self.assertEqual(response['X-Landing-Queue-Refill-Scheduled'], 'true')
        mock_queue_payload.assert_called_once_with(
            limit=40,
            pop=True,
            schedule_refill=True,
        )

    def test_landing_recent_clans_endpoint_accepts_no_trailing_slash(self):
        with patch('warships.views.get_landing_recent_clans_payload', return_value=[{'name': 'Recent Clan'}]) as mock_recent_clans:
            response = self.client.get('/api/landing/recent-clans')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [{'name': 'Recent Clan'}])
        mock_recent_clans.assert_called_once_with()

    def test_refill_random_landing_player_queue_appends_unique_ids(self):
        cache.set(LANDING_RANDOM_PLAYER_QUEUE_KEY, [101, 102], timeout=None)

        with patch('warships.landing._get_cached_random_landing_player_eligible_ids', return_value=[101, 102, 103, 104, 105]):
            result = refill_random_landing_player_queue(
                batch_size=2, target_size=5)

        self.assertEqual(result['status'], 'completed')
        self.assertEqual(result['added'], 2)
        queue_ids = cache.get(LANDING_RANDOM_PLAYER_QUEUE_KEY)
        self.assertEqual(queue_ids[:2], [101, 102])
        self.assertEqual(len(queue_ids), 4)
        self.assertEqual(len(set(queue_ids)), 4)
        self.assertTrue(set(queue_ids[2:]).issubset({103, 104, 105}))

    def test_refill_random_landing_clan_queue_appends_unique_ids(self):
        cache.set(LANDING_RANDOM_CLAN_QUEUE_KEY, [301, 302], timeout=None)

        with patch('warships.landing._get_cached_random_landing_clan_eligible_ids', return_value=[301, 302, 303, 304, 305]):
            result = refill_random_landing_clan_queue(
                batch_size=2, target_size=5)

        self.assertEqual(result['status'], 'completed')
        self.assertEqual(result['added'], 2)
        queue_ids = cache.get(LANDING_RANDOM_CLAN_QUEUE_KEY)
        self.assertEqual(queue_ids[:2], [301, 302])
        self.assertEqual(len(queue_ids), 4)
        self.assertEqual(len(set(queue_ids)), 4)
        self.assertTrue(set(queue_ids[2:]).issubset({303, 304, 305}))

    def test_warm_landing_page_content_warms_each_surface_once(self):
        with patch('warships.landing.get_random_landing_clan_queue_payload', return_value=([
            {'name': 'Random Clan'}
        ], {'queue_remaining': 60, 'served_count': 1, 'refill_scheduled': False, 'ttl_seconds': 0, 'cached_at': 'now', 'expires_at': 'now'})) as mock_random_clans, \
                patch('warships.landing.get_landing_best_clans_payload', return_value=[{'name': 'Best Clan'}]) as mock_best_clans, \
                patch('warships.landing.get_landing_recent_clans_payload', return_value=[{'name': 'Recent Clan'}]) as mock_recent_clans, \
                patch('warships.landing.get_random_landing_player_queue_payload', return_value=([
                    {'name': 'Random'}
                ], {'queue_remaining': 60, 'served_count': 1, 'refill_scheduled': False, 'ttl_seconds': 0, 'cached_at': 'now', 'expires_at': 'now'})) as mock_random_players, \
                patch('warships.landing.get_landing_players_payload', side_effect=[
                    [{'name': 'Best'}],
                    [{'name': 'Sigma'}],
                ]) as mock_players, \
                patch('warships.landing.get_landing_recent_players_payload', return_value=[{'name': 'Recent Player'}]) as mock_recent_players:
            from warships.landing import warm_landing_page_content

            result = warm_landing_page_content(force_refresh=True)

        self.assertEqual(result, {
            'status': 'completed',
            'warmed': {
                'clans': 1,
                'clans_best': 1,
                'recent_clans': 1,
                'players_random': 1,
                'players_best': 1,
                'players_sigma': 1,
                'recent_players': 1,
            },
        })
        mock_random_clans.assert_called_once_with(
            40,
            pop=False,
            schedule_refill=True,
            warm_preview=True,
        )
        mock_best_clans.assert_called_once_with(force_refresh=True)
        mock_recent_clans.assert_called_once_with()
        mock_random_players.assert_called_once_with(
            40,
            pop=False,
            schedule_refill=True,
        )
        self.assertEqual(mock_players.call_args_list[0].args, ('best', 40))
        self.assertEqual(mock_players.call_args_list[0].kwargs, {
                         'force_refresh': True})
        self.assertEqual(mock_players.call_args_list[1].args, ('sigma', 40))
        self.assertEqual(mock_players.call_args_list[1].kwargs, {
                         'force_refresh': True})
        mock_recent_players.assert_called_once_with()
