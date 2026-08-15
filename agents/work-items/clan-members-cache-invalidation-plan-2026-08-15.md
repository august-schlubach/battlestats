# Clan-members cache invalidation: read key `v4`, every delete stale

**Date:** 2026-08-15
**Status:** Plan — not implemented. QA this before writing code.
**Type:** Production defect, backend only. `fix:` → patch bump.
**Worktree:** `.claude/worktrees/clan-members-invalidation`
**Slice:** the `clan:members` key family only. Three adjacent findings are reported with citations and explicitly deferred (§4).


## QA Notes

_Reviewed 2026-08-15 against `/home/august/code/battlestats/.claude/worktrees/clan-members-invalidation`. 46 assertions checked, 6 corrected._

### Resolved

- **"`invalidate_clan_detail_cache` … currently ends `data.py:5553`"** -> actual: defined at `data.py:5551`, body ends `data.py:5552`; 5553-5554 are blank (`server/warships/data.py:5551`) -> corrected in §5.2's code-comment and §6.1 edit A.
- **"the deferred import at `tasks.py:1263-1268`"** -> actual: `from warships.models import Clan, Player, realm_cache_key` is at `server/warships/tasks.py:1269`; the cited range does not contain it -> corrected in §6.1 edit E.
- **"Check whether `realm_cache_key` is still used elsewhere in that task after the edit"** — deferred decision, now made. Within `refresh_clan_member_idle_task` the only two occurrences are the import (`tasks.py:1269`) and the line being replaced (`tasks.py:1322`) -> **it becomes unused; drop it from the import.** §6.1 edit E now states this rather than asking.
- **The same check was not made for `views.py`, where edit F removes a `realm_cache_key` call** -> `realm_cache_key` has 6 occurrences in `server/warships/views.py`, so the import stays -> added to §6.1 edit E as an explicit "do not remove it there".
- **"Both helpers are imported *inside* the view body (`views.py:1534-1537`)"** -> actual: the import statement spans `server/warships/views.py:1535-1538`; 1534 is the preceding comment -> corrected in §6.2 Trap 2. The patch targets (`warships.tasks.*`) are unaffected.
- **"the commit touched `views.py`, `serializers.py`, `tests/test_views.py` and four client files"** -> actual `git show --stat 7701b10`: `views.py`, `serializers.py`, `tests/test_views.py`, **`CLAUDE.md`** and **three** client files -> corrected in §2.6. The load-bearing half of the claim holds: neither `data.py` nor `tasks.py` appears.
- **§9.1 "consider one clause naming `invalidate_clan_members_cache`" in CLAUDE.md** — ambiguity resolved against editing it here. This worktree branched from `6558d41` and carries the pre-slim 194-line CLAUDE.md; the concurrent `docs/doc-estate-pass-2026-08-15` branch cuts it to 1,346 words and adds a `CLAUDE_MD_WORD_MAX` gate to `scripts/check_claude_md.sh`. An edit here conflicts with, or silently reverts, that work -> §9.1 now says do not touch it in this slice, and §10's premise note is resolved by the same fact.

Verified and correct, so unchanged (recorded because they are the claims the plan rests on): `realm_cache_key` is pure concatenation (`models.py:11`); the read and `CLAN_MEMBERS_CACHE_TTL = 300` (`views.py:1522-1523`); `clan_members` (`views.py:1479`) routed at `battlestats/urls.py:111-114`; `update_clan_data` spans 5012-5078 and both its delete (`data.py:5049`) and its `reconcile_clan_departures` call (`data.py:5076`) are inside it; the 1440-minute freshness gate (`data.py:5024`); `refresh_clan_cached_aggregates` (`data.py:5079`) is called from exactly one site, the tail of `update_clan_members` (`data.py:5173`); `reconcile_clan_departures` (`data.py:5105`) with its `if not live_member_ids: return 0` guard (`data.py:5120-5121`), `if cleared:` (`data.py:5124`), the misleading comment (`data.py:5125-5126`) and the stale delete (`data.py:5127`); the idle task's `if updated:` / `bulk_update` / delete (`tasks.py:1317`, `:1318`, `:1322`); the builder precedent (`data.py:5541-5552`); import topology — `views.py:23` imports `warships.data` at module level and `data.py` has **0** references to `warships.views`; the three literal-pinned test lines (`test_clan_crawl.py:138`, `test_clan_member_idle.py:44`, `:53`); `ClanMembersEndpointTests` (`test_views.py:1090`); both fixture traps — the header is set on every branch (`views.py:1644`) and `idle_pending` blocks the `cache.set` (`views.py:1639-1641`); the badge sub-cache is independent (`views.py:171`, `:177`); the `clan:plot:v1` realm-prefix asymmetry (`data.py:4799` vs `views.py:1693`); and every date in the §2.6 provenance table. The baseline claim reproduces exactly: 32 passed in 0.37 s.

### Unverified

- **§7's claim that no `v3` or bare `clan:members` key exists in production Redis today.** The repo-side half is verified — `views.py:1523` is the only writer in the family — but live Redis state is not checkable from a checkout. The conclusion (no flush needed) does not depend on it: a delete against an absent key is a no-op either way.
- **§8 Risk 3, that no path silently depends on the stale payload surviving.** This is a claim about runtime behavior across four invalidation paths; the plan already frames it as a thing to watch rather than a thing established.

---

## 1. Verdict

`GET /api/fetch/clan_members/<clan_id>/` reads `clan:members:v4:<clan_id>`. No writer, and no
invalidation site, constructs that string. `clan:members:v4` appears **exactly once** in the whole
`server/` tree — the read at `views.py:1523`. Verified:

```
$ grep -rn "clan:members" server/ --include=*.py
server/warships/views.py:1523:    cache_key = realm_cache_key(realm, f'clan:members:v4:{clan_id}')
server/warships/tasks.py:1322:            cache.delete(realm_cache_key(realm, f'clan:members:v3:{clan_id}'))
server/warships/data.py:5049:    cache.delete(realm_cache_key(realm, f'clan:members:{clan_id}'))
server/warships/data.py:5102:    cache.delete(realm_cache_key(realm, f'clan:members:{clan_id}'))
server/warships/data.py:5126:        # bare 'clan:members:{id}' key other call sites delete is a stale no-op.
server/warships/data.py:5127:        cache.delete(realm_cache_key(realm, f'clan:members:v3:{clan.clan_id}'))
server/warships/tests/test_clan_member_idle.py:44:        cache.set(realm_cache_key("na", "clan:members:v3:900"), [{"stale": True}])
server/warships/tests/test_clan_member_idle.py:53:        self.assertIsNone(cache.get(realm_cache_key("na", "clan:members:v3:900")))
server/warships/tests/test_clan_crawl.py:138:        key = realm_cache_key('na', 'clan:members:v3:6102')
```

All four invalidation sites are no-ops. The roster self-heals only when the 300 s TTL
(`CLAN_MEMBERS_CACHE_TTL = 300`, `views.py:1522`) lapses. Impact is therefore bounded at five
minutes of staleness per event — real, user-visible on both roster surfaces, but not unbounded.

**Second finding, larger than the headline.** The two bare-key sites are *not* dead code and were not
broken by the `v4` bump. They were orphaned by the **bare → `v2`** bump on **2026-04-29**, three and a
half months earlier. The clan-members payload has been under-invalidating since April, not since July.

**Third finding, the most instructive.** Two existing tests hardcode `v3` and assert the delete lands.
They pass green — verified, 32/32 — while production invalidation is 100 % broken. The tests pinned the
bug in place. They are the failing-first tests for this fix (§6.2).

---

## 2. Ground truth: what each of the five sites is for

Read `realm_cache_key` first: `server/warships/models.py:11` — `return f'{realm}:{key}'`. Pure string
concatenation, no versioning of its own.

### 2.1 `views.py:1523` — THE READ (and the only writer)

`clan_members` view, `views.py:1479`. Routed at `server/battlestats/urls.py:111-114`
(`/api/fetch/clan_members/<clan_id>/`, with and without trailing slash). Serves both roster surfaces:
the clan page (`ClanDetail`) and the player page (`PlayerClanSection`) — both render
`ClanActivityRoster`.

This is the only site that `cache.set`s the key. Everything else deletes.

**Correct key:** `clan:members:v4:<clan_id>`, realm-scoped. This is the reference; the other four must
match it.

### 2.2 `data.py:5049` — clan refresh (`update_clan_data`) — **LIVE, stale key**

Fires after WG `clans/info/` writes `members_count`, `tag`, `name`, `description`, `leader_id`,
`leader_name`, `last_fetch` (`data.py:5043-5047`). Reached from `update_clan_data_task`, which the
clan-members view itself dispatches on `needs_clan_refresh` (`views.py:1502-1507`).

**Is it load-bearing?** Yes. The members payload reads `clan.leader_name` to mark the leader
(`views.py:1560`: `leader_name = (clan.leader_name or '').strip().lower()`, feeding `LeaderCrownIcon`).
A leadership change therefore *must* drop this key or the crown stays on the wrong member for the TTL.
Nothing else covers it: `reconcile_clan_departures` only deletes under `if cleared:` (§2.4), and a
leadership change clears no members.

**Correct key:** `clan:members:v4:<clan_id>`.

### 2.3 `data.py:5102` — aggregate refresh (`refresh_clan_cached_aggregates`) — **LIVE, stale key**

Defined at `data.py:5079`. Recomputes `cached_total_wins` / `cached_total_battles` /
`cached_active_member_count` / `cached_clan_wr`. Called at the tail of `update_clan_members`
(`data.py:5173`), i.e. after the WG member-id sync loop has added/attached members.

**Is it load-bearing?** Yes, and it is the *only* invalidation on the commonest roster mutation. On a
"new member joined, nobody left" refresh, `reconcile_clan_departures` computes `cleared == 0` and
deletes nothing (`data.py:5124`). Line 5102 is then the sole delete standing between a roster that just
gained a row and a five-minute-stale payload.

**Correct key:** `clan:members:v4:<clan_id>`.

**Observation, explicitly out of scope:** the delete lives inside the *aggregates* function while the
mutation it actually covers happens in `update_clan_members`. That is a placement smell — the aggregate
columns (`cached_*` on `Clan`) are not read by the members payload at all. Note it; do **not** move it
in this slice. Moving it changes which events invalidate, which is a behavior change, not a bug fix.

### 2.4 `data.py:5127` — departure reconciliation (`reconcile_clan_departures`) — **LIVE, stale key**

Defined at `data.py:5105`. Clears the `clan` FK on stored members absent from the live WG roster;
guarded by `if cleared:` (`data.py:5124`) so a no-departure pass writes nothing. Called from both
`update_clan_data` (`data.py:5076`) and `update_clan_members` (`data.py:5172`).

The comment above it is now actively misleading and must go:

```python
# data.py:5125-5127 — CURRENT
    if cleared:
        # Delete the *served* members key (v3 — see clan_members view); the
        # bare 'clan:members:{id}' key other call sites delete is a stale no-op.
        cache.delete(realm_cache_key(realm, f'clan:members:v3:{clan.clan_id}'))
```

It was true when written (2026-06-14) and became false on 2026-07-18. It now asserts that *this* site is
the correct one, which is exactly backwards — every site is stale.

**Correct key:** `clan:members:v4:<clan_id>`.

### 2.5 `tasks.py:1322` — roster idle refresh (`refresh_clan_member_idle_task`) — **LIVE, stale key**

Defined at `tasks.py:1253`. Bulk `account/info` pass over the whole roster, writing only
`last_battle_date` + `days_since_last_battle` via `bulk_update` (`tasks.py:1318-1319`), under
`if updated:` (`tasks.py:1317`). Queued by the clan-members view itself on a cold cache
(`views.py:1539`, `queue_clan_member_idle_refresh`), signalled to the client via `X-Clan-Idle-Pending`
(`views.py:1645-1646`).

**Is it load-bearing?** Yes, and its breakage is the most visible of the four: the whole point of the
task is that the client's `useClanMembers` poll picks up the corrected idle. With the delete a no-op,
the poll re-serves the same stale payload for up to 300 s and the pending header resolves to nothing
changing. This path is documented in CLAUDE.md under "Clan roster idle freshness" and that
documentation currently describes behavior the code does not deliver.

**Correct key:** `clan:members:v4:<clan_id>`.

### 2.6 Provenance — how it drifted (all dates from `git show -s`)

| Date | Commit | What happened |
|---|---|---|
| 2026-03-31 | `2c53bb4` | `update_clan_data` delete added — **bare** key, matching the then-current read (`data.py:5049`, `git blame`) |
| 2026-04-02 | `4425b83` | `refresh_clan_cached_aggregates` delete added — **bare** key, still correct (`data.py:5102`, `git blame`) |
| 2026-04-29 | `7a3b7b0` | read bumped bare → `v2`. **Both bare deletes orphaned here.** No delete site updated |
| 2026-04-29 | `31d7cc5` | read bumped `v2` → `v3`. Bare deletes still orphaned |
| 2026-06-14 | `de99b28` | `reconcile_clan_departures` added with a `v3` delete — correct at the time |
| 2026-06-16 | `dde3cbd` | idle-refresh task added with a `v3` delete — correct at the time |
| 2026-07-18 | `7701b10` | read bumped `v3` → `v4` for `is_active_pvp`. **Touched `views.py` only** — remaining two correct deletes orphaned |

`git show --stat 7701b10` confirms the last row: the commit touched `views.py`, `serializers.py`,
`tests/test_views.py`, `CLAUDE.md` and three client files. Neither `data.py` nor `tasks.py` appears
in it.

---

## 3. Bug-class sweep: other versioned keys

The falsifying grep, run over `server/warships/` excluding tests:

```
$ grep -rnE ":v[0-9]+:" *.py management/
```

Fourteen hits across nine key families. Family-by-family verdict:

| Key family | Sites | Verdict |
|---|---|---|
| `clan:members:v4` | read `views.py:1523`; deletes `tasks.py:1322`, `data.py:5049`, `:5102`, `:5127` | **THE BUG.** In scope |
| `battle-history:v11` | builder `views.py:738`; invalidator `views.py:753` uses the builder; **`incremental_battles.py:1404` builds `battle-history:{name}:{period}:{windows}` — no version, no mode** | Same class. **Redundant, not live** — see §3.1. Report only |
| `clan:plot:v1` | `data.py:4799` uses `realm_cache_key`; **`views.py:1693` omits it** | Different axis (realm prefix, not version) but same root cause. **Live minor defect** — see §3.2. Report only |
| `player:detail:v1` | builder `data.py:5536`; **hardcoded template `management/commands/purge_deleted_accounts.py:32`** | Currently in agreement. Latent drift. Report only |
| `clan:tiers:v3` | `views.py:1715`, `:1721`, `data.py:4848`, `:4884` | Duplicated construction, no invalidation site exists at all → nothing to drift *from*. No defect |
| `clan:member_tiers:v2` | `data.py:4903` only | Single site. Clean |
| `clan:member-badges:v1` | `views.py:177` only | Single site. Clean |
| `clan_battles:summary:v2` | builder `data.py:3748`, used by `_invalidate_clan_battle_summary_cache` | Builder pattern. Clean — this is the target shape |
| `players:distribution:v2` / `players:correlation:v2` | builders `data.py:2731`, `:2739` | Builder pattern. Clean |
| `ship_combat_pop:v2` | builder `data.py:7523` | Builder pattern. Clean |
| `ship_pop_avgdmg:v1` | `data.py:7434` only | Single site. Clean |
| `player:lookup:missing:v2` / `missing-all:v1` | builders `views.py:212`, `:223` | Builder pattern. Clean |

**The pattern is unambiguous:** every family behind a builder function is correct; every family
constructed inline at 2+ sites has drifted or is one bump away from drifting. That is the argument for
§5.

### 3.1 `battle-history` — same class, but redundant

`incremental_battles.py:1383 _invalidate_battle_history_cache(player)` builds unversioned keys and is
therefore a total no-op against the `v11` read.

**It does not cost correctness.** Both it (line 1002) and the correct invalidator (line 906,
`transaction.on_commit(_invalidate_caches)` → `warships.views.invalidate_battle_history_cache`) live
inside the **same function**, `record_observation_from_payloads` (`incremental_battles.py:684`; next
top-level `def` is `_fetch_with_407_retry` at line 1023). The function early-returns at line 876 when
`not events and not ranked_events`; everything after that point — including the line-906 registration —
runs on every event-bearing path. Line 1002's guard (`if total_created > 0`) is strictly narrower.
So whenever the broken call fires, the working one has already been registered.

**Verdict:** dead weight, not a live defect. Deleting `_invalidate_battle_history_cache` and its call
site is a clean follow-up. **Out of scope here.**

### 3.2 `clan:plot:v1` — live minor defect, different axis

```python
# data.py:4799 — fetch_clan_plot_data, the read/write
cache_key = realm_cache_key(realm, f'clan:plot:v1:{clan_id}:{filter_type}')

# views.py:1693 — clan_data, a probe. NO realm prefix.
cache_key = f'clan:plot:v1:{clan_id}:{filter_type}'
has_cached_plot = cache.get(cache_key) is not None
```

The probe can never hit the stored key. `has_cached_plot` is permanently `False`, so
`if (not has_cached_plot or ...)` short-circuits true and `X-Clan-Plot-Pending: true` is emitted on
**every** empty-data response, regardless of whether a warm is actually pending. Consequence is
over-polling by the frontend, not wrong data.

**Verdict:** real, low severity, wrong key family. **Out of scope here** — fixing it changes a response
header's semantics on a different endpoint and deserves its own slice with its own test.

---

## 4. Scope fence

**In:** the `clan:members` key family — one builder, one invalidator, five call sites, four tests.

**Out, with citations, deferred to separate slices:**
- `incremental_battles.py:1383` + `:1002` — redundant unversioned battle-history invalidator (§3.1)
- `views.py:1693` — missing realm prefix on the `clan:plot:v1` probe (§3.2)
- `management/commands/purge_deleted_accounts.py:32` — hardcoded `player:detail:v1` template duplicating the `data.py:5536` builder
- `data.py:5102` placement — the delete covering `update_clan_members`'s mutations lives in `refresh_clan_cached_aggregates` (§2.3)

Doctrine, `decision_rules[0]`: "Prefer the smallest safe vertical slice." Four findings in one commit
is not a slice; it is a sweep. Report them in the commit body so they are not lost.

---

## 5. The structural fix

### 5.1 Recommendation: shared builder + invalidator. Do it now, in this slice.

Five inline constructions is *why* it drifted, twice, across four months. A string-only fix restores
correctness and leaves the mechanism that produced the bug fully intact — the next bump reintroduces it.

Mirror the precedent already in the file, `data.py:5536-5553`:

```python
def _bulk_cache_key_clan(clan_id: int, realm: str = DEFAULT_REALM) -> str:
    return realm_cache_key(realm, f'clan:detail:v1:{clan_id}')

def invalidate_clan_detail_cache(clan_id: int, realm: str = DEFAULT_REALM) -> None:
    cache.delete(_bulk_cache_key_clan(clan_id, realm=realm))
```

Three of the four broken sites already sit immediately beside a call to
`invalidate_clan_detail_cache` (`data.py:5050`, `:5128`) or `_invalidate_clan_battle_summary_cache`
(`data.py:5048`, `:5101`). The builder makes the members key look like its neighbours instead of being
the one hand-rolled string in the block.

**Weighed against smallest-safe-slice:** the builder touches *exactly the same five lines* a
string-only fix touches, plus one new ~12-line block. It adds no new call sites, no new behavior, no
new dependency. The slice does not grow; only its durability does. Doctrine
`preferred_patterns[2]` — "Reuse existing fetch paths, shared components, and validation patterns when
practical" — points the same way. **Recommend the builder.**

### 5.2 Placement: `data.py`. Import risk verified, not assumed.

**Signature and home:**

```python
# server/warships/data.py — immediately after invalidate_clan_detail_cache (ends line 5552)

CLAN_MEMBERS_CACHE_VERSION = 'v4'


def clan_members_cache_key(clan_id, realm: str = DEFAULT_REALM) -> str:
    """The served clan-members response key (see `clan_members`, views.py).

    SINGLE SOURCE OF TRUTH. The read in views.py and every invalidation site
    must go through this function. Bumping the version below is the ONLY
    supported way to change the key — a bump here reaches all five call sites
    at once.

    History: bumped v1->v2 (7a3b7b0), v2->v3 (31d7cc5), v3->v4 (7701b10, rows
    carry `is_active_pvp`). Each of the first two bumps orphaned invalidation
    sites that constructed the string inline; the third orphaned the rest.
    """
    return realm_cache_key(realm, f'clan:members:{CLAN_MEMBERS_CACHE_VERSION}:{clan_id}')


def invalidate_clan_members_cache(clan_id, realm: str = DEFAULT_REALM) -> None:
    cache.delete(clan_members_cache_key(clan_id, realm=realm))
```

Note `clan_id` is deliberately untyped: callers pass `str` (`views.py`, `data.py:5049`), `int`
(`tasks.py` kwargs) and a model attribute (`clan.clan_id`). The f-string normalises all three, and the
existing code already relies on that. Do **not** add `int()` coercion — `data.py:5049` receives the raw
`clan_id` argument and coercing would change behavior for a non-numeric input.

**Import-topology check (run it; do not assume):**

- `views.py:23-58` already imports from `warships.data` **at module level**. There is no cycle to
  dodge — add `invalidate_clan_members_cache` and `clan_members_cache_key` to that existing
  alphabetised block. Verify with `grep -n "from warships.views\|import views" server/warships/data.py`
  → currently zero hits, confirming `data.py` does not import `views.py`.
- `tasks.py` has **no** module-level `warships.data` import; it imports inside task bodies
  (`tasks.py:280`, `:558`, `:629`, `:658`, `:996`). Follow that convention: add the import to the
  deferred block at `tasks.py:1263-1268` inside `refresh_clan_member_idle_task`.

**Fallback if the check fails:** put the builder in `models.py` beside `realm_cache_key`
(`models.py:11`). All four files already import from `models.py`, so it is the zero-import-risk option.
It is the fallback rather than the default only because `models.py` is not where this project keeps
cache-key builders, and consistency with `data.py:5536` is worth more than paranoia. QA should not have
to re-derive this: the check is `grep`, it passes today, use `data.py`.

---

## 6. Exact changes

### 6.1 Production code — five edits

**A. `server/warships/data.py`** — add the block from §5.2 after `invalidate_clan_detail_cache`
(defined `data.py:5551`, body ends `data.py:5552`; 5553-5554 are blank before the
"Recently-viewed player queue" banner at 5555).

**B. `server/warships/data.py:5049`** (`update_clan_data`):

```python
-    cache.delete(realm_cache_key(realm, f'clan:members:{clan_id}'))
+    invalidate_clan_members_cache(clan_id, realm=realm)
```

**C. `server/warships/data.py:5102`** (`refresh_clan_cached_aggregates`) — the replacement carries a
comment, because an aggregates function invalidating the *members* payload reads as a mistake without
one (see §2.3; do not act on the smell here):

```python
-    cache.delete(realm_cache_key(realm, f'clan:members:{clan_id}'))
+    # Members payload, not the aggregates: this runs at the tail of
+    # update_clan_members, and it is the ONLY delete covering a roster that
+    # gained a member — reconcile_clan_departures is gated on `if cleared:`
+    # and does nothing when nobody left.
+    invalidate_clan_members_cache(clan_id, realm=realm)
```

**D. `server/warships/data.py:5125-5127`** (`reconcile_clan_departures`) — replaces the misleading
comment as well as the key:

```python
     if cleared:
-        # Delete the *served* members key (v3 — see clan_members view); the
-        # bare 'clan:members:{id}' key other call sites delete is a stale no-op.
-        cache.delete(realm_cache_key(realm, f'clan:members:v3:{clan.clan_id}'))
+        # Drop the served members payload so the departure shows on the next
+        # load instead of after the 5-min TTL. Key via the shared builder —
+        # inline construction is what let the read drift to v4 while every
+        # delete stayed on v3 (see clan-members-cache-invalidation-plan-2026-08-15).
+        invalidate_clan_members_cache(clan.clan_id, realm=realm)
         invalidate_clan_detail_cache(int(clan.clan_id), realm=realm)
```

**E. `server/warships/tasks.py:1322`** (`refresh_clan_member_idle_task`), plus the deferred import at
`tasks.py:1269`:

```python
     from warships.models import Clan, Player, realm_cache_key
+    from warships.data import invalidate_clan_members_cache
...
             # Drop the cached clan_members payload so the next poll re-derives
             # idle from the fresh last_battle_date.
-            cache.delete(realm_cache_key(realm, f'clan:members:v3:{clan_id}'))
+            invalidate_clan_members_cache(clan_id, realm=realm)
```

**`realm_cache_key` becomes unused in this task — drop it from the `tasks.py:1269` import.** Checked,
not left to the implementer: within `refresh_clan_member_idle_task` (`tasks.py:1253-1340`) the only
occurrences are the import itself and line 1322, the line being replaced. Leaving it is an unused
import.

**The mirror check in `views.py` comes out the other way — do NOT remove it there.** `realm_cache_key`
has 6 occurrences in `views.py`, so edit F leaves it live.

**F. `server/warships/views.py:1523`** — route the read through the builder so the read and the deletes
are provably the same string:

```python
-    cache_key = realm_cache_key(realm, f'clan:members:v4:{clan_id}')
+    cache_key = clan_members_cache_key(clan_id, realm=realm)
```

Add `clan_members_cache_key` to the module-level import block at `views.py:23`. **Delete the stale
version-history comment at `views.py:1516-1521`** (keep the `# B1: Check response cache…` line at
1515) — the v2/v3/v4 rationale now lives in the builder's docstring, and leaving a second copy beside a
call that no longer names a version is how the two descriptions drift apart next.

### 6.2 Tests — TDD order, failing first

Run with the **main checkout's venv**; this worktree has none:

```bash
cd /home/august/code/battlestats/.claude/worktrees/clan-members-invalidation/server
DJANGO_SECRET_KEY=k DB_ENGINE=sqlite3 \
  /home/august/code/battlestats/server/.venv/bin/python -m pytest \
  warships/tests/ --nomigrations --tb=short
```

Baseline established while writing this plan: `test_clan_member_idle.py` + `test_clan_crawl.py` →
**32 passed in 0.47 s**, against fully broken production invalidation.

**Step 1 — convert the two literal-pinned tests. These are the failing-first tests.**

`server/warships/tests/test_clan_crawl.py:134-146`,
`test_reconcile_invalidates_served_members_cache`:

```python
-        from warships.models import realm_cache_key
+        from warships.data import clan_members_cache_key
         clan = Clan.objects.create(clan_id=6102, realm='na', name='Z', tag='Z')
         Player.objects.create(player_id=3, realm='na', name='Gone', clan=clan)
-        key = realm_cache_key('na', 'clan:members:v3:6102')
+        key = clan_members_cache_key(6102, realm='na')
```

Also swap the comment two lines below (`test_clan_crawl.py:~145`): it currently reads "The served (v3)
members cache is dropped…". Leaving it turns a test *about* stale version assertions into a fresh one.

`server/warships/tests/test_clan_member_idle.py:44` and `:53`,
`test_updates_idle_fields_without_touching_last_fetch` — same swap, `clan_members_cache_key(900,
realm="na")` in both the `cache.set` and the `assertIsNone`.

Run them **before** touching production code, with only the builder added (edit A). Both must **FAIL**:
the test now writes/reads `v4` while the code still deletes `v3`. If either passes, the builder is
wrong — stop and re-derive. This is the proof that the tests were pinning the bug.

**What these tests guard afterwards — state it accurately.** Once both sides call
`clan_members_cache_key` the string comparison is tautological *by construction*; that is the point of
the structural fix, not a weakness in the test. What they actually guard is the **presence of the
invalidation call**: delete `invalidate_clan_members_cache(...)` from any of the four sites and they go
red. The guard against a *sixth* inline construction is the grep convention below — and that is a
convention, not a CI gate. Nobody should assume the pipeline catches it.

**Step 2 — endpoint-level anchor (new). This is the one that proves the user-facing fix.**

Add to `ClanMembersEndpointTests` (`test_views.py:1090`; reuse its `setUp`, which already patches
`queue_clan_ranked_hydration`, `queue_clan_efficiency_hydration` and `queue_clan_battle_data_refresh`).
Endpoint pattern from the neighbouring tests: `self.client.get("/api/fetch/clan_members/<id>/")`.

- `test_clan_members_cache_is_dropped_by_departure_reconciliation`
- `test_clan_members_cache_is_dropped_by_clan_data_refresh`
- `test_clan_members_cache_is_dropped_by_aggregate_refresh`
- `test_clan_members_cache_is_dropped_by_idle_refresh`

Shape of each: GET (cold) → GET again and assert `X-Clan-Members-Cache == 'hit'`, which proves the
fixture actually cached → run the invalidation path → GET again and assert the header is **`'miss'`**.

**Two fixture traps — get these right or the tests are vacuous.**

*Trap 1: the header is always present.* `views.py:1644` sets it on the non-cached branch too:
`response['X-Clan-Members-Cache'] = 'miss' if not has_pending else 'skip-pending'`. So
`assertNotIn('X-Clan-Members-Cache', response)` would never fire. Assert the **value**:
`assertEqual(response['X-Clan-Members-Cache'], 'hit')` then `assertEqual(..., 'miss')`.

*Trap 2: the endpoint refuses to cache while hydration is pending.* `views.py:1637-1641`:

```python
has_pending = pending_player_ids or pending_efficiency_player_ids or idle_pending
if not has_pending:
    cache.set(cache_key, serialized_data, CLAN_MEMBERS_CACHE_TTL)
```

`setUp` already zeroes the first two, but **not** `idle_pending`. On a cold GET the view calls
`queue_clan_member_idle_refresh` (`views.py:1539`), which `cache.add`s the dispatch key, so
`is_clan_member_idle_refresh_pending` returns `True`, the response is `skip-pending`, and **nothing is
cached** — the test would then "pass" while proving nothing. Both helpers are imported *inside* the
view body (`views.py:1535-1538`), so patch them at the source module:

```python
@patch("warships.tasks.is_clan_member_idle_refresh_pending", return_value=False)
@patch("warships.tasks.queue_clan_member_idle_refresh",
       return_value={"status": "skipped", "reason": "cooldown"})
```

Consider lifting both patches into `setUp` alongside the existing three, since all four new tests need
them. The `idle_refresh` test is the exception: it must let the real delete run, so patch only the
*pending* probe there and drive the task directly via `refresh_clan_member_idle_task.apply(...)` as
`test_clan_member_idle.py` already does.

**These name no version literal at all.** They survive `v5`, `v6`, and any future bump — which is the
whole point, since a string-equality test ("read key == delete key") passes trivially once both call the
builder and says nothing about a sixth site appearing.

**Step 3 — new coverage for the two bare-key sites.** `update_clan_data` and
`refresh_clan_cached_aggregates` have **no** cache-invalidation test today. Falsifying grep, already
run: `grep -rn "refresh_clan_cached_aggregates\|update_clan_data" server/warships/tests/` returns only
`@patch("warships.views.update_clan_data_task.delay")` decorators in `test_views.py` plus one routing
assertion in `test_task_routing.py:23`; `grep -rl "refresh_clan_cached_aggregates"
server/warships/tests/` returns **nothing**. No cache assertion exists on either path.

Two unit tests in `test_clan_crawl.py`, alongside the reconcile tests, using `clan_members_cache_key` —
never a literal.

**`update_clan_data` — must be isolated from reconcile, or it passes vacuously.** This is the same trap
class as Step 2's. `update_clan_data` deletes the key at `data.py:5049` and then calls
`reconcile_clan_departures` at `data.py:5076`, which — after this fix — deletes the *same* key. Mock
`_fetch_clan_member_ids` to return a non-empty list and the reconcile delete fires, so the test goes
green **even with edit B unapplied**, proving nothing.

Isolation is cheap: mock `_fetch_clan_member_ids → []`. The member loop is then skipped and
`reconcile_clan_departures` returns at its `if not live_member_ids: return 0` guard
(`data.py:5120-5121`) without touching the cache. The assertion now proves `data.py:5049` specifically
fired. Also mock `_fetch_clan_data` to return a payload, and set the clan's `last_fetch` to `None` or
something older than 1440 minutes — the freshness gate at `data.py:5024` returns early, before the
delete, otherwise.

**`refresh_clan_cached_aggregates` — do not over-mock.** It is a plain function making no WG calls.
Create the clan, seed the key via `clan_members_cache_key`, call it directly, assert the key is gone.
That already isolates `data.py:5102`.

**Step 4 — full suite.** ~850 tests, ~5 s. Then the lean release gate (`/release-gate`).

**Test doctrine note for whoever executes:** no new test may contain the substring `clan:members:`.
That literal is now the builder's private business. A grep for it in `server/warships/tests/` should
return zero hits when you are done — that is the regression guard against this exact bug recurring.

---

## 7. Cache-invalidation consequence of deploying

**No key bump. No Redis flush. Nothing operational.**

Reasoning, both halves checkable:

1. **The payload shape does not change.** This commit adds no field and removes none; `serializers.py`
   is untouched. Live `v4` entries remain valid and servable. A bump would evict a correct warm cache
   for no reason and cost every clan page one cold recompute.
2. **The keys the broken deletes target cannot exist in Redis today.** The read at `views.py:1523` is
   the *only* writer in the family, and it has written `v4` exclusively since 2026-07-18. Nothing has
   written a `v3` or bare key in almost four weeks, and the TTL is 300 s. So the four deletes being
   fixed are currently firing at keys that are already absent — which is precisely why the failure is
   silent and why no error appears in any log.

**Deploy is therefore behaviorally forward-only:** after it, the four events start dropping a key that
exists. Nothing needs cleaning up first.

Per CLAUDE.md: this is `fix:` → **patch** bump via `./scripts/release.sh patch`. **Check `main`'s
`VERSION` before cutting from this worktree** — `release.sh` bumps the local `VERSION` blind, and a
worktree that branched before an intervening release will cut a version that already exists. Then
`./client/deploy/deploy_to_droplet.sh battlestats.online` — **mandatory even though the change is
backend-only**, because `NEXT_PUBLIC_APP_VERSION` is captured at frontend build time and the footer
would otherwise lie. Backend deploy: `./server/deploy/deploy_to_droplet.sh battlestats.online`.

---

## 8. Risks and rollback

The behavior delta is exactly "invalidation now fires." Everything downstream follows from that.

**Risk 1 — more clan-members recomputes.** *Low, and bounded by numbers already in the code.*
`update_clan_data` is gated at 1440 minutes per clan (`data.py:5024`), so at most one extra recompute
per clan per day from that path. The idle refresh is gated to ~once/hour/clan by its cooldown key
(`queue_clan_member_idle_refresh`, `tasks.py`). The expensive part of the payload — the bulk ship-badge
fetch — sits behind its **own** `clan:member-badges:v1` cache with an independent 300 s TTL
(`_clan_member_badges_cached`, `views.py:~170`) which this change does not touch, so a members-cache
miss does not re-run the badge bulk fetch. The remaining per-miss cost is one `select_related` roster
query, one indexed `PlayerDailyShipStats` probe (`views.py:1583`), and serialization.

**Risk 2 — invalidation landing mid-poll.** *Low, name it anyway.* The frontend polls clan members
during ranked/efficiency hydration. A delete landing between polls means the next poll re-serializes
instead of hitting cache. That is the intended behavior — it is how the corrected idle reaches the
screen — but it is a real change in request cost on the hydration loop, previously masked by the broken
delete.

**Risk 3 — the fix reveals a second bug.** *Watch for it.* Four invalidation paths have been inert for
between four weeks and four months. If any of them was silently depending on the stale payload
surviving (for instance a refresh that writes partial state and relies on the cache to hide it until a
later write completes), that will surface now. Nothing in the read path suggests this — the payload is
built entirely from committed DB rows — but it is the one class of surprise a "make the delete work"
change can produce.

**Not a risk:** stale-serving. This change can only make the payload *fresher*.

**Rollback.** Single commit, no migration, no schema change, no env var, no client change. Revert and
redeploy the backend; behavior returns to the current TTL-only self-heal. No cache cleanup on rollback
either — a `v4` key written before the revert is still exactly what the reverted read expects. If
rolling back, do **not** revert the tests: their v4 assertions failing is the correct signal.

---

## 9. Pre-commit checklist (doctrine `pre_commit_requirements`)

1. **Durable docs for new behavior.** CLAUDE.md's "Clan roster idle freshness" bullet describes
   invalidation that does not currently happen. It needs no edit *after* the fix (the code will finally
   match it).
   **Do NOT edit CLAUDE.md in this worktree** (QA, 2026-08-15). This tree branched from `6558d41`, and
   a concurrent branch, `docs/doc-estate-pass-2026-08-15`, rewrites CLAUDE.md from 6,484 words to
   1,346 and adds a hard word cap in `scripts/check_claude_md.sh`. Editing the pre-slim copy here
   produces a conflict at best and silently reinstates 5,000 words at worst. If a clause naming
   `invalidate_clan_members_cache` is still wanted, add it *after* whichever branch lands second, and
   note the word cap leaves ~150 words of headroom. This also resolves §10.
2. **Reconcile uncertain docs.** The misleading comment at `data.py:5125-5126` is removed by edit D;
   the redundant version history at `views.py:1515-1521` is trimmed by edit F. Both are part of the fix,
   not optional tidying.
3. **Touched behavior under test.** §6.2, four converted/new endpoint tests plus two unit tests.
4. **Archive superseded runbooks.** None applies — no runbook covers this key.
5. **Contract docs + API tests when a payload changes.** No payload change. `serializers.py` untouched.
   Note this explicitly in the commit body so review does not go looking.
6. **Reconcile the spec being implemented.** This file. Mark it implemented on landing and register it
   in `agents/doc_registry.json` — four `agents/work-items/*` entries are already registered there
   (`db-growth-capacity-2026-08-05.md`, `data-capture-utility-audit-2026-08-05.md`,
   `droplet-outbound-mail-spec.md`, `droplet-outbound-mail-plan.md`), so registration is the convention
   for plans of this weight.

Suggested commit subject:

```
fix(clan): route every clan-members cache invalidation through one key builder
```

Body should record: all four deletes were no-ops; the bare pair since 2026-04-29 and the v3 pair since
2026-07-18; the two tests that pinned `v3` and passed green throughout; and the three deferred findings
from §4 with their citations.

---

## 10. Note on the task premise

The task brief stated CLAUDE.md "was just slimmed to a dispatch file." In this worktree it is
**194 lines** and identical to the full version — the architecture, caching-strategy and Celery-queue
sections are all still inline. No slimming has landed here. Nothing in this plan depends on that
either way; recorded so the next reader does not plan against a premise the tree does not support.
