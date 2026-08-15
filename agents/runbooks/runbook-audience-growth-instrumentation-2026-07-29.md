# Runbook: Audience Growth Instrumentation and Word-of-Mouth Surfaces

_Created: 2026-07-29_
_Context: A 14-day traffic analysis (2026-07-16 → 07-29 UTC, read directly from the `umami` database) found that arrivals, not retention, constrain growth of a durable core audience; it also found the product has no working handle for the word-of-mouth channel the growth strategy depends on._
_QA: Every code assertion below was verified against the working tree at `203f34e` (v4.6.4) and against the deployed tracker at `https://battlestats.online/umami/script.js`; see section 9 for the assertion ledger._
_Status: **Workstreams A, B, C and D1 implemented** on `feat/audience-growth-instrumentation` (2026-07-29). D2 deferred by decision. Section 10 records what changed between spec and implementation._

## Purpose

The stated growth goal is a core audience of 100 to 200 stats-literate players, reached through
word of mouth, occasional quiet community mentions, and search rather than broad promotion. This
runbook records the measured baseline for that goal and specifies the four pieces of engineering
work the repository can deliver toward it. Outreach itself (which communities, which clans, which
posts) is operator-owned and deliberately out of scope; everything here is code and measurement.

Read this before touching analytics identity, Open Graph metadata, or the landing page's
cold-arrival path. Section 7 records the measurement traps that produced two wrong answers on the
first analysis pass; re-read it before quoting any Umami delta.

## 1. Measured baseline (read 2026-07-30 UTC)

Windows use explicit UTC date bounds. **Visitor** means distinct Umami `session_id`; **visit**
means distinct `visit_id` (30-minute inactivity window); **event** means `event_type = 2`.

| metric | cur 07-16→07-29 | prev 07-02→07-15 | prev ex-07-08 burst |
|---|---|---|---|
| visitors / day | 30.1 | 38.5 | 35.9 (real erosion −16.1%) |
| visitors (distinct in window) | 249 | 326 | 280 (13 days) |
| visits | 627 | 808 | |
| pageviews | 1,177 | 1,783 | 1,631 |
| pageviews / visitor | 2.83 | 3.44 | |

Recurring-core cohort, by 14-day window:

| window start | visitors | ≥2 active days | ≥4 active days | ≥8 active days |
|---|---|---|---|---|
| 2026-06-04 | 1,075 | 217 | 54 | 10 |
| 2026-06-18 | 417 | 78 | 24 | 13 |
| 2026-07-02 | 326 | 69 | 27 | 8 |
| 2026-07-16 | 249 | 60 | 19 | 6 |

**The core count fell while conversion-to-core rose:** 54 of 1,075 arrivals is 5.0%; 19 of 249 is
7.6%. Retention is therefore not demonstrably the bottleneck; the top of the funnel is. This
inverts the intuitive reading and it is the most consequential number in this runbook.

Goal arithmetic. At the blended 7.6% rate, a 100 to 200 person core implies roughly 1,300 to 2,600
visitors per fortnight, about ten times current volume. But a targeted arrival converts far better
than a blended one: the 2026-06-01 DCInside burst was 63 Korean visitors and it produced a cohort
still arriving direct 6 to 11 times a day two months later. At a 25 to 30% conversion rate, the
goal needs only 400 to 800 well-aimed arrivals in total. The strategy is sound; the required
volume is small if the aim is good. That is why this runbook invests in *card quality and
measurement* rather than in traffic volume.

Supporting structure, current window:

- 44.5% of visits are one pageview, zero events, under ten seconds; concentrated on `/`.
- 30.2% of visits exceed 60 seconds and produce 53% of pageviews plus 85% of all interaction.
- 19 visitors active on 4+ days supply 40% of pageviews; 7 near-daily visitors supply 23%.
- Pre-existing session ids rose 18 → 43 window over window even as the total fell.
- Referrals by visitors: direct 177, internal 135, bing 33, duckduckgo 20, google 8,
  `asia.wows-numbers.com` 4 (first ever), t.co 4, `m.dcinside.com` 0 (was 16), baidu 0 (was 5).
- Geography: US 64, KR 59, JP 33, DE 25 sessions; those four are ~74% of the total.
- Devices: desktop 101, mobile 58, laptop 34, tablet 7. Browsers: chrome 77, edge-chromium 45,
  ios 28, firefox 28 (the Edge share tracks Bing's referral dominance).
- Landing→entity conversion improved without intervention: 35.4% → 44.1%.
- The German cohort's 36 viewed player pages resolve to a few German clans (`GGWW5` 8 members
  viewed, `G_O_T` 6, `BAGA` 3, `SOKA` 3): clan-shaped browsing, not random discovery.
- KR arrives direct 6 to 11 visitors/day every day with zero DCInside referral, so the bursts
  converted into a habit. This cannot be a pre-existing cohort: the two weeks before 06-01
  totalled 30 and 81 visitors site-wide.

## 2. Decisions

1. **Analytics identity goes through Umami's `distinct_id`, not a new first-party pipeline.**
   The deployed Umami has migrations through `13_add_revenue` with `10_add_distinct_id` applied, so
   `session.distinct_id` exists; it is NULL on every row today. Populating it from a random
   localStorage UUID repairs the metric already in use instead of creating a second, divergent one.
   `EntityVisitDaily.unique_visitors` plus `HotPlayer.active_days_window` stay the server-side
   alternative if the data is later needed inside Django; that is explicitly not the first move.
2. **The KPI is "returning visitors with ≥4 active days in a rolling 28-day window."** Target 100
   to 200. The current 14-day equivalent is 19. A 28-day window is chosen over 14 so weekly players
   count; the 14-day series above is retained for continuity.
3. **Dynamic Open Graph images are promoted from deferred to committed work.** `runbook-seo.md`
   listed OG image generation as Priority 4 ("future") on 2026-03-31. The traffic data now shows
   the only proven social channel is X via `t.co`, where the preview card is the entire pitch.
   This runbook supersedes that deferral.
4. **The share affordance is restored, framed honestly as obstacle removal rather than a lever.**
   `player-share` logged 14 events from 12 visitors between 2026-06-06 and 06-23; `clan-share`
   logged **zero events in its entire life**. Commit `ff6677e` (2026-06-24, "drop Share/Back")
   removed both buttons. That is a weak base rate. Restoration is justified because word of mouth
   is the stated strategy and the product otherwise has no in-product handle for it, not because
   12 visitors prove demand. Expect single-digit weekly usage; do not treat a small number as
   failure.
5. **Only the evidenced half of the cold-arrival work ships.** Remembering the last-viewed player
   targets a measured population (43 returning session ids producing 41% of pageviews). Seeding
   the landing page with an example board is the least evidenced item in the analysis and is
   deferred to a follow-up, not implemented.
6. **Outreach tactics stay out of the repository.** They depend on judgment about communities and
   they change faster than a runbook can track.

## 3. Workstream A: durable visitor identity and the core KPI

**Rationale.** Umami's `session_id` is a salted hash of IP plus user agent. Over the two months
covered above, ISP and mobile IP rotation makes the recurring-core series an upper bound on real
churn; the JP mobile ranges (`59.132.*`, `106.146.*`) are the known worst case. A 100 to 200 person
core cannot be managed with an identifier that decays on its own.

**The deployed tracker's contract (verified, not assumed).** `https://battlestats.online/umami/script.js`
minifies to:

```js
P = (t, e) => ("string" == typeof t && (q = t), R = "",
      C({ ...U(), data: "object" == typeof t ? t : e }, "identify"));
window.umami = { track: J, identify: P };
```

So the call is `umami.identify(distinctId: string, data?: object)`. A string argument assigns the
module-scoped `q`, which `U()` then attaches as `id` to **every subsequent payload**; the call also
clears the cache token `R` and POSTs a `{type:'identify'}` request. Three consequences:

- The identify call must happen **once per page load**, and everything tracked after it carries the
  id. The tracker auto-sends its first pageview at `readyState === 'complete'`, which may precede
  our call, so that one pageview can lack the id. This is acceptable: the explicit `identify`
  request is what sets `session.distinct_id` server-side.
- The tag is `<script defer>` in `<head>` (`client/app/layout.tsx:50`), so `window.umami` can be
  undefined when React mounts. A bounded poll is required; do not assume presence.
- The tracker posts with `credentials: 'omit'` and honours a `localStorage['umami.disabled']`
  opt-out. Cookies are not in play, so localStorage is the only durable store available.

**Implementation.**

- `client/app/lib/visitorId.ts`: read `bs-vid` from localStorage; if absent, mint a UUID and store
  it. Use `crypto.randomUUID()` when available with a `crypto.getRandomValues` fallback (ios
  Safari below 15.4 lacks `randomUUID`, and ios is 28 of 200 sessions). SSR-safe: return `null`
  when `window` is undefined. Every localStorage access wrapped, since Safari private mode throws.
- Extend `client/app/lib/umami.ts`. It currently declares only `window.umami.track`; add `identify`
  to the `Window` interface and export `identifyVisitor()` under the same never-throw contract as
  `trackEvent`.
- `client/app/components/VisitorIdentity.tsx`: a render-nothing client component that polls for
  `window.umami` (200 ms interval, ~5 s ceiling), calls `identifyVisitor()` exactly once, and
  clears its timer on unmount. Mount it inside the existing provider stack in `layout.tsx` so it
  runs on every route. Bounded by construction: no unbounded polling (doctrine).

**Privacy stance: a deliberate change, not an implication.** Umami's default posture is
cookieless and identifier-free, and part of why it needs no consent banner is that it stores no
durable per-device id. `bs-vid` *is* a durable per-device identifier, so adding it is a decision
taken knowingly, not a side effect. The judgement made here: the value is an opaque random UUID in
first-party localStorage, used only to count how many distinct people come back to our own domain;
it carries no account linkage, no fingerprinting signal, and no cross-site meaning; clearing site
data resets it; and it is never joined to anything else. EU-plus-EEA visitors are roughly 15% of
sessions, so if the consent posture is ever revisited this is the row to look at first. Operator
traffic is unaffected: Umami's `IGNORE_IP` drops the request before any row is written, so operator
visits never acquire a `distinct_id` at all.

**Validation.**

- Frontend unit tests: stable value across calls, minted once, `null` without `window`, survives a
  throwing localStorage; `identifyVisitor` swallows a throwing tracker and no-ops when absent.
- Post-deploy, confirm the column fills:
  ```sql
  SELECT count(*) FILTER (WHERE distinct_id IS NOT NULL) AS identified, count(*) AS sessions
  FROM session
  WHERE website_id = '27c0ee6a-f534-42d4-b49f-27bbadad9848'
    AND created_at >= now() - interval '2 days';
  ```
- **Contingency, because this cannot be proven before deploy.** If `distinct_id` stays NULL after a
  day of traffic, the server build is not persisting the identify payload. Fall back to carrying
  the id as an ordinary event property (`trackEvent('visitor', { vid })`), which lands in
  `event_data` and is definitely durable, then aggregate on that instead. Do not spend time
  debugging Umami internals; the fallback answers the same question.
- KPI query once 28 days of `distinct_id` coverage exist:
  ```sql
  WITH d AS (
    SELECT s.distinct_id, count(DISTINCT date_trunc('day', we.created_at)) AS days
    FROM website_event we JOIN session s ON s.session_id = we.session_id
    WHERE we.website_id = '27c0ee6a-f534-42d4-b49f-27bbadad9848'
      AND we.created_at >= now() - interval '28 days'
      AND s.distinct_id IS NOT NULL
    GROUP BY 1
  )
  SELECT count(*) AS visitors,
         count(*) FILTER (WHERE days >= 2) AS core_2plus,
         count(*) FILTER (WHERE days >= 4) AS core_4plus,
         count(*) FILTER (WHERE days >= 8) AS core_8plus
  FROM d;
  ```
- Expect an apparent step up in retention on the day this ships, because the instrument improved
  and not the audience. Annotate the date wherever the series is reported.

**Risk.** Low. Analytics-only, no visible change, fails closed on every path.

## 4. Workstream B: Open Graph cards that carry actual numbers

**Rationale.** `client/app/player/[playerName]/page.tsx:28` emits `openGraph` with no `images` and
`twitter: { card: 'summary' }`; `client/app/ship/[shipSlug]/page.tsx:31` and
`client/app/clan/[clanSlug]/page.tsx:29` match. No `opengraph-image` route exists anywhere under
`client/app`. Descriptions are data-free template strings ("Player statistics for X on World of
Warships"). Every link pasted into X, Discord, or a forum is therefore a text stub, and the one
measurably converting social channel is card-driven.

**Implementation.**

- Add `opengraph-image.tsx` to each dynamic segment (`player/[playerName]`, `ship/[shipSlug]`,
  `clan/[clanSlug]`) using `ImageResponse` from `next/og` (present in Next 16.2.7). Size
  1200×630, `alt`, and `contentType` exported per the App Router convention.
- Card content: entity name plus the two or three numbers that make the page worth opening.
  Player: win rate, battles, and last-played recency. Ship: tier/class identity and the board
  window. Clan: tag, member count, clan win rate. Reuse the win-rate colour scale so a card looks
  like the product.
- Data comes from the existing backend endpoints, server-side, via `BATTLESTATS_API_ORIGIN`
  exactly as `client/app/sitemap.ts:6` already does: `/api/player/<name>/?realm=<realm>` and
  `/api/clan/<id>`. Ship cards use the payload-only identity already available from the slug, so
  they need no fetch at all.
- **No new upstream load.** These endpoints are cache-first; the OG route must never block on a
  cold warm-up and must never trigger a Wargaming call (doctrine: avoid new browser-triggered WG
  calls when stored data exists). Short timeout, and on any failure fall back to a name-only card
  that still looks deliberate.
- Set `revalidate` so a card is not regenerated per scrape.
- Upgrade `twitter.card` to `summary_large_image` once images exist, and put the real numbers into
  the `description` string too, since some clients render text only.

**Validation.** Unit tests asserting each segment's metadata now carries `images` and
`summary_large_image`, and that the card route's data helper degrades to name-only on a failed
fetch. Then render each route locally, inspect the PNG, and validate the deployed URLs in X's card
validator plus a Discord paste.

**Related.** This executes `runbook-seo.md` Priority 4, open since 2026-03-31. Update that
runbook's status when this ships rather than leaving two sources of truth.

**Risk.** Low to medium. `ImageResponse` renders at request time; a slow card route degrades link
previews, not pages. Keep the card cheap and cached.

## 5. Workstream C: restore the share affordance

Commit `ff6677e` removed `handleShare`, the `shareState` copy feedback, the buttons, and their
tests from `client/app/components/PlayerDetail.tsx` and `client/app/components/ClanDetail.tsx`;
its own message names `player-share` and `clan-share` as now-dead events.

Restore one quiet copy-link control on each of the two headers, re-emitting those same event names
so the historical series reconnects. Three details from the original are worth preserving: the
transient copied/failed feedback (1.8 s), the `aria-label` ("Copy shareable player URL"), and the
realm-qualified canonical URL, which is also what makes Workstream B pay off. `navigator.clipboard`
is unavailable on insecure origins and in some in-app browsers, so the failure branch must stay.
Restore the tests deleted alongside the buttons, and add the two event names back to
`runbook-umami-event-reference-2026-06-18.md`.

## 6. Workstream D: cold arrivals

44.5% of visits are one pageview with zero interaction in under ten seconds, concentrated on `/`.
A cold visitor must type a player name before the site shows them anything, and landing arrivals
are the population least likely to have a name in hand.

**D1, implemented: remember the last-viewed player.** Persist it under a `bs-`prefixed localStorage
key alongside the existing `bs-theme`, `bs-realm`, `bs-shell`, `bs-ship-leaderboard`,
`bs-landing-ship-view`, and `bs-bh-ships-slider`, and offer a one-click return on the landing page.
This targets the 43 returning session ids that already produce 41% of pageviews, and costs a
first-time visitor nothing (the control renders only when a value exists). It must not shift
layout on hydration: read after mount, render nothing until then.

**D2, deferred: seed the empty state with something live.** The landing page already carries a
filter-correlated ship treemap and an inline ship leaderboard, so the surface is not empty; the gap
is that nothing on it is about *you*. A named example profile might convert a slice of the bounce
mass. This is the least evidenced item in the analysis and landing→entity conversion is already
improving unaided (35.4% → 44.1%), so it stays a follow-up rather than shipping on a hunch.

**Validation for C and D1.** `player-share` and `clan-share` reappear in the event table within
days of deploy. For D1, watch the bounce segment share and landing→entity conversion with the
segmentation query in section 8; both need two full weeks post-deploy before they mean anything.

## 7. Measurement traps (read before quoting any Umami delta)

Two mistakes were made and corrected while producing this runbook. Both will recur.

1. **Never compare custom-event totals across a release boundary.** `git log -- VERSION` shows
   3.7.0 through 4.0.0 all shipped on 2026-07-15, exactly where a 14-day comparison window splits,
   and 4.0.1 through 4.6.4 shipped 07-16 to 07-27. Twelve event names appeared or vanished across
   that boundary. An apparent halving of the Population tab (46 → 24 visitors) was entirely commit
   `5ea0bf5` (07-21, profile/population tab restructure) removing the event, not lost interest.
   Check first-seen and last-seen dates per event before reading any delta:
   ```sql
   SELECT event_name, min(created_at)::date AS first_seen,
          max(created_at)::date AS last_seen, count(*) AS n
   FROM website_event
   WHERE website_id = '27c0ee6a-f534-42d4-b49f-27bbadad9848' AND event_type = 2
     AND created_at >= now() - interval '28 days'
   GROUP BY 1 ORDER BY 2;
   ```
2. **Exclude one-day referral bursts from a baseline before quoting a decline.** 2026-07-08 was a
   73-visitor DCInside spike sitting inside the comparison baseline; leaving it in turned a real
   −16% into a reported −24%.

Two smaller ones. `now()`-relative windows silently include a partial current day and split the
boundary day across both buckets, so use explicit date bounds. And the operator-IP exclusion
history is uneven (home IP from 2026-06-05, work egress `205.220.46.214` from 2026-07-20), so any
window straddling 07-20 could in principle be contaminated; it was checked and is clean, only 7
US-MA sessions exist across the last 35 days.

## 8. Reproducing the analysis

The droplet does not trust every dev box's SSH key. The `umami` database sits on the same managed
Postgres cluster as `defaultdb`, so it can be read directly with the battlestats credentials and no
SSH at all:

```bash
set -a; . server/.env; . server/.env.secrets; set +a
PGPASSWORD="$DB_PASSWORD" psql \
  "host=$DB_HOST port=$DB_PORT dbname=umami user=$DB_USER sslmode=require" \
  -P pager=off -c "SET statement_timeout='60s'" \
  -c "SET default_transaction_read_only = on" -f <queries.sql>
```

Always set the read-only guard and a statement timeout: this is the production cluster, shared with
the app and with Oturu. Every query must filter
`website_id = '27c0ee6a-f534-42d4-b49f-27bbadad9848'`, or it silently merges three sites.

Visit segmentation, SPA-aware (a tab click is a custom event, not a pageview, so "one pageview" is
not a bounce on this site):

```sql
WITH v AS (
  SELECT visit_id,
         count(*) FILTER (WHERE event_type=1) AS pv,
         count(*) FILTER (WHERE event_type=2) AS ev,
         extract(epoch FROM (max(created_at)-min(created_at))) AS dur
  FROM website_event
  WHERE website_id = '27c0ee6a-f534-42d4-b49f-27bbadad9848'
    AND created_at >= '2026-07-16'::date AND created_at < '2026-07-30'::date
  GROUP BY 1
)
SELECT CASE
  WHEN pv <= 1 AND ev = 0 AND dur < 10 THEN '1 bounce'
  WHEN dur < 10  THEN '2 glance'
  WHEN dur < 60  THEN '3 brief'
  WHEN dur < 300 THEN '4 engaged'
  ELSE '5 deep' END AS segment,
  count(*) AS visits, sum(pv) AS pageviews, sum(ev) AS events
FROM v GROUP BY 1 ORDER BY 1;
```

## 8b. As-built (2026-07-29)

Four workstreams landed on `feat/audience-growth-instrumentation`. Frontend gate at the time of
writing: **jest 63 suites / 460 tests green, eslint clean, `next build` clean, `tsc --noEmit`
clean.** Three implementation decisions diverge from the spec above and supersede it.

**A — visitor identity.** `client/app/lib/visitorId.ts` (`bs-vid`, `crypto.randomUUID` with a
`getRandomValues` v4 fallback for ios Safari < 15.4), `identifyVisitor()` in
`client/app/lib/umami.ts` (`identify` typed **optional** on the `Window` interface so an older
tracker is simply "no identity"), and `client/app/components/VisitorIdentity.tsx` mounted in
`layout.tsx` behind the same `enableUmami` gate as the tracker tag. A failed persist returns
`null` and the visit stays unidentified: a per-load id would inflate the very count the KPI reads.
Tests: `visitorId.test.ts`, `VisitorIdentity.test.tsx`.

**B — cards. Divergence 1: a route, not the file convention.** `opengraph-image.tsx` receives
`params` but **no `searchParams`**, so a conventional card cannot know the realm — and realm is not
cosmetic. The same nickname can be two unrelated accounts on two realms, and ASIA outdraws NA in
pageviews here, so a realm-blind card would confidently show the wrong player's numbers. The card
is therefore `GET /og?kind=player|clan|ship&…` (`client/app/og/route.tsx`), built by
`generateMetadata`, which *can* read `searchParams`. It cannot live under `/api/*`:
`next.config.mjs` rewrites that whole prefix to Django. Cache-Control
`public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400`. Card composition is pure and
separate from the renderer (`buildPlayerCardProps` etc. in `ogCard.ts`) so the decisions are
testable without invoking Satori. The root layout now advertises the parameterless `/og` as the
default card.

**Divergence 2: the numbers stay out of `description`.** The spec called for numbers in the text
description too. Doing that means fetching in `generateMetadata`, which sits on the HTML critical
path for *every visitor*, versus the card route, which is reached only when a crawler scrapes a
shared link. The image carries the numbers; the description stays data-free. Reversible if a
text-only client ever matters more than TTFB.

**No server-side cache, by construction.** The handler reads `searchParams` off `request.url`, so
the route is permanently dynamic and Next will not cache it whatever `revalidate` says. Caching is
therefore entirely downstream: the `Cache-Control` header plus X's and Discord's own card caches.
Every scrape reaches Django. At crawler volume against cache-first endpoints that is negligible,
but do not read "1h max-age" as "one upstream call per hour" — nothing enforces that here. If card
traffic ever shows up in the Django logs, put a cache in front of `/og` rather than reaching for
`revalidate`.

**Known limitation: a bare link still guesses the realm.** `generateMetadata` reads
`searchParams.realm`, so `/player/Name` with no query builds a `realm=na` card — and that is the
most common organic link shape (search results, older pastes). Two mitigations, one full and one
partial: `CopyLinkButton` always appends the realm, so every product-originated link is exact; and
`fetchPlayerOgCard` now reads the `X-Resolved-Realm` header the player endpoint already sets, so a
player who simply does not exist on NA gets the correct realm on the card via the backend's
cross-realm fallback. The residual case stays wrong: a name that exists on **both** NA and ASIA,
shared without a realm, will render NA's account. Fixing that needs a realm in the URL, which is
what the share button produces.

Route-handler behaviour (kind dispatch, the clan-slug guard, 80-char label truncation, and the
never-fail contract) is covered in `client/app/og/__tests__/route.test.ts` with `next/og` stubbed,
so the assertions are about what the card was asked to draw rather than the pixels.

Verified by rendering against the live public API (`BATTLESTATS_API_ORIGIN=https://battlestats.online`,
`next start`, PNG inspected):
- player `Nagashino_SB_Nori` ASIA → 55.5% win rate (green on the shared WR scale), 22,641 random
  battles, "played today", `[AKZK]` subtitle.
- clan `2000010922` ASIA → `[PRIDE]`, 56.6% clan win rate, 28 members. Tag-equals-name collapses
  to `[PRIDE]` rather than reading "[PRIDE] PRIDE".
- ship → name plus window subtitle, no fetch at all.
- unknown kind / missing params / upstream 404 → branded card, HTTP 200, never an error.
- **CJK glyphs render** (checked with `大和 Yamato`), which matters because JP and KR are the #2 and
  #3 countries. Note it may involve a runtime font resolution inside `next/og`; if card latency
  ever regresses, that is the first thing to look at.

**C — share.** The two former call sites duplicated identical logic, so the restore is one shared
`client/app/components/CopyLinkButton.tsx` parameterised by event name, wired into
`PlayerDetail.tsx` and `ClanDetail.tsx`. Original details kept: 1.8 s copied/failed feedback,
`aria-label`, realm-qualified URL, and the failure branch for insecure origins / in-app browsers
where `navigator.clipboard` is absent. Tests: `CopyLinkButton.test.tsx` plus a wiring assertion in
each of the two component suites.

**D1 — cold arrivals.** `client/app/lib/lastViewedPlayer.ts` (`bs-last-player`) is written in
`PlayerRouteView` **after** the fetch resolves, so a 404 or an abandoned load never becomes the
landing page's offer. `LastViewedPlayerLink.tsx` reads it after mount (a localStorage read during
render would be a hydration mismatch), renders nothing and reserves no space for a first-time
visitor, and emits the `landing-last-player` event. **D2 remains deferred.**

**D1 widened to three entries (2026-07-30).** The key now holds an **array**, most recent first,
capped at 3; the row reads `Last viewed:` with names separated by `·` (middle dot) and **no realm tag**.
**Deployed to production 2026-07-30 in v4.9.0**, verified live: a legacy single-object value migrates
rather than vanishing, three entries render, and a first-time visitor still sees nothing. Identity
is `(realm, name.toLowerCase())` and a re-view **moves to front**, so repeat visits to one player
cannot fill every slot. The read is shape-tolerant (`Array.isArray`), so the legacy single-object
value survives the deploy rather than dropping the affordance for exactly the returning visitors it
serves. `landing-last-player` keeps its name (history stays comparable) and gains a 1-based
`position` prop — the only way slots 2 and 3 can later be shown to earn their space. Spec:
`agents/work-items/landing-recent-players-spec.md`.

The same change fixed a latent **cross-realm double-write**: `PlayerRouteView` wrote with the
*requested* realm, then the fallback branch called `setRealm(resolved)`, and `realm` sits in the load
effect's deps, so the effect re-ran and wrote a second time. One slot masked it; three slots would
have shown the same player twice, one entry under a realm that account does not exist in. The write
now stores the **resolved** realm, making both writes one identity that dedup collapses. Regression
test: `PlayerRouteView.test.tsx`, "remembers a cross-realm player once".

**Visual verification (2026-07-30).** The landing "Last viewed" row **has now been checked** in
light and dark, plus the empty state, via Playwright against the live API. The blocker recorded
below was the bundled `playwright-core` looking for chromium build 1208; this box has **1234**
installed at `/home/august/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`, so pass that
as `executablePath` instead of `chromium.executablePath()`. The header **Share button remains
visually unverified**.

## 9. Assertion ledger (QA)

Verified 2026-07-29 against the working tree at `203f34e` and the live tracker.

| assertion | evidence |
|---|---|
| `session.distinct_id` exists, unused | migrations through `13_add_revenue`, `10_add_distinct_id` applied; `count(*) WHERE distinct_id IS NOT NULL` = 0 |
| `umami.identify(id, data?)` is the signature | minified `P=(t,e)=>(...)` in the deployed `/umami/script.js`; `identify:P` on `window.umami` |
| tracker is deferred in `<head>` | `client/app/layout.tsx:50` |
| `umami.ts` declares only `track` | `client/app/lib/umami.ts` `Window` interface |
| no OG images anywhere | `find client/app -iname '*opengraph*'` empty; `twitter: { card: 'summary' }` at player `page.tsx:35` |
| OG metadata line numbers | `openGraph` at player `:28`, ship `:31`, clan `:29` |
| `next/og` available | `next@^16.2.7`, `client/node_modules/next/og.js` present |
| server-side API origin precedent | `client/app/sitemap.ts:6` reads `BATTLESTATS_API_ORIGIN` |
| detail endpoints | `/api/player/<name>/?realm=` (`PlayerRouteView.tsx:98`), `/api/clan/<id>` (`ClanRouteView`) |
| share removal commit + contents | `ff6677e`, touching `PlayerDetail.tsx` (−47), `ClanDetail.tsx` (−59) and their tests |
| `player-share` 14 events / 12 visitors, 06-06 → 06-23 | `website_event` all-time aggregate |
| `clan-share` never fired | same query returns no row for it |
| Population tab drop is a code change | `git log -S player-insights-population` → `5ea0bf5` (2026-07-21) |
| existing `bs-` localStorage keys | grep of `client/app` |
| `/api/*` is rewritten to Django (so `/og` cannot live there) | `client/next.config.mjs:32-39` |
| clan payload exposes `cached_clan_wr` | `ClanSerializer` is `fields = '__all__'`; live `GET /api/clan/2000010922?realm=asia` returns it |
| `pvp_ratio` is a percentage, not a ratio | live player payload: `55.46` for a 55.5% player |
| the clan endpoint is realm-scoped and 404s on the wrong realm | same clan id returns 404 on na/eu, 200 on asia |

## 10. Follow-ups

- [x] ~~Visually verify the landing "Last viewed" line~~ — done 2026-07-30, light + dark + empty
      state. The block was a build-number mismatch, not a missing browser: point `executablePath`
      at the installed `chromium-1234` (see section 8).
- [ ] **Visually verify the Share button** in a browser, light and dark, before deploying.
- [ ] After the 3-entry row has run a while, check `landing-last-player` by `position`: if slots 2
      and 3 draw ~no clicks, the row should shrink back rather than keep the space.
- [ ] Confirm `session.distinct_id` actually fills after deploy (query in section 3). If it stays
      NULL, switch to the event-property fallback rather than debugging Umami internals.
- [ ] D2: landing-page seeded example. Deferred by decision 5; revisit only if the bounce segment
      fails to move after D1.
- [ ] Decide whether the KPI query becomes a `.claude/skills/audience/SKILL.md` readout, in the
      shape of the existing `observation` / `crawl-yield` / `recapture` skills. It is a read-only
      periodic question, which is exactly what those skills are for.
- [ ] Check Google Search Console coverage for player and ship pages. Bing refers 33 visitors to
      Google's 8, which is backwards for a site with a curated entity sitemap; thin indexation is
      the likely cause and it is the largest untapped discovery channel.
- [ ] Update `runbook-seo.md` (Priority 4, OG images) when Workstream B ships.
- [ ] Re-run the recurring-core table 28 days after Workstream A deploys and compare the
      `session_id` and `distinct_id` series side by side once, to quantify how much of the
      historical decay was identifier churn rather than lost people.
- [ ] Every version bump requires `./client/deploy/deploy_to_droplet.sh battlestats.online`
      afterward, since `NEXT_PUBLIC_APP_VERSION` is captured at build time. All four workstreams
      are frontend, so this is non-negotiable for each.

## Related

- `agents/runbooks/runbook-seo.md`: metadata, sitemap, JSON-LD; owns the OG deferral this runbook
  supersedes.
- `agents/runbooks/runbook-umami-event-reference-2026-06-18.md`: the event-name catalogue that
  Workstream C must re-add `player-share` / `clan-share` to.
- `agents/runbooks/runbook-umami-analytics-coverage-2026-06-17.md`: event naming conventions and
  the coverage sweep that added most current events.
- `agents/runbooks/runbook-hot-players-engagement-queue-2026-06-10.md`: the server-side
  durable-visitor-interest machinery (`EntityVisitDaily`, `HotPlayer.active_days_window`) retained
  as the alternative to Workstream A.
- `agents/runbooks/archive/runbook-audience-device-optimization-2026-06-06.md`: device and viewport mix.
