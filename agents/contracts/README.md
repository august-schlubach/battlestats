# Contracts

This directory holds machine-readable or semi-structured contracts for data surfaces the repo depends on.

Use this directory for:

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

## Current Starting Point

- `data-products/player-daily-snapshots.odcs.yaml`
- `upstream/wows-account-statsbydate.yaml`

This first contract reflects the repo's derived daily player activity dataset, which is a better ODCS fit than the raw WoWS `account/statsbydate` endpoint.

For upstream endpoints, the YAML profile should capture:

- endpoint identity and purpose,
- supported hosts / realms,
- request parameters we rely on,
- happy-path response shape,
- known deviations from docs,
- current trust level and product recommendation,
- links to supporting knowledge notes.
