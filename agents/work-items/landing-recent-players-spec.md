# Landing "Last viewed" — one entry to three

**Date:** 2026-07-30
**Status:** approved, implementing
**Surface:** `/` (landing), client-only
**Parent runbook:** `agents/runbooks/runbook-audience-growth-instrumentation-2026-07-29.md`

## Why

The single-entry affordance shipped in 4.7.0 for one reason: a cold landing arrival
must type a name before the site shows it anything, while returning visitors produce
a disproportionate share of pageviews. A visitor who follows two or three players
(their own account, a clanmate, a rival) gets one click back to exactly one of them,
and the other two remain a typing exercise. Three slots covers the common repeat set
without turning the top of the landing page into a history list.

## Behavior

- The browser remembers up to **3** distinct recently-viewed players, most recent first.
- Identity is `(realm, name.toLowerCase())`. Re-viewing a remembered player **moves it
  to the front** rather than appending a duplicate; without this, three visits to one
  player fill all three slots with the same person, which is strictly worse than the
  single-entry version.
- Presentation: `Last viewed:` followed by up to three names separated by ` · `.
  **No realm tag.** Renders nothing, and reserves no space, when nothing is stored.
- Entries are written only after a profile actually resolves. A 404 or an abandoned
  load never becomes an offer. (Unchanged.)

### Accepted consequence

Without the realm tag, the same name on two realms renders as two identical-looking
entries. This is rare, the cross-realm fix below removes its most common cause, and
each link still resolves to the correct realm on click.

## Storage

`app/lib/lastViewedPlayer.ts`, key `bs-last-player` (unchanged). The stored value
becomes an **array** of `{ name, realm }`, most recent first.

- **Read is shape-tolerant.** `Array.isArray` distinguishes the new shape from the
  legacy single object unambiguously; a legacy object is read as a one-element list.
  Returning visitors — the exact population this feature serves — therefore keep
  their entry across the deploy instead of losing it on the day it ships.
- Entries validate **individually**: one corrupt element is dropped, not the list.
- Unreadable or non-array/non-object JSON reads as empty rather than throwing on a
  cold landing render. Storage that throws (private mode) means the affordance simply
  never appears.

API: `rememberLastViewedPlayer(name, realm)` (signature unchanged),
`readLastViewedPlayers(): LastViewedPlayer[]` (was singular, returned `| null`),
`forgetLastViewedPlayers()` (clear-all; no production caller, used by tests).

## Cross-realm double-write fix

`PlayerRouteView.tsx` currently calls `rememberLastViewedPlayer(..., realm)` with the
**requested** realm, and the cross-realm fallback branch below it then calls
`setRealm(resolved)`. `realm` is in the load effect's dependency array, so the effect
re-runs and writes a **second** entry under the resolved realm.

With one slot the second write overwrote the first and the bug was invisible. With
three slots it would surface the same player twice, one of them under a realm that
account does not exist in. The fix reads the resolved-realm header before remembering
and stores `resolved || realm`, so the re-run writes the same identity and dedup
collapses it to one entry.

Cross-realm fallback is live in production (4.2.8, ASIA→EU→NA), so this is real
traffic, not a hypothetical.

## Telemetry

Event name `landing-last-player` is **kept** so existing Umami history stays
comparable. A `position` prop (1-based) joins `realm`, which is the only way slots 2
and 3 can later be shown to earn their space.

## Test coverage

- lib: move-to-front dedup (case-insensitive), cap at 3, legacy single-object
  migration, per-entry validation, corrupt/throwing storage, clear-all.
- component: renders nothing at zero; renders up to three names with ` · ` separators
  and no realm tag; url-encodes names; tracks `position` per slot.
- `PlayerRouteView`: resolved profile is remembered; a 404 is not; a cross-realm
  resolve leaves exactly one entry, under the resolved realm.
