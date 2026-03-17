# Runbook: Clan PvE Player Marker

## Goal

Mark clan roster members who primarily play PvE content so the clan list surfaces a machine-focused playstyle at a glance.

This version must satisfy these explicit requirements:

- derive PvE battle count as `total_battles - pvp_battles`
- only mark players when `total_battles > 500`
- only mark players when their derived PvE count is more than `75%` of their PvP count, or at least `4000`
- show the marker in clan member lists with a robot or equivalent machine-themed icon
- avoid adding stale denormalized state if the signal can be derived cheaply from existing player fields

## Decision

Keep this as runtime-derived state rather than a stored database flag.

Reasoning:

- both source values already exist on `Player`: `total_battles` and `pvp_battles`
- the calculation is trivial and only used in roster payloads
- persisting `is_pve_player` would introduce another field that must stay in sync with every player refresh
- a derived helper keeps the rule centralized without creating migration or backfill work

## Rule

For a player:

- `pve_battles = max(total_battles - pvp_battles, 0)`
- mark them as PvE-focused when:
  - `total_battles > 500`
  - `pve_battles > 0.75 * pvp_battles`, or
  - `pve_battles >= 4000`

## API Surface

Endpoint:

- `GET /api/fetch/clan_members/<clan_id>/`

Additional field:

- `is_pve_player`

This field is derived at response build time from the current player totals.

## Files

- `server/warships/data.py`
- `server/warships/views.py`
- `server/warships/serializers.py`
- `client/app/components/ClanMembers.tsx`
- `server/warships/tests/test_views.py`

## Validation

1. Run focused backend tests:
   - `docker compose exec -T server python manage.py test warships.tests.test_views.ClanMembersEndpointTests`
2. Run the client build:
   - `docker compose run --rm --no-deps react-app npm run build`
3. Manual UI check on a populated clan:
   - verify the leader still shows the crown marker
   - verify members with PvE totals above `75%` of PvP show a robot marker
   - verify members with `>= 4000` derived PvE battles still show a robot marker even when PvP remains higher
   - verify members with `total_battles <= 500` do not show the robot marker
   - verify members exactly at `75%` of PvP do not show the robot marker

## Risks

- `total_battles - pvp_battles` treats every non-PvP battle as PvE-like for this heuristic; that is acceptable for this UI marker but not a full mode taxonomy
- stale player stats will stale the marker until the next player refresh

## Non-Goals

- do not persist a dedicated `is_pve_player` model field
- do not redesign clan sorting based on the PvE marker
- do not expose a broader battle-mode breakdown in this change
