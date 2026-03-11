# Runbook: API Surface Coverage

Tracks every public API endpoint, its smoke test case name, and coverage status.
Update this file when endpoints are added, removed, or renamed.

## Smoke Test

```bash
docker compose exec -T server python scripts/smoke_test_site_endpoints.py
```

## Endpoint Registry

### Landing / Discovery

| Endpoint | Method | Smoke Case | Covered |
|---|---|---|---|
| `/api/landing/clans/` | GET | `landing_clans` | Yes |
| `/api/landing/players/` | GET | `landing_players` | Yes |
| `/api/landing/recent/` | GET | `landing_recent` | Yes |
| `/api/landing/player-suggestions/?q=<query>` | GET | `player_suggestions` | Yes |

### Player (Router — PlayerViewSet)

| Endpoint | Method | Smoke Case | Covered |
|---|---|---|---|
| `/api/player/<name>/` | GET (detail) | `player_detail_shinn000` | Yes |
| `/api/player/<name>/` | GET (404) | `player_missing_404` | Yes |
| `/api/player/` | GET (list) | — | Skipped (unpaginated, too slow for smoke) |

**Key fields validated**: `name`, `pvp_ratio`, `pvp_survival_rate`, `verdict`

### Player Fetch Endpoints

| Endpoint | Method | Smoke Case | Covered |
|---|---|---|---|
| `/api/fetch/player_summary/<player_id>/` | GET | `player_summary_shinn000` | Yes |
| `/api/fetch/randoms_data/<player_id>/` | GET | `randoms_maraxus1` | Yes |
| `/api/fetch/tier_data/<player_id>/` | GET | `tier_secap` | Yes |
| `/api/fetch/type_data/<player_id>/` | GET | `type_fourgate` | Yes |
| `/api/fetch/activity_data/<player_id>/` | GET | `activity_fourgate` | Yes |
| `/api/fetch/ranked_data/<player_id>/` | GET (populated) | `ranked_punkhunter25` | Yes |
| `/api/fetch/ranked_data/<player_id>/` | GET (empty) | `ranked_empty_kevik70` | Yes |

### Clan (Router — ClanViewSet)

| Endpoint | Method | Smoke Case | Covered |
|---|---|---|---|
| `/api/clan/<clan_id>/` | GET (detail) | `clan_detail_naumachia` | Yes |
| `/api/clan/` | GET (list) | — | Skipped (unpaginated, too slow for smoke) |

### Clan Fetch Endpoints

| Endpoint | Method | Smoke Case | Covered |
|---|---|---|---|
| `/api/fetch/clan_data/<clan_id>:<filter>` | GET | `clan_data_naumachia` | Yes |
| `/api/fetch/clan_data/<clan_id>:<filter>` | GET (400) | `clan_filter_invalid_400` | Yes |
| `/api/fetch/clan_members/<clan_id>/` | GET | `clan_members_naumachia` | Yes |
| `/api/fetch/clan_battle_seasons/<clan_id>/` | GET | `clan_battles_naumachia` | Yes |

### Ship (Router — ShipViewSet)

| Endpoint | Method | Smoke Case | Covered |
|---|---|---|---|
| `/api/ship/<id>/` | GET (detail) | `ship_detail` | Yes |
| `/api/ship/` | GET (list) | — | Skipped (unpaginated) |

### Player Explorer

| Endpoint | Method | Smoke Case | Covered |
|---|---|---|---|
| `/api/players/explorer/?page_size=5` | GET | `players_explorer` | Yes |

### Population Distributions

| Endpoint | Method | Smoke Case | Covered |
|---|---|---|---|
| `/api/fetch/wr_distribution/` | GET | `wr_distribution` | Yes |
| `/api/fetch/player_distribution/win_rate/` | GET | `player_distribution_win_rate` | Yes |
| `/api/fetch/player_distribution/survival_rate/` | GET | `player_distribution_survival_rate` | Yes |
| `/api/fetch/player_distribution/battles_played/` | GET | `player_distribution_battles_played` | Yes |
| `/api/fetch/player_correlation/win_rate_survival/` | GET | `player_correlation_win_rate_survival` | Yes |

### Stats

| Endpoint | Method | Smoke Case | Covered |
|---|---|---|---|
| `/api/stats/` | GET | `stats` | Yes |

## Coverage Summary

- **Total endpoints**: 27 (counting distinct path+status combinations)
- **Smoke-tested**: 24
- **Skipped (perf)**: 3 (unpaginated list endpoints: player, clan, ship)
- **Not covered**: 0

## Notes

- `clan_battles_naumachia` depends on an async Celery worker to populate data; the test retries up to 6 times (5s apart) and passes with a warning if the worker isn't running.
- List endpoints for `/api/player/`, `/api/clan/`, `/api/ship/` are standard DRF router defaults. They are unpaginated and return all records, making them too slow for smoke testing against a production-sized dataset. They are not used by the client.

## Changelog

| Date | Change |
|---|---|
| 2026-03-10 | Added: player_suggestions, player_list, player_detail (with verdict), clan_list, clan_detail, ship_list, players_explorer, player_distribution_survival_rate. Reorganized test cases by category. |
