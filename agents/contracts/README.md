# Contracts

This directory holds machine-readable or semi-structured contracts for data surfaces the repo depends on.

Use this directory when a structured artifact is more useful than narrative prose.

Good fits:

- internal normalized data products,
- stable field semantics shared across backend and frontend,
- future endpoint contracts where a structured artifact is more useful than freeform notes.

Use `agents/knowledge/` instead when the main value is narrative investigation, operational quirks, or evidence from live testing.

## Recommended Split

- `data-products/`
  - ODCS contracts for internal datasets and derived payloads.
- `upstream/`
  - Raw Wargaming endpoint contracts as lightweight repo-local YAML profiles.

## Format Guidance

- Use `.odcs.yaml` when the artifact is a stable data product with schema, ownership, quality expectations, and freshness semantics.
- Do not force flaky third-party HTTP endpoints into ODCS unless there is a clear benefit over an endpoint-focused format.
- Use plain `.yaml` profiles under `upstream/` for raw WoWS endpoint contracts.
- Prefer one contract per conceptual surface.
- Keep links back to the supporting note in `agents/knowledge/` when live behavior diverges from vendor docs.

## Current Starting Point

- `data-products/player-daily-snapshots.odcs.yaml`
- `data-products/player-summary.odcs.yaml`
- `upstream/wows-account-info.yaml`
- `upstream/wows-account-list.yaml`
- `upstream/wows-account-statsbydate.yaml`
- `upstream/wows-clans-accountinfo.yaml`
- `upstream/wows-encyclopedia-info.yaml`
- `upstream/wows-encyclopedia-ships.yaml`
- `upstream/wows-encyclopedia-modules.yaml`
- `upstream/wows-ships-badges.yaml`

The current contract set covers the main derived player activity dataset, the player summary/detail payload, and the most relied-on upstream account and clan-membership endpoints. (The explorer row payload was dropped in `e932215` when the `players_explorer` browse endpoint was removed; this sentence still named it until 2026-08-15.)

**Known coverage gap (2026-08-15):** the upstream profiles document 7 of the 15 Wargaming surfaces the backend actually calls. Undocumented: `ships/stats/` — the backbone of the whole battle-history pipeline — plus `seasons/accountinfo/`, `seasons/info/`, `seasons/shipstats/`, `clans/info/`, `clans/season/`, `clans/seasonstats/` and `clans/list/`. `seasons/info/` and `clans/season/` are the sole upstream sources for the durable `RankedSeason` / `ClanBattleSeason` models behind the current-season icon semantics.

For upstream endpoints, the YAML profile should capture:

- endpoint identity and purpose,
- supported hosts / realms,
- request parameters we rely on,
- happy-path response shape,
- known deviations from docs,
- current trust level and product recommendation,
- links to supporting knowledge notes.
