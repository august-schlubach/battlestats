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

## 5. Browser-language defaulting (analysis, not implemented)

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
never sorted either way. Shipped 2026-08-10 under the generic-chrome tier. Coverage is now 67/76
(88%), and `dictionaries.test.ts` pins the remaining nine so nothing goes untriaged again.

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
| ko/ja dictionaries at 67/76 keys after `footer.lastViewed` | `dictionaries.test.ts` coverage line |
| the other 9 are documented omissions, not a backlog | `ko.ts` NEEDS-NATIVE-CHECK block; research doc |
| beacon behaviour (7 cases) | `app/components/__tests__/LocaleBeacon.test.tsx` |
| email Language section, both denominators | `test_daily_traffic_email.py` `LocaleTests` + `RenderTests` |
| the email section against real prod data | dry run on the droplet, 2026-08-10, day 2026-08-09 |
