# WoWS `account/statsbydate` Status

Last verified: 2026-03-09

## Why This Matters

This repo originally explored the World of Warships `account/statsbydate` endpoint as a source of per-day player battle activity. The endpoint is still documented by Wargaming, but current live behavior does not provide usable PvP-by-date slices for tested public accounts. Future work should start from this write-up instead of redoing the same endpoint validation cold.

## Current Conclusion

- The endpoint is still documented in the Wargaming Developer Room.
- The documentation UI is brittle when the docs path is loaded with query parameters.
- The live API endpoint is reachable and returns JSON.
- For tested active, public NA accounts, `account/statsbydate` returned `status: ok` but `pvp: null`.
- Current working assumption: the endpoint is not reliable for product use, even though it has not been formally removed from the reference docs.

## Evidence

### 1. Documentation still exists

Base reference page:

`https://developers.wargaming.net/reference/all/wows/account/statsbydate/`

Observed on 2026-03-09:

- Page title is `PLAYER STATISTICS BY DATE`.
- Documented purpose: `Method returns statistics slices by dates in specified time span.`
- Documented hosts include `https://api.worldofwarships.eu/wows/account/statsbydate/`.
- Documented params include `application_id`, `account_id`, `dates`, `extra`, `fields`, `language`.
- `dates` limitation shown in docs: max 10 dates, within a 28-day range from current date.

### 2. Docs URL breaks when loaded with query string

Tested URL:

`https://developers.wargaming.net/reference/all/wows/account/statsbydate/?application_id=1a167f0d986f26f3fa7f792857b40151&r_realm=eu`

Observed on 2026-03-09:

- The Developer Room rendered `METHOD NOT FOUND`.
- This appears to be a docs-site routing problem, not proof that the API method is removed.

### 3. Live `account/info` works for active public accounts

Tested real regional hosts:

- `eu`
- `com` for NA
- `asia`

Sample active public NA accounts taken from the local `warships_player` table:

- `1001162884` (`deathdemon67`)
- `1012704239` (`Hans_CC`)
- `1007700175` (`Menzoran`)

Observed on `https://api.worldofwarships.com/wows/account/info/`:

- Valid public data returned.
- `hidden_profile` was `false`.
- `statistics.pvp.battles` was nonzero.
- `last_battle_time` indicated recent activity.

Representative response for `1001162884`:

```json
{
  "status": "ok",
  "meta": { "count": 1, "hidden": null },
  "data": {
    "1001162884": {
      "hidden_profile": false,
      "statistics": { "pvp": { "battles": 38927 } },
      "nickname": "deathdemon67",
      "last_battle_time": 1773014396
    }
  }
}
```

### 4. Live `account/statsbydate` did not return usable PvP slices

Observed on `https://api.worldofwarships.com/wows/account/statsbydate/` for the same active accounts:

- Response status was `ok`.
- `data[account_id].pvp` was `null`.
- This remained true with no explicit date list and with explicit recent dates.

Representative response:

```json
{
  "status": "ok",
  "meta": { "count": 1, "hidden": null },
  "data": { "1001162884": { "pvp": null } }
}
```

Explicit recent-date test also returned null:

```text
https://api.worldofwarships.com/wows/account/statsbydate/?application_id=APP_ID&account_id=1001162884&dates=20260308,20260307,20260306
```

Observed response shape:

```json
{
  "status": "ok",
  "meta": { "count": 1, "hidden": null },
  "data": { "1001162884": { "pvp": null } }
}
```

## Reproduction Steps

Use the actual regional API host, not the documentation URL.

Check that the player exists and is public:

```bash
APP_ID=1a167f0d986f26f3fa7f792857b40151
curl -s "https://api.worldofwarships.com/wows/account/info/?application_id=$APP_ID&account_id=1001162884&fields=nickname,hidden_profile,last_battle_time,statistics.pvp.battles"
```

Then test `statsbydate`:

```bash
APP_ID=1a167f0d986f26f3fa7f792857b40151
curl -s "https://api.worldofwarships.com/wows/account/statsbydate/?application_id=$APP_ID&account_id=1001162884"
```

Then test explicit recent dates:

```bash
APP_ID=1a167f0d986f26f3fa7f792857b40151
curl -s "https://api.worldofwarships.com/wows/account/statsbydate/?application_id=$APP_ID&account_id=1001162884&dates=20260308,20260307,20260306"
```

## Implications For This Repo

- Do not treat `account/statsbydate` as a reliable source of daily PvP activity.
- Continue using snapshot-based derivation from stable cumulative account data for player activity and trend views.
- If `statsbydate` is ever reconsidered, treat it as opportunistic and feature-flagged until live validation proves otherwise.

## Open Questions / Next Checks

- Test whether `extra=pve` returns non-null slices when `pvp` does not.
- Test with accounts discovered live from `account/list` instead of only local DB samples.
- Check for any official Wargaming forum or devblog statement that explicitly explains the null payload behavior.
- Re-verify periodically before making any product decision that depends on historical daily slices.
