# Runbook: Locale Adoption Measurement

_Created: 2026-08-10_
_Context: The locale selector shipped visible in v5.0.0 (2026-08-05). Asked "how many people are using a language other than English", the existing instrumentation could not answer it: `locale-switch` counts the act of switching, and `bs-locale` is sticky, so sustained usage emits nothing._
_Status: **`locale-active` beacon live; browser-language autodetect LIVE in prod since 2026-08-11 21:17 UTC** (`NEXT_PUBLIC_LOCALE_AUTODETECT=1` in `/etc/battlestats-client.env` — that file is the authority, not the code default). Readouts: 5d (2026-08-13, first), **5e (2026-08-14, current)**. Section 5's original "not implemented" framing is historical._

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

## 5. Browser-language defaulting (BUILT 2026-08-11, **LIVE IN PROD since 2026-08-11 21:17 UTC**)

**Status: live.** `NEXT_PUBLIC_LOCALE_AUTODETECT=1` in `/etc/battlestats-client.env` (mtime
2026-08-11 21:17 UTC), shipped with v5.3.0. The code default is still off; **the droplet env file
is the authority, not the default and not a doc.** First readout is section 5d.
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
  exists"; the word exists, the guess at its shape was wrong. *(The ja half was later overturned
  again — see 5c.)*
- **KDR** is `격침 비율` / `キル/デス比` and **Frags/Battle** is `함선 격침` / `艦船撃沈`,
  both identifiable because their values match ours row for row. *(The Frags value was wrong in
  both languages for a reason a corpus quote cannot show — see 5c.)*

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

## 5c. Native terminology audit (2026-08-11) — what a corpus quote cannot tell you

Two independent per-language audits ran over the shipped dictionaries, briefed on ontology rather
than grammar: *does this term denote exactly the metric our UI attaches it to, in the register WoWS
players use*. They overturned three of 5b's values and corrected two standing claims. **The 5b
evidence was not careless — every citation reproduced.** It was the wrong *kind* of evidence for
two of the calls.

**Finding 1 — context-stripping (both languages, the important one).** A label borrowed from a
table can depend on a section header we do not render. `함선 격침` / `艦船撃沈` sit under
`전투 평균치` / `期間平均値` ("battle averages"), which is what made them mean *per battle*. The
same pages also use those exact strings for a **raw single-battle record count** (ja: beside 武蔵,
value **10**), so the bare form carries no per-battle sense at all. Our tile has no header — it
sits beside `전투 수 38`, a raw count — so the borrowed label read as "ships sunk, total". Every
header-free form in the corpus leads with 평균/平均. Now `평균 격침` / `平均撃沈数`.

  *Generalize this*: when lifting a label out of a dense table, check what the nearest header is
  doing. Verify the citation reproduces **and** that the borrowed position matches ours.

**Finding 2 — source tier, and the locales legitimately diverge.** ja `生還` → **`生存率`**:
`生還` is what the localization site writes, `生存率` is what the JP community writes about its own
stats (`wikiwiki.jp/nanjwows/指標` heading `### 生存率`, ×2, `生還` ×0). This doc's Register target
is the community's. **ko stays `생존`** — its localizer and its label-register evidence agree
(bare label, % in the value, no governing header, four pages across two hosts), and KO's `생존률`
appears only in prose. Divergent on purpose; do not harmonize.

**Finding 3 — ja `common.ship` was the wrong half of a pair.** Its only call site is the column
whose cells hold ship *names*, and the corpus splits the senses on one page: `艦名` heads that
column, `艦艇` is the object noun (`艦艇発見数`). Now `艦名`. Korean needs no split — its own table
heads the same column `함선`.

**Finding 4 — a locale bug outside either dictionary.** The landing window label rendered
`27 6月 – 10 8月`: `shipSeason.ts` hardcoded day-then-month order *and* read the month name from
`toLocaleDateString(undefined, …)`, i.e. **the browser's locale, not ours**. That is a contract
break, not a cosmetic one — it put a Japanese month inside an English page for any ja-browser
visitor, and `?lang=` could not override it. Now locale-aware and numeric in CJK
(`6월 1일–30일` / `6月1日–30日`), with the English branch pinned to `en-GB` so no formatter here
can consult the browser again. Covered by `app/lib/__tests__/shipSeason.test.ts`.

**Also upheld, on better evidence than it shipped with**: `격침 비율` = KDR, proved by arithmetic
rather than assertion — from one page, 생존 45.39% and 함선 격침 0.52 give frags ÷ deaths =
0.52 ÷ 0.5461 = 0.952 against that page's printed 격침 비율 of 0.95.

**Evidence-channel caveat.** The Korean audit could not fetch wows-numbers directly (Cloudflare 403
on every engine) and worked from search-index snippets. Its central claims were re-verified here
against a **first-party scrape** taken earlier the same day: `함선 격침` at line 56 under
`| 전투 평균치 |` and again at line 194 as a record count, `평균 격침` heading four header-free
columns. Snippet-tier evidence, upgraded before acting on it.

**Left open, deliberately**: the card's hover tooltips; the `F/B` and `Overall WR %` columns (gaps,
not rulings — see the research doc); `common.award` and `feedback.category.languageIssue` (our own
coinages, unattestable by any corpus); ja `総戦闘数` (search-snippet only, refused).

## 5d. First post-flip readout (2026-08-13)

The before/after section 5 was sequenced for. Boundary is **2026-08-11 21:17 UTC**, the env file's
mtime; ~1.5 days of beacon before it, ~1.9 days after. Beacon-reporting visitors:

| window | en | ja | ko | CJK share |
|---|---|---|---|---|
| pre-flip | 43 | 2 | 0 | **4%** |
| post-flip | 23 | 3 | 4 | **23%** |

**Detection routes correctly.** Cross-tabulating `session.language` against the beacon's served
locale, post-flip, gives a clean diagonal: every ja-browser visitor served `ja` (3), every
ko-browser visitor served `ko` (3), every other language served `en` (cs/de/pl/ru, 1 each; en, 14).
No misroute in either direction.

**The over-reach tell has not fired.** Section 5 named it in advance: `locale-switch` → `en` from
ko/ja browsers. Post-flip there is exactly **one** switch event of any kind, an `en`-browser US
visitor selecting `en`. Zero CJK visitors switched away from what they were served.

Three cautions on quoting these numbers:

- **N is seven.** Directionally strong, not significant. 23% against the ~37% CJK-browser arrival
  rate is consistent with detection working, and equally consistent with noise.
- **Beacon coverage is ~60%** of in-window session rows (24 of 40 visitors fired `locale-active`).
  It is uniform across languages, so the *share* is unbiased and the *counts* are a floor.
  **Superseded by 5e:** the uniformity claim could not be reproduced at a larger N, and the
  beacon/pageview populations overlap only partially. Read 5e before quoting a coverage figure.
- **"Not switching away" is weak evidence of satisfaction.** A visitor who finds the Korean UI
  unhelpful and simply leaves emits no switch event either. Bounce rate for ko/ja visits is the
  falsifying measure, and it is not instrumented. **Superseded by 5e:** it is derivable from
  `website_event` after all, and it was measured on 2026-08-14. It clears.

Readout SQL is section 4, plus the cross-tab (join the beacon rows to `session` and group by
`lower(split_part(s.language,'-',1))`, `ed.string_value`).

## 5e. Second post-flip readout (2026-08-14) — and the denominator that must not be got wrong

One day after 5d, same boundary (2026-08-11 21:17 UTC), ~2.9 days of beacon after it. The 5d
pre-flip row reproduced **exactly** (43 en / 2 ja / 0 ko), which is the check that the window split
and the query are right; treat a mismatch there as a query bug before believing any post-flip number.

| window | en | ja | ko | CJK share |
|---|---|---|---|---|
| pre-flip | 43 | 2 | 0 | **4%** |
| post-flip (5d, 08-13) | 23 | 3 | 4 | 23% |
| post-flip (5e, 08-14) | 43 | 6 | 6 | **22%** |

The share held at ~22% while N nearly doubled (7 → 12 CJK visitors). ko and ja have both appeared
every UTC day since the flip.

### The comparison 5d could not make: same-window arrival vs service

5d contrasted 23% served against the **~37% CJK-browser arrival rate** and called the gap
"consistent with detection working, and equally consistent with noise." That contrast was never
sound: the arrival figure is a *30-day new-visitor* rate and the beacon figure is a *3-day* one —
different populations over different spans, exactly the trap section 6 warns about for the email.

Computed over the same post-flip window, on visitors active in it:

- CJK share of **active visitors** (by `session.language`): **23.3%** (20 of 86)
- CJK share of **beacon-reporting visitors** (by served locale): **21.8%** (12 of 55)

Those are the same population, and they match. **Autodetect is serving essentially everyone it
should.** The 34–37% figure is a 30-day rate and must not be set beside a 3-day beacon share.

### Routing and the over-reach tell, at N=55

Clean diagonal, no misroute either way: ja browser → `ja` (6), ko browser → `ko` (6), every other
language → `en` (43: de 8, cs/fr/pl/ru 1 each, en 31). Post-flip `locale-switch` is still exactly
**one** event — an `en`-browser visitor selecting `en`. Zero CJK switch-aways across 12 CJK visitors.

`?lang=` arrivals all-time: still **0**.

### Bounce: the falsifying measure, measured

5d called this uninstrumented. It is derivable from `website_event`, and it clears — **but the first
attempt produced a false alarm that anyone repeating this will also hit.**

**The trap.** Counting `visits` as `count(DISTINCT visit_id)` over *all* events makes the beacon
inflate its own denominator: post-flip nearly every visit carries a `locale-active` row, and 20
beacon-firing visitors have **no pageview row at all** (below), so they enter as visits with zero
pageviews. The pre-flip comparison window mostly predates the beacon and has no such visits. That
alone produced an apparent CJK collapse from **1.45 to 1.02 pageviews/visit** — an artifact
entirely, pointing the wrong way, and large enough to look like a product failure.

**The fix:** restrict to visits containing ≥1 pageview (`HAVING count(*) FILTER (WHERE event_type=1) > 0`).
Corrected, comparing the 14 days before the flip against the ~3 days after:

| cohort | pv/visit before | after | single-pageview before | after |
|---|---|---|---|---|
| CJK (ja+ko browsers) | 1.41 | **1.46** | 79% | **77%** |
| other | 1.52 | 1.91 | 75% | 69% |

CJK engagement is flat-to-slightly-better after being served its own language: it did not degrade,
which is what the measure was for. Two honest limits: CJK engagement remains *below* non-CJK, and
non-CJK improved more over the same span — but the windows differ in length (14d vs ~3d), so that
gap should not be attributed to anything here.

### Coverage is messier than 5d recorded

5d: "~60% of in-window session rows … uniform across languages, so the share is unbiased." At the
larger N the population overlap is not that simple. Post-flip: 86 visitors with a pageview, 55 with
a beacon, **but only 35 with both.**

- **20 visitors fired `locale-active` with no pageview row in the window**, and **13 of those have
  never had a pageview recorded at all.** None are missing `session` rows, so this is not an
  orphaned join. Cause unknown — route prefetch, a JS-executing bot, and a tracker race are all
  candidates; none has been checked.
- Consequently **any per-language coverage percentage computed against a pageview denominator is
  unreliable**, and 5d's "uniform across languages" is not currently verifiable. A per-language cut
  attempted here (ja 20%, ko 40%, en 46%) used that bad denominator and is **not** evidence of
  non-uniformity; it is reported only so nobody re-derives it and believes it.

This does not threaten the share figures above — a bias would have to correlate with language, and
the arrival-vs-service match (23.3% vs 21.8%) is independent evidence that it does not. It does mean
the *counts* are a floor and the coverage story needs work before it is quoted.

### Still true after this readout

N is twelve CJK visitors over three days. Directionally strong, not statistically settled. Nothing
here justifies dropping the selector, and the discoverability finding of section 2 is untouched:
the selector is still how a visitor overrides, and one click still outranks detection forever.

## 6. The weekly traffic email carries this readout

`server/scripts/weekly_traffic_email.py` (timer `battlestats-traffic-digest`, Mondays 10:30 UTC)
grew a **Language** section on 2026-08-10, so the numbers above arrive without anyone running
SQL. It was a daily email until 2026-08-25; the section's semantics did not change with the
cadence, only its window — the denominators are now the week's visitors rather than the day's.
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

The Language section is the **only** place in that email where `locale-active` appears as a figure.
From 2026-08-12 the beacon is classed as instrumentation (`INSTRUMENTATION_EVENTS`) and held out of
the headline custom-event count, both windows of the totals query, the engagement second-event
test and the event ranking: an event every visitor emits on every page load cannot be outranked, and the 2026-08-11
lead duly opened on it instead of on anything a visitor did. See
`runbook-weekly-traffic-email-2026-08-09.md`. Its raw count is still printed once, as prose, under
Events triggered.

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
| email Language section, both denominators | `test_weekly_traffic_email.py` `LocaleTests` + `RenderTests` |
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

Added 2026-08-11 with the native audits (section 5c):

| assertion | how verified |
|---|---|
| `함선 격침` is header-dependent, `평균 격침` is not | first-party scrape of the ko player page: line 56 under `\| 전투 평균치 \|`, line 194 as a record count, `평균 격침` heading 4 header-free columns |
| the ja case is identical | same, ja page: line 57 under `\| 期間平均値 \|`, line 195 beside 武蔵 with value **10**; `平均撃破数` heads the header-free per-ship column |
| `生存率` is the JP community's label form | `wikiwiki.jp/nanjwows/指標` re-fetched here: 生存率 ×2, 生還 ×0, 平均撃沈数 ×2, キル/デス比 ×1 |
| ja `艦名` heads the ship-NAME column | first-party ja scrape line 378: `\| 艦名 \| Tier \| 国家 \| …` |
| ja `直近N日` is corpus-attested | first-party ja scrape line 50: `\| 全期間 \| 最近 \| 直近７日 \| …` — the old "no corpus hit" claim was false |
| the browser-locale leak in the window label | `shipSeason.test.ts` (5 cases, incl. one asserting no CJK month can reach the English branch) |
| the new values render without CJK wrapping | Playwright, ko + ja at 1280px and 390px, after the change |

Added 2026-08-13 with the first post-flip readout (section 5d):

| assertion | how verified |
|---|---|
| autodetect is on in prod, and since when | `ssh root@battlestats.online 'grep -i LOCALE /etc/battlestats-client.env'` → `NEXT_PUBLIC_LOCALE_AUTODETECT=1`; `stat -c %y` → 2026-08-11 21:17:52 UTC |
| pre/post CJK share 4% → 23% | prod Umami, section 4 query split on the mtime boundary |
| detection routes correctly (clean diagonal) | prod Umami, beacon rows joined to `session.language`, post-flip |
| zero CJK switch-aways | prod Umami, `locale-switch` joined to `session.language`, `created_at >= 2026-08-11 21:00` — one row, `en`-browser → `en` |

Added 2026-08-14 with the second post-flip readout (section 5e):

| assertion | how verified |
|---|---|
| the 5d pre-flip row is reproducible | prod Umami, same query and boundary re-run 24h later — 43 en / 2 ja / 0 ko, byte-identical. This is the control for the window split |
| CJK share held at 22% as N doubled | prod Umami, section 4 query, post-flip: en 43 / ja 6 / ko 6 = 12 of 55 |
| arrival and service match **in the same window** | prod Umami: CJK 23.3% of 86 active visitors (`session.language`) vs 21.8% of 55 beacon-reporting (served locale). Replaces 5d's unsound 23%-vs-37% contrast, which compared a 3-day share to a 30-day rate |
| clean diagonal holds at N=55 | prod Umami cross-tab, post-flip: ja→ja 6, ko→ko 6, all other languages→en 43 (de 8, cs/fr/pl/ru 1 each, en 31) |
| still exactly one switch event | prod Umami, `locale-switch` post-flip — one row, `en`-browser → `en` |
| CJK bounce did **not** worsen | prod Umami, visits filtered to ≥1 pageview: CJK 1.41→1.46 pv/visit, single-pv 79%→77%, against the 14 days pre-flip |
| the 1.02 figure is an artifact, not a finding | same query without the ≥1-pageview filter yields CJK 1.45→1.02; the gap is beacon-only visits entering a denominator the pre-flip window has none of |
| 20 beacon-firers have no in-window pageview, 13 none ever | prod Umami, `locale-active` session_ids anti-joined to `event_type=1`; `session` rows present for all 20, so not an orphan join |
| 5d's "coverage is uniform across languages" is not currently verifiable | the only available per-language cut uses the pageview denominator the row above invalidates |
