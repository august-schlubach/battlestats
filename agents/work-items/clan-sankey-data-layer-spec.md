# Clan Membership Sankey — Data Layer Specification

**Author:** Project Manager Agent  
**Date:** 2026-03-16  
**Status:** Draft for cross-functional review  
**Scope:** Backend data product and API contract for clan inflow/outflow visualization  
**Primary Surface:** Future D3 Sankey diagram showing player movement between clans

---

## 1. Objective

**Core question this feature answers:** _"Where are players coming from when they enter a clan, and where do they go when they leave?"_

The intended Sankey diagram needs a trustworthy movement dataset at player granularity. The current app can show:

1. a clan's current roster,
2. a player's current clan,
3. clan-scoped current roster charts,
4. player and clan lookup freshness.

The current app cannot yet answer:

1. when a player moved from clan A to clan B,
2. whether a player left for no clan or simply has stale data,
3. how many players flowed into or out of a clan during a chosen window,
4. how to aggregate those transitions safely into Sankey links.

This specification defines:

1. what the existing internal and upstream APIs already offer,
2. why those surfaces are insufficient by themselves for historical flow analysis,
3. the normalized persistence layer required for Sankey-ready clan movement data,
4. the recommended collection and derivation pipeline,
5. the recommended read-side API contract for future D3 consumption.

---

## 2. Current Data Inventory

### 2.1 Internal Persistence That Exists Today

The repo already stores these clan-related primitives:

1. `Player.clan`
   - current clan only
   - overwritten in place during refreshes
   - not historical
2. `Clan`
   - current clan metadata such as `clan_id`, `tag`, `name`, `members_count`, `leader_id`, `leader_name`
3. `Snapshot`
   - daily PvP cumulative stat snapshots only
   - no clan attribution field
   - not suitable for reconstructing clan transfers

### 2.2 Internal Read APIs That Exist Today

#### `GET /api/fetch/clan_members/<clan_id>/`

What it returns today:

1. current roster members for one clan,
2. member-level activity and status markers,
3. ranked/clan-battle hydration state headers.

Useful for Sankey work:

1. confirms present membership for a clan at read time,
2. can seed roster-based observations,
3. gives a current member list for diffing.

Not sufficient for Sankey by itself:

1. no prior clan,
2. no join event,
3. no leave event,
4. no observation history,
5. no windowed flow aggregates.

#### `GET /api/fetch/clan_data/<clan_id>:<filter>`

What it returns today:

1. current clan plot data for active or all members.

Useful for Sankey work:

1. almost none directly.

Not sufficient for Sankey:

1. it is a current-state clan visualization payload,
2. it carries no transition history.

#### Player and clan detail/landing endpoints

What they provide:

1. current clan metadata,
2. current player metadata,
3. recent lookup activity.

Why they are not a Sankey source:

1. they expose current state only,
2. they do not preserve movement history.

### 2.3 Internal Write Paths That Already Touch Clan Membership

#### `warships.clan_crawl.save_player(player_data, clan)`

Current behavior:

1. creates or loads a `Player`,
2. assigns `player.clan = clan`,
3. saves the player in place.

Implication:

1. movement is currently destructive from a history perspective,
2. prior clan membership is lost unless another persistence layer captures it first.

#### `warships.data.update_clan_members(clan_id)`

Current behavior:

1. fetches current `members_ids` for the clan,
2. ensures listed players point at that clan,
3. updates player data.

Implication:

1. join/transfer into the clan can be observed,
2. departures are not explicitly recorded,
3. there is no append-only change log.

#### `warships.data.update_player_data(player, force_refresh=False)`

Current behavior:

1. fetches `account/info/` player data,
2. fetches `clans/accountinfo/` for current clan membership,
3. rewrites `player.clan` to current clan or `None`.

Implication:

1. this path is the best current single-player membership truth source,
2. it still overwrites state instead of recording a transition ledger.

---

## 3. Upstream API Surfaces Relevant To Sankey Data

### 3.1 `GET /wows/clans/accountinfo/`

This is the most important upstream endpoint for the Sankey data layer.

Observed contract already documented in the repo:

1. accepts one or more `account_id` values,
2. can return `clan_id`, `role`, `joined_at`,
3. can include short clan details when `extra=clan` is requested.

What it gives us:

1. a player's current clan membership,
2. the player's current clan role,
3. a `joined_at` timestamp for the current membership,
4. short clan metadata useful for normalization.

What it does **not** give us:

1. prior clans,
2. a full transfer ledger,
3. explicit leave timestamps,
4. complete history of all historical memberships.

Conclusion:

1. this endpoint is authoritative for current membership,
2. it is necessary but not sufficient for Sankey history.
3. `joined_at` applies to the player's current clan only and must not be interpreted as full clan lineage.

### 3.2 `GET /wows/clans/info/`

Useful fields already consumed in the repo:

1. `members_ids`,
2. clan metadata such as `name`, `tag`, `members_count`, `leader_id`, `leader_name`.

What it gives us:

1. a current clan roster snapshot,
2. a way to diff a clan's previous roster vs current roster.

What it does not give us:

1. destination clan when a player disappears from the roster,
2. historical join/leave events.

Conclusion:

1. roster diffing is valuable evidence,
2. roster diffing alone cannot produce reliable outflow attribution.

### 3.3 `GET /wows/account/info/`

Useful for:

1. player identity and current profile metadata,
2. fallback `clan_id` hints when membership data is present.

Not sufficient for Sankey:

1. still current state only,
2. no prior membership chain.

---

## 4. What The Current API Can Truthfully Offer Today

If a Sankey endpoint were built today on top of existing data only, the backend could truthfully expose only these weak claims:

1. current members of a clan,
2. current clan for a player,
3. current roster differences between two observations made by the app,
4. approximate inflow/outflow hints based on destructive state changes.

That would be inadequate because:

1. `Player.clan` is mutable current state, not history,
2. `Snapshot` does not carry clan attribution,
3. request-time refreshes can rewrite membership before any transfer is recorded,
4. absences in a clan roster can mean stale data, no clan, or a move elsewhere,
5. current upstream endpoints do not provide a complete historical membership chain.

### Hard Rule

Do **not** derive a production Sankey from:

1. current `Player.clan` alone,
2. `Snapshot` rows,
3. current clan rosters without an append-only event or observation layer.

---

## 5. Recommended Data Model

The backend should add both a raw observation layer and a derived event layer.

### 5.1 `ClanMembershipObservation`

Purpose:

1. store the exact membership state the system observed at a specific time,
2. preserve evidence for debugging and re-derivation,
3. avoid making Sankey links depend on mutable player rows.

Recommended fields:

1. `player` FK
2. `observed_at` datetime
3. `source` enum
   - `player_refresh`
   - `clan_refresh`
   - `full_clan_crawl`
   - `manual_repair`
4. `source_clan_id` nullable integer
   - the clan whose roster produced the observation when source is roster-based
5. `current_clan` FK nullable
6. `current_clan_tag` nullable string snapshot
7. `current_clan_name` nullable string snapshot
8. `role` nullable string
9. `joined_at` nullable datetime
10. `evidence_type` enum

- `direct_membership_lookup`
- `roster_membership`

11. `crawl_run_id` or `ingest_batch_id` nullable string

Batch scoping rules:

1. `ingest_batch_id` should be present for any top-level refresh pass that may touch many players,
2. one `update_clan_members(clan_id)` invocation gets one shared `ingest_batch_id`,
3. one full crawl run gets one `crawl_run_id` and may also assign per-clan `ingest_batch_id`s,
4. a standalone `update_player_data(player)` call may leave `ingest_batch_id` null unless it is part of a larger orchestrated batch.

Why this is needed:

1. preserves what the system actually knew at the time,
2. supports replaying derivation logic later,
3. keeps destructive current-state refreshes from erasing evidence.

De-duplication rules:

1. observations stay append-only, but identical repeated reads in the same ingest pass should not create duplicate rows,
2. if the same player is observed with the same clan, role, and `joined_at` inside the same ingest batch, store one observation only,
3. outside a batch context, suppress near-duplicates inside a short time window such as 5 minutes,
4. if both evidence types exist for the same current-state claim, prefer `direct_membership_lookup` over `roster_membership`.

Recommended implementation approach:

1. use a deterministic observation identity of `(player_id, evidence_type, current_clan_id, role, joined_at, ingest_batch_id)` when `ingest_batch_id` is present,
2. enforce that identity with either a database uniqueness strategy or a select-before-insert guard inside the write transaction,
3. when `ingest_batch_id` is absent, perform a recent-observation lookup on the same identity fields inside the configured short time window.

### 5.2 `ClanMembershipEvent`

Purpose:

1. store derived join/leave/transfer events that can be aggregated into Sankey links.

Recommended fields:

1. `player` FK
2. `event_type` enum
   - `join`
   - `leave`
   - `transfer`
3. `from_clan` FK nullable
4. `to_clan` FK nullable
5. `observed_at` datetime
6. `effective_at` nullable datetime
7. `effective_at_precision` enum
   - `exact_from_upstream`
   - `observed_only`
   - `window_inferred`
8. `confidence` enum
   - `high`
   - `medium`
   - `low`
9. `basis_observation` FK to `ClanMembershipObservation`
10. `previous_observation` FK nullable
11. `notes` nullable text

Why this is needed:

1. Sankey links want transitions, not raw observations,
2. QA will need confidence and timing semantics to judge correctness,
3. multiple read APIs can be built on top of one normalized event ledger.

Recommended indexes:

1. `(player_id, observed_at desc)` on observations,
2. `(current_clan_id, observed_at desc)` on observations,
3. `(event_type, observed_at desc)` on events,
4. `(from_clan_id, to_clan_id, observed_at desc)` on events,
5. `(confidence, event_type)` on events for read-side filtering.

### 5.3 `ClanMembershipReconciliation`

Purpose:

1. track players whose disappearance from a clan roster needs confirmation before a public leave or transfer is emitted.

Recommended fields:

1. `player` FK
2. `suspected_from_clan` FK nullable
3. `status` enum
   - `pending`
   - `confirmed_transfer`
   - `confirmed_leave`
   - `inconclusive`
   - `expired`
4. `attempt_count` integer
5. `first_seen_at` datetime
6. `last_attempt_at` datetime nullable
7. `resolved_at` datetime nullable
8. `last_error` nullable string
9. `related_observation` FK nullable

Why this is needed:

1. the reconciliation queue needs durable state, not just in-memory retries,
2. QA must be able to inspect why a suspected disappearance did or did not become a public event.

### 5.4 Optional `ClanMembershipCurrent`

Purpose:

1. keep a fast current-state row per player without re-reading the full observation history.

This can be omitted initially if `Player.clan` remains the operational current-state lane. If omitted, `Player.clan` remains current state while the new observation and event tables become the historical source of truth.

---

## 6. Recommended Collection Pipeline

### 6.1 Collection Principle

Every path that currently mutates `Player.clan` should record a membership observation first.

### 6.2 Player Refresh Lane

Hook into `update_player_data(player)`.

Ownership rule:

1. this is the canonical writer for direct membership observations,
2. if another lane already knows it will invoke `update_player_data()` for the same player in the same ingest batch, that outer lane should not also write a second observation for the same membership claim.

Refactor note:

1. the existing `update_player_data()` implementation will need a small structural split so fetched upstream data can be normalized first and persisted second,
2. the transaction boundary should wrap observation write, event derivation, and the final `Player.clan` mutation together instead of relying on the current save shape.

Collection steps:

1. fetch `clans/accountinfo/` for the player,
2. normalize returned `clan_id`, `joined_at`, `role`, and short clan details,
3. if the request fails, write no observation and no event,
4. insert a `ClanMembershipObservation`,
5. compare to the latest prior observation for that player,
6. derive a `join`, `leave`, or `transfer` event if the membership changed,
7. only then rewrite `Player.clan`.

Write-safety rule:

1. observation insert, event derivation, and `Player.clan` mutation should happen inside one database transaction,
2. partial writes should not leave a new event committed while `Player.clan` still points at stale current state.

Why this lane matters:

1. it is the strongest source for per-player current membership,
2. it can confirm a new destination clan after a roster disappearance.

### 6.3 Clan Refresh Lane

Hook into `update_clan_members(clan_id)`.

Collection steps:

1. fetch current `members_ids` for the clan,
2. diff current `members_ids` against previously known members of that clan,
3. diff prior known members of that clan vs current `members_ids`,
4. mark disappeared players as requiring reconciliation,
5. call `update_player_data()` for present members whose direct membership needs refreshing,
6. enqueue targeted per-player `clans/accountinfo/` refreshes for those disappeared players,
7. derive outflow only after the player-level membership lookup confirms destination clan or no clan.

Why this lane matters:

1. it is the most efficient way to detect that movement may have happened,
2. it should not be the final authority for outflow destination.

Important clarification:

1. because `update_clan_members()` already calls `update_player_data()` for present members, it should not also insert a second roster observation for those same members in the same pass,
2. its unique Sankey value is roster diffing and disappearance detection.

### 6.4 Full Clan Crawl Lane

Hook into `crawl_clan_members()` and `save_player()`.

Collection steps:

1. emit roster-based observations for all players seen during the crawl,
2. use a crawl run identifier so observations can be grouped,
3. avoid deriving low-confidence transfers mid-run until the player's latest membership is confirmed.

Why this lane matters:

1. it creates broad dataset coverage,
2. it gives the app repeated observation points even without user-driven lookups.

### 6.5 Reconciliation Lane

Add a targeted job for ambiguous movement states.

Purpose:

1. resolve players who vanished from a clan roster but whose next destination is not yet known,
2. avoid turning transient API gaps into false outflows.

Recommended logic:

1. maintain a queue of `player_id`s needing reconciliation,
2. retry `clans/accountinfo/` with backoff,
3. if a new clan is confirmed, create `transfer`,
4. if membership is empty consistently, create `leave` to `No Clan`,
5. if the lookup remains inconclusive, keep no public Sankey event yet.

Stopping criteria:

1. cap retries, for example at 3 attempts over 48 hours,
2. record the last reconciliation error or empty-response reason,
3. if all attempts fail due to transport or upstream errors, mark the state inconclusive and emit no public event,
4. if all attempts succeed and return no clan membership, emit a `leave` event with `effective_at_precision=observed_only`,
5. do not let unresolved reconciliation items accumulate indefinitely.

---

## 7. Event Derivation Rules

### 7.1 Join

Create a `join` event when:

1. previous known clan is `None`,
2. new observation shows a clan.

Link semantics:

1. source node = `No Clan` or `Unknown Prior State`, depending on evidence,
2. target node = observed clan.

### 7.2 Leave

Create a `leave` event when:

1. previous known clan exists,
2. reconciled current membership is empty.

Link semantics:

1. source node = prior clan,
2. target node = `No Clan`.

### 7.3 Transfer

Create a `transfer` event when:

1. previous known clan exists,
2. new observation shows a different clan.

Link semantics:

1. source node = prior clan,
2. target node = new clan.

### 7.4 Role Changes

Do not emit Sankey events for role-only changes.

Store role in observations because:

1. it may be useful later for filtering or tooltip context,
2. it is not a flow edge by itself.

Decision rule:

1. suppress Sankey event derivation when prior and current clan are the same and only role metadata changed,
2. still keep the newer observation so future audits can see the role transition.

### 7.5 Effective Time Rules

Use these timing semantics:

1. if upstream `joined_at` exists for the new clan, it may be used as `effective_at` for `join` or `transfer into` semantics,
2. for leave events, prefer `observed_at` unless a stronger source is added later,
3. every public API should expose timing precision and confidence.

Precision clarification:

1. `exact_from_upstream` is exact only for the start of the player's current membership in the `to_clan`,
2. it does not imply an exact leave timestamp for the `from_clan`,
3. leave timing remains observed or inferred unless a stronger source is added later.

Transfer timing rule:

1. if a transfer is confirmed and upstream `joined_at` exists for the `to_clan`, use that timestamp for the transfer event's `effective_at`,
2. the `from_clan` side of that transfer should still be considered observed rather than exact unless a stronger source is added later,
3. if no upstream `joined_at` exists, use `observed_at` and mark precision as `observed_only`.

Confidence rules:

1. `high`: direct membership lookup confirms the destination clan and provides stable current membership evidence,
2. `medium`: roster disappearance plus successful player-level confirmation establishes a leave or transfer,
3. `low`: reserved for internal diagnostics only; do not expose public Sankey links below the configured confidence floor.

### 7.6 Hidden Profiles

Rules:

1. hidden status must not be reinterpreted as leaving a clan,
2. missing downstream player-detail stats must not suppress legitimate membership observations,
3. if a successful `clans/accountinfo/` response confirms a clan or confirms no clan, use that membership result even if the player is hidden,
4. if the membership lookup fails or is inconsistent for a hidden player, do not create a low-quality public flow event.

Null-response rules:

1. a successful `clans/accountinfo/` request that returns no clan membership should create an observation with `current_clan=None`,
2. that observation should still use `evidence_type=direct_membership_lookup` because the no-clan state was directly confirmed,
3. a failed request should create no observation and no event,
4. event derivation must distinguish `confirmed no clan` from `lookup failed`.

---

## 8. Recommended Sankey-Facing API Contract

The first public flow API should read from `ClanMembershipEvent`, not from `Player` directly.

### 8.1 Recommended Endpoint

`GET /api/fetch/clan_membership_flows/`

### 8.2 Recommended Query Parameters

1. `window_days`
   - default `30`
2. `focus_clan_id`
   - optional; when present, return only flows in or out of that clan
3. `min_link_count`
   - optional; suppress low-volume links for readability
4. `include_no_clan`
   - default `true`
5. `include_unknown`
   - default `false`
6. `direction`
   - `in`, `out`, or `both`

### 8.3 Recommended Response Shape

```json
{
  "window": {
    "start": "2026-02-15T00:00:00Z",
    "end": "2026-03-16T00:00:00Z",
    "days": 30
  },
  "meta": {
    "focus_clan_id": 1000055908,
    "event_count": 128,
    "suppressed_link_count": 9,
    "confidence_floor": "medium"
  },
  "nodes": [
    {
      "id": "clan:1000055908",
      "label": "NAUMA",
      "kind": "clan",
      "clan_id": 1000055908,
      "tag": "NAUMA",
      "name": "Naumachia"
    },
    {
      "id": "no-clan",
      "label": "No Clan",
      "kind": "system"
    }
  ],
  "links": [
    {
      "source": "clan:1000000001",
      "target": "clan:1000055908",
      "value": 14,
      "event_type": "transfer",
      "confidence": "high",
      "sample_players": [
        {
          "player_id": 123,
          "name": "ExamplePlayer"
        }
      ]
    }
  ]
}
```

### 8.4 Optional Debug Endpoint

Recommended for QA and development:

`GET /api/fetch/clan_membership_events/`

Purpose:

1. inspect raw event rows,
2. validate edge derivation,
3. debug individual player transitions.

---

## 9. Collection Backfill Strategy

The app will not have deep historical transfers on day one because upstream does not provide full clan history.

### Recommended rollout

1. Ship the observation and event tables first.
2. Start recording from all future player/clan refreshes.
3. Run a targeted backfill over high-lookup clans and their known rosters to build useful recent coverage quickly.
4. Make the Sankey UI explicitly label the coverage window as `observed by Battlestats`, not universal account-lifetime clan history.

### Backfill truthfulness rule

Do not pretend to reconstruct pre-observation historical transfers the app never saw.

Coverage rule:

1. Sankey payloads should describe the window as `observed by Battlestats`,
2. read APIs should expose coverage metadata so the frontend does not imply universal account-lifetime transfer history.

---

## 10. Risks And Guardrails

| Risk                                                                     | Severity | Mitigation                                                          |
| ------------------------------------------------------------------------ | -------- | ------------------------------------------------------------------- |
| Destructive `Player.clan` writes erase historical context                | High     | Insert observations and derive events before mutating current state |
| Roster disappearance is misread as transfer                              | High     | Require player-level reconciliation before attributing destination  |
| Upstream `joined_at` is mistaken for full historical lineage             | High     | Treat it as current-membership start only                           |
| Hidden or stale profiles create false leave events                       | Medium   | Use confidence thresholds and skip inconclusive events              |
| Sparse early coverage makes the Sankey look authoritative when it is not | High     | Label data as observed-window flows only                            |

---

## 11. Non-Goals

This data layer does **not** attempt to provide:

1. universal lifetime clan history for every player,
2. retroactive clan lineage before Battlestats started observing the player,
3. role-change Sankey edges,
4. causal explanations for why a player moved,
5. retention/churn metrics inferred only from current-state tables.

---

## 12. Acceptance Criteria

1. The spec clearly distinguishes current-state APIs from historical flow requirements.
2. The spec names the exact upstream membership endpoint Battlestats should rely on for current clan truth.
3. The spec forbids deriving production Sankey links from `Player.clan` or `Snapshot` alone.
4. The recommended collection pipeline records append-only observations before mutating current membership.
5. The recommended derivation rules define `join`, `leave`, and `transfer` semantics with confidence and timing precision.
6. The proposed read API is aggregatable into D3 Sankey `nodes` and `links` without frontend inference.
7. The rollout plan stays honest about coverage limits.
8. The spec defines durable reconciliation state instead of relying on an in-memory retry queue.
9. The implementation includes enough indexes to support windowed flow aggregation.

---

## 13. Recommended Implementation Order

1. Add `ClanMembershipObservation` model.
2. Add `ClanMembershipEvent` model.
3. Hook observation writes into `update_player_data`, `update_clan_members`, and crawl saves.
4. Add reconciliation for roster disappearances.
5. Add a low-level event inspection endpoint for QA.
6. Add the aggregated Sankey flow endpoint.
7. Only then build the D3 Sankey UI.
