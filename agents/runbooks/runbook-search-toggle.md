# Runbook: Search Toggle (Player / Clan)

## Summary

The header search bar supports toggling between player search and clan search via a compact pill toggle widget positioned to the left of the search input. By default, the toggle is in the left position (Players). Switching to the right position changes the search context to Clans.

## UI Behavior

- **Toggle widget**: Compact pill/slider with "P" and "C" hint letters. No visible labels.
- **Tooltip**: Shows "Search Players" or "Search Clans" depending on current mode.
- **Placeholder text**: "Search Players" (default) or "Search Clans" when toggled.
- **Accessibility**: `role="switch"`, `aria-checked`, `aria-label`.

### Player mode (default — left position)

- Autocomplete suggestions fetched from `GET /api/landing/player-suggestions?q=<query>&realm=<realm>`.
- Suggestions show a WR-colored dot + player name + hidden icon if applicable.
- Selecting a suggestion or pressing Enter navigates to `/player/<name>?realm=<realm>`.

### Clan mode (right position)

- Autocomplete suggestions fetched from `GET /api/landing/clan-suggestions?q=<query>&realm=<realm>`.
- Suggestions show `[TAG] Clan Name` with member count.
- Selecting a suggestion navigates to `/clan/<clan_id>-<slug>?realm=<realm>`.
- Pressing Enter with no highlighted suggestion auto-selects the first suggestion (there is no freeform `/clan/<name>` route).

### Mode switching

- Switching modes clears the suggestion list immediately.
- The query text is preserved across toggles.
- Separate client-side cache keys: `player:{realm}:{query}` and `clan:{realm}:{query}`.

## Backend Endpoint

### `GET /api/landing/clan-suggestions`

| Param | Required | Description |
|-------|----------|-------------|
| `q` | Yes | Search query (min 3 characters) |
| `realm` | No | Realm filter (default: `na`) |

**Response**: `200 OK`
```json
[
  {
    "clan_id": 12345,
    "tag": "STORM",
    "name": "Storm Fleet",
    "members_count": 40
  }
]
```

- Max 8 results.
- Matches against `Clan.name` OR `Clan.tag` via `ILIKE`.
- Prefix matches sorted first, then by `members_count DESC`.
- Redis cache: `{realm}:clan-suggest:{query}` with 10 min TTL.

### Database indexes

Migration `0048_clan_name_tag_trgm_indexes` adds `pg_trgm` GIN indexes on `warships_clan.name` and `warships_clan.tag` for performant `ILIKE` queries. Requires the `pg_trgm` extension (already enabled for the player name index).

### LIKE-metacharacter escaping (2026-08-26)

**Both suggestion endpoints escape `\`, `%` and `_` in the user query before building the ILIKE pattern (`_like_escape()` in `views.py`), and every ILIKE that receives an escaped pattern carries an explicit `ESCAPE '\'`.** Six ILIKE sites in total: two for players, four for clans.

This is load-bearing, not cosmetic. An unescaped `_` is a single-character LIKE wildcard, so it does two things:

1. **Wrong answers** — `Ur_` matched `UrX` as readily as `Ur_Vile`.
2. **Index collapse** — pg_trgm extracts trigrams only from literal runs of >= 3 characters between wildcards. A pattern like `%ur_vi%` leaves the runs `ur` and `vi`, neither long enough, so **no trigram can be extracted and the GIN index cannot be used at all**. The planner falls back to scanning the realm.

Measured on production (PG 18.4, `warships_player` = 1,103,232 rows, 2026-08-26, `EXPLAIN` only):

| pattern | plan | cost |
|---|---|---|
| `'%vile%'` | Bitmap Index Scan `player_name_trgm_idx` | 343 |
| `'%ur_vi%'` (unescaped) | Index Scan on realm + row filter | **174,354** |
| `'%ur\_vi%' ESCAPE '\'` | Bitmap Index Scan `player_name_trgm_idx` | 86 |

Unescaped, that scan blocked the request thread past `GUNICORN_TIMEOUT_SECONDS`, producing `WORKER TIMEOUT` -> SIGABRT -> 500 with an empty body: five occurrences between 2026-08-20 and 2026-08-24, every one of them a query containing `_` (`ur_`, `gp_`, `gp_1`, `ot_pq`, `ur_vi`). After escaping, the same `ur_` query returns in **106 ms**.

**If you touch this SQL, keep `ESCAPE '\'` on every ILIKE.** An escaped pattern sent to an ILIKE without the clause matches a literal backslash and silently returns zero rows — for exactly the underscore names the escaping exists to fix. The regression guards are `test_like_escape_neutralises_like_wildcards` and the two `*_underscore_is_literal` contract tests in `server/warships/tests/test_views.py`.

The SQLite branch of both views uses the ORM (`__icontains`), which already escapes LIKE wildcards; the contract tests therefore pass on both engines and pin the two branches to the same semantics.

## Files Changed

| File | Change |
|------|--------|
| `client/app/components/SearchModeToggle.tsx` | New toggle component |
| `client/app/components/HeaderSearch.tsx` | Integrated toggle, dual-mode suggestions, clan navigation |
| `server/warships/views.py` | New `clan_name_suggestions()` view |
| `server/battlestats/urls.py` | Registered `api/landing/clan-suggestions` route |
| `server/warships/migrations/0048_clan_name_tag_trgm_indexes.py` | GIN index migration |

## Test Coverage

- **Backend**: `test_views.py` — `ApiContractTests` class covers clan suggestion endpoint: matching, tag matching, short query, realm filtering, null byte safety.
- **Frontend**: `HeaderSearch.test.tsx` — toggle rendering, mode switching, clan endpoint fetch, clan navigation, suggestion clearing.

## Deploy Notes

1. Run `python manage.py migrate` to apply the `pg_trgm` GIN index migration.
2. The `pg_trgm` extension must already be active in the database (it is, for the existing `player_name_trgm_idx`).
3. No new env vars required.
4. No Celery task changes.

## Archive Condition

Archive this runbook when the search toggle is stable and no longer the subject of active iteration.
