# Runbook: Shareable Ship Standings (`/ships/<bucket>`) and Data-Bearing Ship OG Cards

_Created: 2026-08-20_
_Context: The landing ship leaderboard had no shareable address. A Discord conversation about "the best T9 destroyers" could not be answered with a link: `/` renders one board whose bucket, percentile, and column all live in component state and localStorage._
_Status: **Implemented** on `feat/history-ship-modal`. Verified locally against production data; see section 6._

## Purpose

Two Share buttons, one new route, and two Open Graph card kinds, so that a ship-standings view can
be pasted into Discord and render a preview naming the actual top three by the sort the sharer was
using.

Read this before touching the ship leaderboard's state, the `/og` route, or `lib/tableSort`.
Section 3 records the failure mode the whole feature turns on; it is invisible in dev and only ever
misbehaves on a recipient's screen.

## 1. What shipped

| Surface | Share button copies | Preview card |
|---|---|---|
| Ship list (landing + `/ships`) | `/ships/<bucket>?realm&wr&sort&dir` | `kind=shiplist`: top 3 ships |
| Drill-down player board | `/ship/<id>-<slug>?realm&sort&dir` | `kind=ship`: top 3 players |
| `/ship/<id>-<slug>` masthead | the page's own URL | `kind=ship`: top 3 players |

**Button placement.** The list and the drill-down share **one** button, pinned to the right end of
the tier/type filter row; only its destination changes with the view. It first sat on the section
heading for the list and on the board's "‹ Clear" row for the drill-down, which made it jump
between the two — rejected on review 2026-08-20. Verified pixel-identical across both views
(dx=0, dy=0 at 1440px). Under 768px the pills wrap and it right-aligns on the last filter line.

New files: `client/app/ships/[bucket]/page.tsx`, `client/app/ships/[bucket]/ShipBucketRouteView.tsx`,
`client/app/lib/tableSort.ts`.

## 2. Why a dedicated route rather than query params on `/`

`/` is prerendered **static**, confirmed from the `next build` route table before the decision was
made. Reading `searchParams` in its `generateMetadata` would have converted the site's most-hit
route to server-rendered-on-demand for the sake of a share button. A dedicated route keeps `/`
static.

The second benefit was not the reason but is real: 3 tiers x 5 hull types = **15 indexable pages**,
and arrivals rather than retention are the stated growth constraint
(`runbook-audience-growth-instrumentation-2026-07-29.md`). They are in `sitemap.ts`.

**The bucket is in the path; view state is in the query string.** The canonical URL is
`/ships/t10-battleships` with no query at all, so the percentile and column cannot fragment 15 pages
into hundreds of near-duplicates.

## 3. The load-bearing rule: URL > localStorage, and never write back

The ship leaderboard persists its bucket in `bs-ship-leaderboard` and its column in
`battlestats:ship-list:sort`. If those won on mount, a recipient would open a shared link and see
**their own** remembered view. The feature would fail silently, for exactly the people it was used
on, and never once in the sharer's browser.

On `/ships/<bucket>` the URL is therefore the **whole** truth:

- `ShipLeaderboard` takes an `initial` prop. When present, the localStorage restore effect returns
  early and the persist effect is suppressed.
- `useTableSort` takes `seed` + `seeded`. Seeded, it does not read the persisted column and does not
  write the chosen one.
- An **absent** `sort` param means the server's natural order, not "fall back to the stored column".
- Opening a shared link must not mutate the visitor's own preferences. Covered by a test that
  poisons both keys and asserts they are byte-identical afterwards.

This mirrors the documented locale precedence (`?lang=` > `bs-locale` > autodetect, where autodetect
never persists). Realm needs no work here: `RealmContext` already lets an explicit `?realm=` win.

The landing page passes no `initial` and keeps its localStorage behaviour unchanged.

## 4. One comparator, two consumers

`sortRows` moved out of `ShipLeaderboard.tsx` into `client/app/lib/tableSort.ts`, which also holds
`applySort` (null = natural order) and `parseSort` (validates an untrusted key/dir against the
columns a table actually has, falling back to natural order).

The card renderer and the table now rank with the same function. Two copies would eventually
disagree, and the disagreement would only ever be visible in a preview nobody re-checks.

## 5. Card composition

Both builders map onto the existing `OgCardLayoutProps`; there was no new Satori work.

- **Metric shown** is the sorted-by column. A name sort and the natural order both fall back to win
  rate; a card headlined by alphabetical position would be absurd.
- **WR tint only for win rate.** `OgStat.winRate` colours the value, so tinting a damage figure
  green because the win rate is high would be a lie the reader cannot see.
- **Entry labels truncate at 18 characters.** Three uppercase 24px labels past that push the row
  wider than the 1200px card. Enforced in the builder, not the layout, so it is unit-testable.
- **`pending` is checked BEFORE row count.** A cold WR-percentile bucket returns `pending: true` with
  no rows and otherwise reads exactly like an empty bucket. It renders a "being computed" note. This
  is the same bug class as the 2026-08-12 combat-profile defect.
- **Realm is mandatory**, via the existing `resolveOgRealm`. `/og`'s own comment already records why
  a realm-blind card confidently shows the wrong numbers.

### Reversing the "payload-free ship card" decision

`buildShipCardProps` (2026-07-29) was deliberately data-free, on the stated grounds that "the
leaderboard aggregation is far too heavy to run per scrape". **Measured 2026-08-20 against
production, that no longer holds:**

```
/api/realm/na/ships?tier=10&type=Battleship&wr_pct=50   200  0.19s / 0.15s warm
/api/realm/na/ship/4074714832/leaderboard               200  0.41s / 0.13s warm
```

Both are cache-first, and the board endpoint is the same call the `/ship` page already makes on
every visit. A scrape is further bounded by the route's 1h ISR (`OG_REVALIDATE_SECONDS`) and the 2s
abort in `fetchEntityJson`. The cost is one cached read per URL per hour, so the card is now
data-bearing (`buildShipBoardCardProps`).

`/ship/[shipSlug]`'s `generateMetadata` now adds `&id=` to the OG URL. **A link shared before this
change carries no `id` and still renders**, name-only.

## 6. Verification

Screenshots prove nothing about a link preview. What was actually checked, with the dev server
proxying `BATTLESTATS_API_ORIGIN=https://battlestats.online`:

```bash
# the tag is in the SERVER html, not injected client-side
curl -s 'localhost:3055/ships/t10-battleships?realm=na&wr=50&sort=avg_damage&dir=desc' \
  | grep 'og:image'

# the card renders, and matches the page
curl -s -o card.png 'localhost:3055/og?kind=shiplist&bucket=t10-battleships&realm=na&wr=50&sort=win_rate&dir=desc'
curl -s -o card.png 'localhost:3055/og?kind=ship&id=4074714832&label=Bungo&realm=na'
curl -s -o card.png 'localhost:3055/og?kind=shiplist&bucket=t7-frigates&realm=na'   # -> branded default
```

Results: the WR-sorted card named Aki 63.2% / Bungo 63.1% / Sete de Setembro 61.2%, identical to the
live board. A malformed bucket fell through to the branded default card, never an error.

Browser check of the precedence rule, with both localStorage keys poisoned to a different bucket and
column: the page rendered T9 / DD / All sorted by avg damage, and both keys were unchanged
afterwards.

**The card renderer does not use the public origin in production.** `ogCard.ts` fetches
`${BATTLESTATS_API_ORIGIN}${path}`, pinned to `http://127.0.0.1:8888` (authority:
`/etc/battlestats-*.env` on the droplet, read 2026-08-20) — Django directly, bypassing the Next
`/api/*` rewrite. Verifying cards through the dev proxy therefore leaves the real upstream untested,
and the "never fails" contract means a broken path renders a branded card that looks deliberate.
Both new paths were checked in that exact configuration, on the droplet:

```
http://127.0.0.1:8888/api/realm/na/ships?tier=10&type=Battleship&wr_pct=50   200  0.11s
http://127.0.0.1:8888/api/realm/na/ship/4074714832/leaderboard               200  0.59s
```

Both returned populated payloads. `server/battlestats/urls.py` registers each path with and without
a trailing slash; the fetchers use the no-slash form.

Back-button behaviour on `/ships` was checked after three filter clicks: `history.replaceState`
keeps the address bar in step with the pills, and Back leaves the page rather than walking the
filter history.

**Discord caches previews per URL.** While iterating, use distinct URLs, or a fixed card will still
render stale and read as a failed fix.

## 7. Gotchas for the next person

- `next build`'s route table is the authority on whether `/` is still static. If it ever shows `ƒ`,
  something started reading request state on the landing page.
- The bucket slug is a public surface. `AirCarrier` is `carriers`, not `aircarriers`.
- `parseShipBucketSegment` returning null must stay a `notFound()`. A malformed bucket is a dead
  link, not a board of arbitrary ships.
- The `/ships` route's `h1` names the bucket from the URL and deliberately does **not** follow the
  pills; the canonical points at that bucket.

## 8. Related

- `agents/runbooks/runbook-ship-leaderboard-architecture-2026-06-18.md` — the standings pipeline
- `agents/runbooks/runbook-audience-growth-instrumentation-2026-07-29.md` — OG cards, `CopyLinkButton`
- `agents/runbooks/runbook-seo.md` — sitemap and canonical policy
