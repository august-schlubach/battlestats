from django.test import SimpleTestCase
from unittest.mock import patch

from warships import data


class CorrelationWarmScopeTests(SimpleTestCase):
    """`warm_player_correlations` no longer warms a tier-type population.

    The tier x type payload became per-player only in 4.5.5: the Profile tab's
    "Random Battles by Tier" figure reads `player_cells` and nothing else, so
    the population half (`tiles` / `trend` / `tracked_population`) and the
    ~325 s/realm `CROSS JOIN LATERAL` over every qualifying player's
    `battles_json` that produced it were removed. This file previously covered
    that machinery end to end (the rebuild floor, the SQL-to-Python fallback,
    the freshness gate); all of it is gone.
    """

    def test_warms_only_the_three_surviving_population_correlations(self):
        with patch.object(data, 'warm_player_wr_survival_correlation',
                          return_value={'tracked_population': 11}) as wr, \
                patch.object(data, 'warm_player_ranked_wr_battles_population_correlation',
                             return_value={'tracked_population': 22}) as ranked, \
                patch.object(data, 'warm_player_clan_battle_wr_battles_population_correlation',
                             return_value={'tracked_population': 33}) as clan_battle:
            results = data.warm_player_correlations(realm='na')

        self.assertEqual(set(results), {
            'win_rate_survival', 'ranked_wr_battles', 'clan_battle_wr_battles'})
        self.assertNotIn('tier_type', results)
        wr.assert_called_once_with(realm='na')
        ranked.assert_called_once_with(realm='na')
        clan_battle.assert_called_once_with(realm='na')

    def test_the_population_aggregation_is_gone(self):
        # Named explicitly so a future reader sees these were removed on
        # purpose rather than renamed. Re-introducing any of them means
        # re-introducing the heaviest standing analytical statement on prod.
        for removed in (
            '_TIER_TYPE_POPULATION_SQL',
            '_aggregate_tier_type_population_sql',
            '_aggregate_tier_type_population_python',
            '_fetch_player_tier_type_population_correlation',
            'warm_player_tier_type_population_correlation',
            'TIER_TYPE_POPULATION_REBUILD_HOURS',
        ):
            self.assertFalse(
                hasattr(data, removed),
                f'{removed} is back; the tier-type population was removed in 4.5.5',
            )
