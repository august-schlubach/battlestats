# Runbook: Locale Adoption Measurement

_Created: 2026-08-10_
_Context: The locale selector shipped visible in v5.0.0 (2026-08-05). Asked "how many people are using a language other than English", the existing instrumentation could not answer it: `locale-switch` counts the act of switching, and `bs-locale` is sticky, so sustained usage emits nothing._
_Status: **`locale-active` beacon implemented** on `worktree-locale-beacon` (2026-08-10). Browser-language defaulting is analysed in section 5 and **not implemented** — it is a separate decision._

## Purpose

Records how UI-locale adoption is measured, the readout queries, the measurement traps specific to
the Umami schema, and the retroactive baseline taken before the beacon existed. Read this before
quoting any locale number or changing how the locale resolves.

## 1. Units (read this first)

Umami `session` rows are **durable, not per-day**: `session_id` hashes website + hostname + IP + UA
against a constant salt, so `session.created_at` is *first-ever-seen*.

- `count(DISTINCT session_id)` = distinct **visitors**, never sessions.
- `session WHERE created_at > now() - interval 'N days'` = **new visitors** in the window.
- The per-visit unit is `website_event.visit_id` (30-minute inactivity window).
- Every query must scope `website_id = '27c0ee6a-f534-42d4-b49f-27bbadad9848'`; three sites share
  the database.

Connect as in [`reference_umami_event_query_recipe`]: source `/opt/umami/.env` on the droplet,
never echo it.

```bash
ssh root@battlestats.online 'set -a; . /opt/umami/.env; set +a; psql "$DATABASE_URL" -P pager=off -c "<SQL>"'
```

## 2. Retroactive baseline (read 2026-08-10, before the beacon shipped)

Selector picks since the control went visible on 2026-08-05, all time:

| locale picked | events | distinct visitors |
|---|---|---|
| ja | 3 | 3 |
| ko | 3 | 3 |
| en (switched back) | 1 | 1 |

`?lang=` arrivals, all time: **0**. No localized link has ever been shared, checked across
`url_query` for every pageview on the site id.

Traffic denominator, trailing 30 days: 575 new visitors, 1,392 visits, 2,579 pageviews.

Demand side, same window, from `session.language` (the browser's own setting, captured
automatically since long before the feature): **Korean 121 new visitors** (ko-KR 94, ko 27),
**Japanese 93** (ja 81, ja-JP 12), against 575 total. Roughly **37% of new visitors arrive with a
Korean or Japanese browser, and six have ever touched the selector.**

That contrast is the finding. It is a discoverability result, not a measurement result.

## 3. Why `locale-switch` cannot answer the question

Three independent gaps, all structural:

1. **Stickiness.** `setLocale` writes `bs-locale` (`LocaleContext.tsx`), so a visitor who switched
   on 2026-08-05 and has read the site in Korean every day since emits no further event.
2. **URL overrides.** `resolveInitialLocale` honours `?lang=` but deliberately does **not** persist
   it, so those arrivals are one-shot previews that fire no switch event. Currently zero, but the
   gap is real the moment a localized link is shared.
3. **No server-side trace.** The locale never leaves the browser: Django sees no locale header, and
   the SSG shell is always English. Nothing about past locale usage can be reconstructed after the
   fact.

## 4. The `locale-active` beacon

`client/app/components/LocaleBeacon.tsx`, mounted in `layout.tsx` beside `VisitorIdentity` and
gated on the same `enableUmami` flag. On mount it fires `locale-active` with the resolved locale,
via `trackWhenReady` in `app/lib/umami.ts`.

Design decisions, each with the alternative it rejects:

- **English is reported too.** It is the denominator; without it the ko/ja counts have no share to
  be a share of.
- **One event per page load, deduped in SQL by `visit_id`, not client-side.** A `sessionStorage`
  flag is per-tab: it undercounts a same-day return and overcounts two tabs.
  **Know what "per page load" means here.** `layout.tsx` children survive App Router soft
  navigation, so the beacon mounts once per *full* load, not once per pageview — while `visit_id`
  rotates after 30 minutes of idle with no load at all. A visitor who loads once and browses for 45
  minutes by soft nav therefore emits one event across two `visit_id`s, and the second visit is
  invisible. The readout column is named `load_visits` for that reason: it is visits-containing-a-
  load, not visits. The ko/ja *share* is unaffected, since the drift has nothing to do with locale.
  Firing on pathname change instead would give true per-visit counts, at the cost of the mount-only
  rationale below; that is a deliberate trade, not an oversight.
- **Mount-only.** A mid-visit switch is already counted by `locale-switch`; re-firing would file one
  visit under two locales. The component pins the first resolved locale in a ref so the empty
  dependency array is honest rather than a lint suppression.
- **Reads `useLocale`, not `useDisplayLocale`.** The display hook reports `en` until mount (a
  hydration guard for rendered text); using it here would file every ko/ja visit under English.
- **`trackWhenReady`, not `trackEvent`.** The tracker tag is `<script defer>`, so a mount-time
  `trackEvent` routinely lands before `window.umami` exists and is silently dropped. Bounded poll:
  200 ms interval, 25 attempts, ~5 s ceiling, then it gives up. `VisitorIdentity` keeps its own copy
  of that loop deliberately — it probes `identify`, a capability that can be absent from a tracker
  whose `track` works, and it guards the `session.distinct_id` KPI.
- **`identify()` is not touched.** It carries `session.distinct_id`, the returning-visitor KPI from
  v4.7.0. A locale property is not worth perturbing it.

Cost: one extra event per page load, about 2,600 rows/month at current traffic.

**The beacon measures from deploy forward only.** It cannot backfill section 2.

### Readout

```sql
SELECT ed.string_value AS locale,
       count(DISTINCT we.visit_id)   AS load_visits,
       count(DISTINCT we.session_id) AS visitors,
       count(*)                      AS page_loads
FROM website_event we
JOIN event_data ed ON ed.website_event_id = we.event_id AND ed.data_key = 'locale'
WHERE we.website_id = '27c0ee6a-f534-42d4-b49f-27bbadad9848'
  AND we.event_name = 'locale-active'
  AND we.created_at > now() - interval '30 days'
GROUP BY 1 ORDER BY load_visits DESC;
```

Demand side, for the contrast that makes the number mean something:

```sql
SELECT split_part(language, '-', 1) AS lang, count(*) AS new_visitors
FROM session
WHERE website_id = '27c0ee6a-f534-42d4-b49f-27bbadad9848'
  AND created_at > now() - interval '30 days'
GROUP BY 1 ORDER BY 2 DESC LIMIT 10;
```

## 5. Browser-language defaulting (BUILT 2026-08-11, shipping dark)

**Status: implemented and shipping behind `NEXT_PUBLIC_LOCALE_AUTODETECT`, default off.** The
mechanism is live in the bundle; prod behaviour is unchanged until the flag flips on the droplet.
The four requirements below are what was built, and each names its landing place:

1. `detectLocale()` in `app/i18n/index.ts` — precedence in `LocaleContext.resolveInitialLocale`.
2. Nothing writes `bs-locale` but `setLocale`. Pinned by *does not persist the detected locale*.
3. `app/lib/bootScript.ts` — the head script was extracted out of `layout.tsx` into a built string
   so it could be executed in jsdom (`bootScript.test.ts`); it was untestable inline. The theme and
   realm halves are byte-identical to the previous script.
4. `isLocaleAutodetectEnabled()` in `app/lib/featureFlags.ts`, threaded into the head script as
   `buildBootScript({ autodetectLocale })` — verified in built output: the detection code is
   present in the prerendered HTML with the flag on and **absent** with it off.

Verified in a real browser (Playwright, dev against prod API, 2026-08-11), four cases:
`['ko-KR','en-US']` → ko · `['ja-JP','en-US']` → ja · `['en-US','ko-KR']` → **en** ·
`['ko-KR']` with `bs-locale='en'` → **en**. `localStorage.bs-locale` stayed `null` in every
detected case. Landing and player pages screenshotted at 1280px and 390px in both ko and ja: no CJK
wrap regression.

**What that visual pass also showed, and section 5's earlier "seven chart section headings" did
not: the player page was mostly English under any locale.** The tab strip translated; the header
stat cards, the window pills, the metric row, the treemap controls and the ships-table headers did
not. Dictionary coverage measures the *dictionary*, not *call-site wiring* — those labels had no
`t()` call to resolve at all (`PlayerDetail.tsx` held zero).

**Fixed the same day — see section 5b.** The operator's call on being shown this was to wire the
player page before flipping detection, so the flag lands on the product the decision assumed.

The original analysis follows, unchanged, as the record of why each requirement exists.

The measured problem is discoverability: 37% CJK-browser arrivals, six selector users. Defaulting
the initial locale from `navigator.languages` is the direct answer. What it would take:

1. **Precedence becomes** `?lang=` > `bs-locale` > first supported primary subtag in
   `navigator.languages` > `en`. Walking the *array in order* matters: a visitor with
   `['en-US','ko-KR']` prefers English, and matching on the primary subtag folds `ko-KR`→`ko`,
   `ja-JP`→`ja`, `en-GB`→`en`.
2. **Do not persist the detected value.** `bs-locale` must stay the record of an *explicit* choice.
   This is what lets a Korean-browser visitor who picks English stay in English forever
   (`setLocale('en')` writes the key, which outranks detection), and it lets a refined mapping take
   effect for everyone who never chose.
3. **Mirror the mapping into the head script in `layout.tsx`.** That script stamps `lang` /
   `data-lang` before paint from `localStorage` alone; leaving detection to React only means the
   CJK typography rule (`:root[data-lang="ko"] .uppercase`) misses the first frame. `navigator` is
   available there.
4. **Gate it** behind a `NEXT_PUBLIC_LOCALE_AUTODETECT` flag, the same shape as
   `NEXT_PUBLIC_LOCALE_SELECTOR`.

**Sequencing:** deploy the beacon first and let it run several days. It converts this from a guess
into a before/after: the `locale-active` ko/ja share should move from near zero toward the ~37%
browser-language share. Flipping detection at the same time as the measurement would leave no
baseline to compare against.

**The residue is a decision, not a backlog — corrected 2026-08-10.** An earlier draft of this
section called the untranslated keys a gap to close before flipping detection. That was wrong.
`ko.ts`'s `NEEDS-NATIVE-CHECK` block omits each of them on the record: unattested connectives
(`vs`, `timeline`), our own coinages (`efficiencyBadges`, `tabsAriaLabel`), `winRateVsSurvival`
(생존율 has no corpus hit), and `landing.treemap.infoLabel` (the panel it opens is out of
localization scope, so a translated trigger would announce an English panel). The project's
standard is to omit rather than guess, and a missing key degrades to English by design.

One key was a genuine gap: `footer.lastViewed` arrived with v4.9.0, after the triage pass, and was
never sorted either way. Shipped 2026-08-10 under the generic-chrome tier. Coverage was 67/76
(88%) at that point, and `dictionaries.test.ts` pins the residue so nothing goes untriaged again.
After the 2026-08-11 player-page round it reads **93/103 (90%)** — 27 keys added, 26 translated,
one (`battleHistory.tile.windowWr`) added straight to the pinned residue with its reasoning.

**What this means for detection.** The nine stay English until a native speaker clears them, so
auto-defaulting ships a UI that is Korean or Japanese except for seven chart section headings on
the player page. Decision of 2026-08-10: **flip anyway** after the baseline. A mostly-translated
interface the visitor did not have to find beats a fully English one they never chose. Note the
over-reach honestly: most Korean Chrome installs report `['ko-KR', 'en-US']` regardless of whether
the user reads English comfortably, so even correct ordering of `navigator.languages` will flip
some English-preferring visitors; the selector plus the explicit-choice persistence in point 2 is
what makes that recoverable in one click.

**Not a cloaking risk.** The SSG shell stays English and translation happens client-side after
mount, so crawler-visible output does not change.

## 5b. Player-page wiring (2026-08-11, prerequisite to the flip)

Three components, previously untouched by `t()`: `PlayerDetail.tsx` (the four summary cards, the
recency and refresh meta lines, the share control's accessible name, the hidden-account notice),
`BattleHistoryCard.tsx` (window pills, span header, mode caption, the six totals tiles, four of the
eight ships-table column headers) and `BattleHistoryTreemaps.tsx` (the `battles ×` header and both
mini-treemap titles).

**A corpus pass came first, and corrected the research doc twice.** Against
`asia.wows-numbers.com/{ko,ja}/player/<id>/`, whose summary table is the closest register match
that exists to our card row:

- **Survival** is `생존` / `生還`, not the long-predicted `생존율` / `生存率` — the percentage is
  the value, so the label is the bare noun. The doc's "Not verified" entry had read as "no word
  exists"; the word exists, the guess at its shape was wrong.
- **KDR** is `격침 비율` / `キル/デス比` and **Frags/Battle** is `함선 격침` / `艦船撃沈`,
  both identifiable because their values match ours row for row.

**What stays English is a ruling, not a gap**: `PvP`/`PvE` (absent from both corpora as display
text — only as URL query values), `Window WR` (our own framing of a span; omitted in both
dictionaries and pinned in `dictionaries.test.ts`), the `WR %` / `Overall WR %` / `F/B` columns
(the WR-stays-Latin rule), and the `WR% | dmg | Kills` pills (Latin as a set, so the control does
not go mixed-script). Long hover tooltips in the card are still English — the largest remaining
surface, and the obvious next round.

**The screenshot pass earned its place again — third time.** Wiring the table headers made `티어`
and `함종` wrap **per character** in the narrow `<th>`s at 390px, and `전투 수 ×` do the same in
the treemap header: CJK has no spaces, so it breaks anywhere. 638 green tests, a clean lint and a
clean production build all coexisted with it, because jsdom does no layout. Fixed with
`whitespace-nowrap` on both. **Never ship a CJK string into a width-constrained control without
looking at it at 390px.**

English is byte-identical throughout, which is deliberate and asserted: `player.stats.winRate`
('Win Rate') is a *separate key* from `common.winRate` ('Win rate') precisely so wiring the card
could not silently restyle live English text — the casing trap the locale spec already recorded.
The one exception is `battles ×` → `Battles ×`, a source-case change only: that label's container
carries `uppercase`, so English still paints `BATTLES ×`.

## 6. The daily traffic email carries this readout

`server/scripts/daily_traffic_email.py` (timer `battlestats-traffic-digest`, 10:30 UTC) grew a
**Language** section on 2026-08-10, so the numbers above arrive daily without anyone running SQL.
It prints two tables that must never be read as one:

- **UI locale in effect**, from `locale-active`. Denominator: beacon-reporting visitors, *not* the
  day's visitors, since a visitor on a cached pre-v5.2.1 bundle reports nothing.
- **Browser language**, folded to the primary subtag. Denominator: every visitor, since one
  language per session partitions the day exactly.

Both shares are computed in Python (`_locale_summary`) and printed with their denominators stated
in the email body, because 13% beside 45% reads as a 32-point shortfall unless the reader is told
they are different populations. A day before the beacon shipped renders as **unmeasured**, never as
0%. Neither query takes a `LIMIT`: a truncated row set would silently shrink a denominator.

They can also differ in **span**, not just population. When the beacon saw under
`UI_COVERAGE_CAVEAT_PCT` (90%) of the day's visitors, the section says so outright. The motivating
case is 2026-08-10 itself: the beacon deployed at 15:49 UTC, so the first live send (2026-08-11)
reports a UI figure covering roughly eight hours against a browser figure covering twenty-four.
The check is generic rather than date-pinned, so it also catches stale-bundle drift later and goes
quiet on its own from 2026-08-11 onward.

The model that writes the lead paragraph gets **only the two pre-computed percentages**, never the
counts behind them — the same withholding rule the rest of that script already follows, since
handed both operands it divides one by the other and calls the browser ceiling usage. The payload
key set is pinned by `test_payload_keys_are_an_explicit_allowlist`.

## 7. Assertion ledger

Verified against the working tree at `worktree-locale-beacon` and prod Umami on 2026-08-10:

| assertion | how verified |
|---|---|
| `locale-switch` fires with a `locale` property | `LocaleSelector.tsx handleLocaleChange` |
| `?lang=` is not persisted | `LocaleContext.tsx resolveInitialLocale` (no `setItem` on the URL branch) |
| head script reads only `localStorage` for the locale | `layout.tsx` inline script |
| 7 switch events, 6 non-English, 0 `?lang=` arrivals | prod Umami, section 2 queries |
| ko/ja dictionaries at 67/76 keys after `footer.lastViewed`; 93/103 after the 08-11 round | `dictionaries.test.ts` coverage line |
| the other 9 are documented omissions, not a backlog | `ko.ts` NEEDS-NATIVE-CHECK block; research doc |
| beacon behaviour (7 cases) | `app/components/__tests__/LocaleBeacon.test.tsx` |
| email Language section, both denominators | `test_daily_traffic_email.py` `LocaleTests` + `RenderTests` |
| the email section against real prod data | dry run on the droplet, 2026-08-10, day 2026-08-09 — exercised the **unmeasured** branch only, since that day predates the beacon; the populated branch is fixture-tested and first runs live on 2026-08-11 |

Added 2026-08-11 with the autodetect build:

| assertion | how verified |
|---|---|
| detection precedence + non-persistence | `LocaleContext.test.tsx` autodetect block (7 cases), `detectLocale.test.ts` (6) |
| the head script's own branches | `bootScript.test.ts` evaluates the real string in jsdom (10 cases) |
| the flag actually reaches the built HTML | `grep navigator.languages .next/server/app/index.html` — present with the flag on, absent with it off |
| the four browser cases and no CJK wrap regression | Playwright, dev server against the prod API, ko/ja at 1280px and 390px |
| the player page is mostly English under a detected locale | same screenshots — see section 5 |
| first live traffic email carrying the Language section | droplet journal, 2026-08-11 10:31 UTC: `[ok] sent: … traffic 2026-08-10` |
| beacon baseline, first 27h | prod Umami: en 50 load-visits, ja 5 (2 visitors), **ko no row**, against 18 ko-browser and 26 ja-browser visits in the same window |

Added 2026-08-11 with the player-page wiring (section 5b):

| assertion | how verified |
|---|---|
| 생존/生還, 격침 비율/キル/デス比, 함선 격침/艦船撃沈 | Firecrawl scrape of `asia.wows-numbers.com/{ko,ja}/player/2013061726,…/`, summary-table rows quoted in the research doc |
| PvP/PvE absent as display text | same two scrapes: zero hits outside `?type=` URL values; namu.wiki `월드 오브 워쉽` also zero |
| the wiring works (not just the dictionary) | `PlayerDetailLocale.test.tsx` (6) + `BattleHistoryCard.test.tsx`'s locale block (4), rendered under the real dictionaries, each asserting the English literal is *gone* |
| English is byte-identical | the English case in both suites, plus the deliberate `battles ×` → `Battles ×` source-case exception noted in 5b |
| no CJK wrap regression | Playwright at 1280px and 390px, ko and ja, dark and light — this is what *found* the two wraps |
| `Window WR` omission is deliberate | `dictionaries.test.ts` `NEEDS_NATIVE_CHECK` + a test asserting it still renders English under ko |
