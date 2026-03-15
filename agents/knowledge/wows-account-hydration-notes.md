# WoWS Account Hydration Notes

Last verified: 2026-03-14

## Why This Matters

The repo now depends on a small set of upstream endpoints for account lookup, cumulative account hydration, and clan membership enrichment. Their runtime behavior is good enough for product use, but only if the app keeps a few defensive rules in place.

This note captures the practical behavior the repo currently relies on so future contract and API work starts from verified assumptions instead of docs alone.

## Current Conclusions

- `account/info` is the primary trusted upstream source for cumulative player hydration.
- `account/list` is useful for account discovery, but only with local exact-name verification.
- `clans/accountinfo` is the primary clan-membership lookup, but missing rows are a valid no-membership state.
- `account/statsbydate` remains unsuitable as the contract boundary for recent PvP activity, so the repo continues to derive activity from stable cumulative sources.

## Practical Endpoint Rules

### 1. `account/info` is the authoritative cumulative source

Current repo usage treats `account/info` as authoritative for:

- player existence after account ID is known,
- hidden-profile detection,
- last battle timestamps,
- cumulative PvP totals used by summary and activity derivation.

Important behavior:

- The envelope can still return `status: ok` while `data[account_id]` is null for wrong-realm or missing accounts.
- Consumers must null-check the keyed account payload instead of assuming success from the top-level status.
- Current snapshot derivation and player refresh flows depend on `account/info` staying trustworthy for cumulative PvP stats.

### 2. `account/list` must not be trusted without post-filtering

Current repo usage is intentionally narrow:

- local cache first,
- then upstream `account/list` with `type=exact`, `limit=1`, and fields `account_id,nickname`.

Important behavior:

- The repo still performs a local case-insensitive nickname equality check before accepting the result.
- This protects the app from treating the first upstream result as authoritative identity without verification.
- Treat `account/list` as a discovery helper, not as a standalone identity contract.

### 3. `clans/accountinfo` absence is not an error

Current repo usage treats `clans/accountinfo` as the main membership lookup before deeper clan hydration.

Important behavior:

- Some players legitimately have no clan membership data.
- Missing rows should be interpreted as no clan membership or no clan activity, not as a transport failure.
- Clan-related player hydration therefore needs tolerant null handling.

## Repo Implications

- Keep upstream YAML profiles aligned with the exact field subsets current code requests.
- Keep derived ODCS contracts aligned with serializer fields instead of trying to mirror raw upstream payloads.
- Add tests whenever a new derived payload becomes contract-worthy.
- Add a new knowledge note whenever repo behavior changes because of an upstream mismatch, fallback, or ambiguity.

## Code References

- `server/warships/api/players.py`
- `server/warships/api/clans.py`
- `server/warships/data.py`
- `server/warships/views.py`
- `server/warships/tests/test_upstream_contracts.py`
