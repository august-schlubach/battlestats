# Upstream Endpoint Profiles

This directory contains lightweight YAML contracts for raw third-party endpoints the repo depends on.

Why this exists:

- The WoWS API is a third-party HTTP interface with runtime quirks that do not map cleanly to ODCS.
- We still need a structured way to document what we call, what we expect, and where production behavior differs from documentation.

These files are intentionally simpler than OpenAPI and more operational than narrative knowledge notes.

## Use This For

- endpoint path and host information,
- required and optional request params,
- response shape we rely on,
- known null / hidden / missing-data behavior,
- trust assessment for product usage,
- links back to evidence in `agents/knowledge/`.

## Suggested Shape

- `id`
- `provider`
- `service`
- `endpoint`
- `purpose`
- `docs_url`
- `hosts`
- `request`
- `response`
- `observed_behavior`
- `trust`
- `repo_usage`
- `evidence_refs`

Rule of thumb: put facts that should be machine-readable here; put investigation narrative in `agents/knowledge/`.

## Current Profiles

- `wows-account-info.yaml`
- `wows-account-list.yaml`
- `wows-clans-accountinfo.yaml`
- `wows-account-statsbydate.yaml`
