# Client locale toggle — header language selector (en / ko / ja)

**Date:** 2026-08-04
**Status:** approved, implementing
**Surface:** client only (header chrome, section headings, insight-tab labels)
**Scope:** frontend; no `server/` change
**Ships:** dark (flag absent in prod), dictionaries populated from researched terminology
**Terminology:** `agents/work-items/i18n-terminology-research.md`

## Why

Umami sessions by country, measured 2026-08-03:

| | 30 days | 7 days |
|---|---|---|
| **KR** | 166 | 40 |
| **US** | 149 | 42 |
| **JP** | 87 | 36 |
| CN | 28 | 7 |
| HK / TW | 5 / 0 | 1 / 0 |

Korea is the largest single country over 30 days, ahead of the US; Japan is third.
Over the trailing 7 days KR + JP combined (76) is close to double the US (42), and
both are sustained rather than the tail of a referral burst
(cf. `reference_twitter_referral_traffic_jp.md`: the KR DCInside burst converted to
daily direct traffic). The site is numbers-dense, so the English text a KR or JP
visitor must parse is almost entirely *chrome*: what section am I looking at, which
tab is which. That is a small, bounded string surface.

**Order is KR first, JP second, decided by the numbers above.** Chinese is not
justified: the CN server is a separate operator outside the WG public API, so those
sessions are largely onlookers whose stats the site structurally cannot serve.

## Gating dependency: terminology, not code

World of Warships ships official JP and KR clients with settled in-game vocabulary
(勝率, ランク戦, クラン戦, and the tier/class names). A statistics site aimed at
those players that uses machine-translated approximations reads as untrustworthy —
strictly worse than English, which at least signals "this is an English tool"
rather than "this tool does not know the game."

**Resolved by research, not by machine translation** (2026-08-04). Terminology is
sourced from a live corpus — `asia.wows-numbers.com` in both locales (a
human-localized WoWS *stats* site, the closest analogue to ours), `namu.wiki`,
`arca.live/b/wows`, `wikiwiki.jp/wows`, and Japanese player stats blogs. Reddit's
`?tl=` auto-translated pages were excluded: sampling them would have measured the
exact failure mode described above. Register decisions (compact KO mode names,
`데미지` over `피해량`, Latin `Tier`, `戦績`/`전적` over `統計`/`통계`) are recorded
with their evidence in the research doc.

`ko.ts` and `ja.ts` therefore ship **populated**. The residue is small and named:
survival rate, nation, "efficiency", and our own product coinages (*Reigning
champion*, *Skill bracket*, *Compare vs*) have no in-game source and carry a
`// NEEDS-NATIVE-CHECK` marker. Those specific strings fall back to English rather
than ship a guess.

## Scope

**In:** header/footer chrome, section headings (33 `SectionHeadingWithTooltip` /
`<h1>`–`<h4>` sites), and the six insight-tab labels. Roughly 80–110 strings.

**Out, deliberately:**

- **Tables and entity names.** Ship names, clan tags, player names, and all cell
  content stay as they are.
- **Info-tooltip descriptions** (~40 long paragraphs). These carry the most words
  and are the hardest to translate well.
- **Backend-supplied chart axis labels** (~12 strings, `server/warships/data.py`
  lines ~2591–2691). See *Accepted inconsistency* below.
- **OG share cards.** `app/og/route.tsx` renders through satori, which needs actual
  font data; CJK would render as tofu. Cards stay English.
- **Numbers and dates.** No locale-aware formatting.
- **Auto-detection.** `navigator.language` is never consulted.
- **SEO.** See *Non-goal: search traffic*.

### Filter bars: DONE (2026-08-04, follow-on #2)

An earlier draft of this Scope section listed "button/filter labels" as in
scope alongside the tab labels. That never happened at the time, and
shipping it partially would have recreated the exact defect this fix round
otherwise closed (an alternating-language surface) — one review pass caught
the tab strip doing this, and the filter bar / Efficiency table were named
as the next place it would happen. That follow-on has now run.

Two concrete surfaces were fully hardcoded English and are now wired:

- The landing ship-leaderboard filter bar (`ShipLeaderboard.tsx`, the Tier /
  Type labels — **`WR ≥` is deliberately excluded, see below**).
- `EfficiencyBadgeTable.tsx`'s filter row (`Tier` / `Type` / `Nation` / `Award`
  labels plus four `<option value="all">All</option>` dropdown entries).

**The scaffolding was already in place; it is now load-bearing.** `common.tier`,
`common.type`, `common.all`, `common.battles`, `common.avgDamage`,
`common.winRate`, `common.ship`, `common.player`, and `common.season` were
populated in `en.ts`/`ko.ts`/`ja.ts` with no call site before this follow-on
(as opposed to `common.clear`/`common.close`/`common.clan`, which had neither
a call site nor a named owner and were deleted outright). Two new keys were
added alongside them: `common.nation` and `common.award` (see below).

**Resolved, in order:**

1. **`Nation`/`Type` corpus attestation** — resolved by the 2026-08-04 corpus
   pass (see the research doc's Verified terms table): 国家/국가 and 艦種/함종
   both attested as filter labels on `asia.wows-numbers.com`'s ship pages, the
   same UI role as our own filter bars.
2. **`Award`** (badge-tier name — our own product taxonomy, no in-game source)
   — no corpus pass will ever attest it, since the concept doesn't exist
   outside this site. Admitted under the generic-chrome tier using 등급/等級
   ("grade", a description of the column's values rather than a literal
   rendering of "Award") — see the research doc's admission table, entry
   marked `‡`. **Ships with a `NEEDS-NATIVE-CHECK` marker in `ko.ts`/`ja.ts`**:
   this is the weakest attestation in the whole change, flagged deliberately
   rather than left to blend in with the corpus-backed keys around it.
3. **The `common.winRate` casing trap, below, turned out not to block this
   follow-on.** The trap's four live sites (`PlayerDetail.tsx`,
   `RankedSeasonScatterSVG.tsx`, `ClanBattleSeasonScatterSVG.tsx`,
   `Clan3DSVG.tsx`) are all title-case `'Win Rate'` renders outside the two
   filter bars in scope here. `ShipLeaderboard.tsx` does contain a
   sentence-case `'Win rate'` column header in its **results table**
   (`colSort`/`SortButton`), matching `common.winRate`'s casing exactly — but
   the filter-bar site list this follow-on was scoped to was the Tier/Type/
   `WR ≥` pill-group labels specifically, not that table's column headers, so
   it was left exactly as it was (hardcoded, unwired) and the casing trap
   remains open for whichever follow-on eventually reaches for it.
4. **`WR ≥` was resolved as "leave it English", not wired.** wows-numbers
   keeps `WR Diff` in Latin in both its ko and ja ranking tables — the
   community reads "WR" as an untranslated abbreviation in both languages, the
   same as "PR" elsewhere in the corpus. This is now recorded as an explicit,
   evidence-backed ruling in the research doc's "Deliberately untranslated:
   `WR ≥`" section and as an inline comment at the call site in
   `ShipLeaderboard.tsx`, specifically so a future pass does not mistake the
   one remaining English label in that row for a gap and "fix" it into a
   guessed translation. No `common.*` key exists for it.

**Test coverage:** `ShipLeaderboardFilterBarLocale.test.tsx` and
`EfficiencyBadgeTableLocale.test.tsx` render both components under real
`ko`/`ja` dictionaries (no `translate()` mock) and assert the translated
label text, so breaking the wiring turns them red — an English-only
assertion can't distinguish a working `t()` call from a hardcoded literal,
since both render the same string in the default locale.

### Accepted inconsistency

A localized section heading can sit above an English y-axis label, because axis
labels arrive in the API payload. This is visible and accepted for this slice. The
extension point is a client-side override map keyed on the English value — the set
is ~12 strings and enumerable, so localizing them later needs no API change.

### Non-goal: search traffic

A localStorage toggle serves visitors who have **already arrived** and earns zero
search traffic: Googlebot sees English, there are no localized URLs, and no
`hreflang`. The version that earns *arrivals* is localized route segments
(`/ko/...`), requiring route restructuring, per-locale `generateMetadata`, and
sitemap × locales, plus solving the OG font problem. That is several times this
work and is explicitly deferred. Ship the toggle; let it tell us whether the KR/JP
numbers move.

## Architecture

Chosen approach: a locale context plus typed dictionary modules — a structural
mirror of `RealmContext`. Rejected: `next-intl`/`react-i18next` (plural rules and
ICU formatting for ~100 two-word noun phrases; adds a dependency to a client whose
only runtime deps are React, Next, d3, FontAwesome), and per-component co-located
strings (no single catalogue, so coverage is invisible and a translator must hunt
through 119 files — it fails the one hard requirement, which is handing someone a
single file to fill in).

### `app/i18n/`

- `keys.ts` — the `StringKey` union, nothing else.
- `en.ts` — `Record<StringKey, string>`, the source of truth. English is not a
  translation: strings are lifted **verbatim** from the components, so the `en`
  render is byte-identical to today.
- `ko.ts`, `ja.ts` — **`Partial<Record<StringKey, string>>`**, populated from the
  terminology research. An untranslated string is expressed as **absence**, not as
  a duplicated English value.

**Why `Partial` rather than a total `Record`.** A total record would make a
forgotten key a build failure, which is attractive. But it forces "untranslated"
to be written as a copy of the English string, which is indistinguishable from
"translated, and identical by coincidence." Coverage then becomes uncountable —
and the `NEEDS-NATIVE-CHECK` residue is the entire subject of the follow-on work,
so being unable to answer *how much of `ko` is real* costs more than the build
gate is worth. With `Partial`:

- untranslated = omitted, and `NEEDS-NATIVE-CHECK` is simply a comment beside the
  omission;
- the runtime English fallback becomes live and load-bearing rather than dead code
  reachable only by casting past the type;
- coverage is `Object.keys(ko).length / Object.keys(en).length`, asserted and
  printed by the parity test.

**Accepted cost:** a key added to `en.ts` and never translated renders English
silently instead of failing the build. `en.ts` itself stays a **total**
`Record<StringKey, string>`, so the source of truth can never have a hole.
- `index.ts` — locale registry + `resolveDictionary(locale)`.

**Key style is semantic and namespaced** (`insights.tabs.activity`), not
English-source-as-key. English-as-key collapses contexts that CJK must
distinguish: the "Ships" tab and a "Ships" column are one English word and often
not one Korean word.

### `app/context/LocaleContext.tsx`

Mirrors `RealmContext` deliberately, so it introduces no new concepts.

- `Locale = 'en' | 'ko' | 'ja'`.
- Precedence: `?lang=` → `localStorage['bs-locale']` → `'en'`, resolved
  synchronously at first render so nothing renders twice.
- An unknown or malformed value is ignored in favour of `'en'`, matching how
  `RealmContext` treats an unknown realm.
- `useLocale()` for logic; `useDisplayLocale()` for text inside the statically
  prerendered shell (the header lives there, so the selector uses it) — same
  hydration-safety split the realm already runs. The two are not in tension:
  resolution is synchronous so no component fetches or renders twice, while
  `useDisplayLocale()` reports `'en'` until mounted so server-rendered markup and
  the first client render agree.
- `useT()` returns a memoized `t(key)`.

### Pre-hydration `lang` stamp

The inline `<head>` script in `app/layout.tsx` already reads `bs-theme` and
`bs-realm` and stamps `data-theme` / `data-realm`. It gains three lines: read
`bs-locale`, set `document.documentElement.lang` and `dataset.lang`.

This puts the correct `lang` on the served document before React runs (screen
readers and crawlers read the attribute) and gives CSS a `:root[data-lang="ko"]`
hook. `<html>` already carries `suppressHydrationWarning`.

**The provider must re-stamp on every change — do not copy `RealmContext` here.**
`RealmProvider.setRealm` writes state and localStorage but never re-stamps
`documentElement.dataset.realm`; nothing depends on that attribute after load, so
it is harmless there. Copying it faithfully would break this feature twice:

1. **After a switch.** The head script runs once. Switching to `ko` would leave
   `data-lang="en"`, so the typography rule never applies and Korean renders with
   `uppercase` + `tracking-wide` still in force — precisely the defect that rule
   exists to prevent.
2. **On a `?lang=ko` first visit.** The head script reads *only* localStorage, so
   a cold `?lang=` arrival — the prod preview path this spec names — stamps
   nothing. The preview would show Korean text with English typography and
   misrepresent what shipping looks like.

`LocaleProvider` therefore carries a `useEffect` keyed on `locale` that writes both
`documentElement.lang` and `documentElement.dataset.lang`, running on the initial
resolve as well as on every subsequent change. Covered by a test asserting
`document.documentElement.dataset.lang` after a switch and after a `?lang=` cold
load.

### Feature flag

`NEXT_PUBLIC_LOCALE_SELECTOR=1`, read through a new function in
`app/lib/featureFlags.ts` (the env-driven convention, not a hardcoded constant like
`PVE_ENJOYER_ICON_ENABLED`). Set in local `.env`; simply **absent** from
`/etc/battlestats-client.env` in prod. Enabling it later is an env change plus a
client rebuild, with no code diff.

**The flag gates the selector only, not the mechanism.** `LocaleContext`, the
dictionaries, and every `t()` call ship live regardless; with the flag off there is
simply no UI to change locale away from `'en'`. `?lang=ko` therefore still works in
prod, which is how a translation-in-progress gets previewed on the real site
without exposing a control to visitors.

## The selector

**Placement:** `ThemeToggle · LocaleSelector · RealmSelector · HeaderSearch`. Locale
sits immediately left of realm, grouping the two presentation controls (theme,
language) and leaving the data-scope control (realm) adjacent to the search it
scopes. The right-hand cluster is already `flex-wrap` with `min-w-0` on the search,
and the collapsed chip is ~40px, so the sub-640px stack absorbs it.

**Behaviour:** a structural copy of `RealmSelector`'s dropdown — chip button,
chevron, outside-mousedown close, Escape close, check mark on the active row, the
same `--accent-faint` / `--text-secondary` option colours. No new interaction
vocabulary.

**Marks:** the collapsed chip shows the current flag alone. The open menu shows
flag + **native** language name: `English` / `한국어` / `日本語`. Native names are
the convention and stay legible whichever locale is active, which matters most for
a visitor trying to get *out* of a language they cannot read.

**Flags:** `en` → `uk.svg`, `ja` → `japan.svg` (both already bundled), `ko` →
`kr.svg`, added from lipis/flag-icons, the same upstream as the existing SVGs. UK
rather than US for English: it reads as the language rather than as the NA realm,
next to a realm control that literally offers NA.

**Accessibility:** the flag is decorative (`aria-hidden`); the button carries an
`aria-label` from the dictionary and each option's accessible name is its native
language name.

**Analytics:** `trackEvent('locale-switch', { locale })`, keyed on the locale id,
never the label — the same discipline `insightsTabEventByTab` already follows, so
localizing labels can never fragment an Umami series.

### Targeted refactor: `FlagImage`

`NationFlag.tsx` holds a 12-line `<img>` carrying all flag presentation: the 16×12
box, `object-cover`, the `ring-1 ring-black/25` that keeps pale flags legible on
dark, lazy loading, the eslint exemption. Extract it to
`app/components/FlagImage.tsx`; `NationFlag` becomes the thin nation→file map it
wants to be. Both flag surfaces then render identically by construction. This is
the only pre-existing component the change modifies.

## CJK typography

51 `uppercase` and 55 `tracking-wide` occurrences across the client. `uppercase` is
a no-op on CJK and `tracking-wide` reads as broken spacing. Rather than edit 106
call sites, four lines in `app/globals.css`:

```css
:root[data-lang="ko"] .uppercase,     :root[data-lang="ja"] .uppercase     { text-transform: none; }
:root[data-lang="ko"] .tracking-wide, :root[data-lang="ja"] .tracking-wide { letter-spacing: normal; }
```

Tailwind utilities are single-class, so an attribute-scoped descendant selector
outranks them without `!important`, and the rule cannot drift as new headings are
written.

**Accepted trade-off:** under a CJK locale this also de-uppercases the English
strings that remain out of scope (table headers and the like). A uniformly
sentence-case page beats a half-uppercased one, and the effect shrinks as scope
grows.

### Fonts

`Inter({ subsets: ["latin"] })` carries no CJK glyphs. Add a `fallback` array with
the **system** CJK stack (Malgun Gothic / Apple SD Gothic Neo for Korean; Hiragino
Kaku Gothic ProN / Yu Gothic / Meiryo for Japanese; generic sans last). Fallback
applies per glyph, so Latin still renders in Inter.

Self-hosting Noto CJK is explicitly rejected: the download is measured in
megabytes, against a client that currently ships one Latin subset.

## Failure modes

- **Missing key:** prevented at build time by the shared `StringKey` type — that is
  the real defence. At runtime `t()` falls back to the English string and never
  renders a raw key; it does not throw.
- **Unavailable localStorage:** caught and ignored, resolving to `'en'` (same
  `try`/`catch` shape as `RealmContext`).
- **Unknown `?lang=` value:** ignored, resolves to `'en'`.

## Testing

- **Locale resolution:** precedence (`?lang=` > localStorage > `'en'`), persistence
  on switch, invalid value ignored.
- **Dictionary parity + coverage:** every `ko`/`ja` key is a subset of `en` (no
  orphans), and the test **prints coverage** (`Object.keys(ko).length /
  Object.keys(en).length`) so the translation residue is a number, not a feeling.
- **`data-lang` stamping:** `document.documentElement.dataset.lang` and `lang`
  track the locale after a switch, and after a `?lang=ko` cold load with empty
  localStorage.
- **Selector:** renders three options, switches locale, persists, emits
  `locale-switch` with the locale **id**.
- **`t()` fallback:** a dictionary missing a key yields the English string, not the
  key.
- **Regression:** the existing 176 English text assertions stay green because the
  default locale is `'en'` and `en.ts` is verbatim.
- **Visual verify** (standing project rule — lint/build/CI do not catch visual
  regressions): the header row at desktop and sub-640px with the flag on locally,
  in both themes.

## Release

With the flag absent in prod this is user-visible nothing, so: **patch** bump now;
**minor** the day the selector is enabled. Either way the client must be rebuilt
and deployed — `NEXT_PUBLIC_APP_VERSION` is baked at build time.

## Known traps for the next translation pass

Both moved here from the scratch planning ledger (`.superpowers/sdd/client-locale-toggle-plan/progress.md`,
gitignored) at the final fix-round review — durable rulings a follow-on needs,
not planning residue.

### `common.winRate` is sentence case; four live sites render title case

`en.ts` holds `'common.winRate': 'Win rate'` (sentence case) — correct for the
table-column contexts that motivated it: `ShipLeaderboard`, `ShipRouteView`,
`RealmTopShipsTreemapSVG`. Four other live sites render **title** case `'Win
Rate'` instead: `PlayerDetail.tsx:321`, `RankedSeasonScatterSVG.tsx:158`,
`ClanBattleSeasonScatterSVG.tsx:132`, `Clan3DSVG.tsx:90`. Wiring those four to
`common.winRate` as-is would silently change their rendered text (a real,
visible regression, not a translation gap). `common.winRate` will be the first
key any follow-on reaches for since it is fully populated in all three
dictionaries with the most obvious call sites — resolve the casing question
(new title-case key vs. a per-site `.toUpperCase()`/CSS transform vs.
reconciling the four sites to sentence case) before wiring any of the four.

### The composed-template blocker — RESOLVED (follow-on #1, 2026-08-04)

Three `en.ts` values used to contain `{}` tokens whose interpolated clause was
built as an **English literal inside the component**, never passed through
`t()`:

- `landing.shipLeaderboard.heading` — `{suffix}` was ` · last N days rolling`,
  built in `ShipLeaderboard.tsx`. (A prior fix round made the key drive the
  visible heading text as well as the aria-label — they used to diverge — but
  did not touch the suffix clause itself, so the blocker stood until now.)
- `landing.treemap.heading` — `{bucket}`/`{suffix}` carried ship-bucket
  labels, WR-percentile clauses, and window phrases built in
  `RealmTopShipsTreemapSVG.tsx`.
- `landing.treemap.ariaLabel` — same component, same English-literal clauses
  (`{bucket}`, `{windowPhrase}`, `{view}`).

Translating any of these three keys alone would have shipped a mixed-language
string (e.g. `함선 리더보드 · last 45 days rolling`). The fix was one refactor
across both components: give every interpolated clause its own dictionary
key, resolved through `t()` **in the component** before being handed to the
outer template as a var, so the outer template only ever composes already-
translated fragments — never an opaque English one.

**New keys, each resolved at its own call site:**

- `shipClass.destroyers`/`cruisers`/`battleships`/`aircraftCarriers`/
  `submarines`/`ships` — the treemap heading's bucket label
  (`T{tier} {class}`); reusable vocabulary (not treemap-specific), so it lives
  in its own top-level `shipClass.*` namespace rather than under `landing.*`.
  `RealmTopShipsTreemapSVG.tsx`'s `pluralTypeLabel` now takes `t` as a
  parameter (a plain function call, not a hook — `useT()` stays a single
  top-level call in the component) and looks up the class's key instead of
  pluralizing an English label string.
- `landing.treemap.topPct` (`top {pct}%`) — the WR-percentile clause in the
  heading's `{suffix}`.
- `landing.treemap.windowPhraseWithDays` / `windowPhraseNoDays` — the
  `{windowPhrase}` clause in the aria-label, with/without a known window
  length.
- `landing.treemap.viewTreemap` / `viewScatterplot` — the `{view}` clause in
  the aria-label.
- `landing.shipLeaderboard.windowSuffix` (`last {days} days rolling`) — the
  clause inside `ShipLeaderboard.tsx`'s heading `{suffix}`.

`landing.treemap.heading`, `landing.treemap.ariaLabel`, and
`landing.shipLeaderboard.heading` themselves now ship translated in `ko`/`ja`
— the word-order concern that had blocked them (a template with several
moving parts) resolved to "keep the same relative order as English, add a
locative connective" (`{realm} 서버에서 …`/`{realm}サーバーで…`, "at the
{realm} server") rather than reordering, since the English sentence shape
reads naturally in both target languages once every clause is itself
translated. Terminology + the full admission reasoning (which keys reuse
already-attested nouns vs. are new generic-chrome admissions):
`agents/work-items/i18n-terminology-research.md`.

**Deliberately preserved, not touched by this fix:** the info-tooltip
paragraph in `RealmTopShipsTreemapSVG.tsx` that also names the standings
window (info-tooltip descriptions are out of scope for localization per this
spec's Scope section) keeps its own English-literal copy of the window phrase
(`windowPhraseTooltip`) rather than sharing the now-translated `windowPhrase`
variable — sharing it would have leaked a translated fragment into an
otherwise fully-English paragraph the moment ko/ja is active, a regression to
an area this work item does not claim.

**Test coverage:** `RealmTopShipsTreemapSVGLocale.test.tsx` and
`ShipLeaderboardLocale.test.tsx` render under real `ko`/`ja` dictionaries
(no `translate()` mock) and assert the whole composed heading/aria-label is in
the target language — no surviving English clause word, no literal `{token}`
— covering both branches of every conditional clause (bucket present/absent,
every ship class, WR-percentile present/absent, window-days known/unknown,
map/plot view).

**`{}` alone is not the signal — `nav.themeCurrent` has one and is NOT
blocked.** `'nav.themeCurrent': 'Theme: {label}'` also interpolates, but
`{label}` is filled from `nav.themeLight`/`nav.themeDark`, which are
themselves translated dictionary values, not component-side English literals —
that is the whole reason `nav.themeCurrent` composes the *whole* accessible
name as one template (see `app/i18n/en.ts`'s comment on that key). The actual
rule: a key is blocked when its interpolated clause is assembled as an English
literal in the component; it is not blocked merely because it contains a
token.

### The language chip's aria-label is the one non-byte-identical English change (header-menu coverage pass, 2026-08-04)

Every other key wired in the header-menu coverage pass (`nav.realmCurrent`,
`landing.treemap.chartSectionLabel`/`chartViewGroup`/`toggleMap`/`togglePlot`)
carries an English value lifted verbatim from the literal it replaced, so the
English render is byte-identical to before. `nav.languageCurrent` is the one
exception, by design: `LocaleSelector.tsx`'s collapsed chip used to carry the
static `aria-label={t('nav.language')}` ("Language", regardless of which
locale was active); it now composes `"Language: {language}"` the same way the
realm chip already announces its current value ("Realm: NA"). In English that
renders `"Language: English"` — new text, not a re-rendering of old text. This
is exactly the asymmetry the task asked to close (the realm chip announced its
value, the language chip didn't), so it's correct, not drift. Recorded here so
a future byte-identity audit of this codebase doesn't read the diff as an
unexplained regression: it is an `aria-label` only, no visible on-page text
changed, and no test pinned the old value (confirmed via `grep` before
changing it).

## Follow-ons (not in this work item)

1. Native check on the `NEEDS-NATIVE-CHECK` residue; flip
   `NEXT_PUBLIC_LOCALE_SELECTOR=1`; cut a minor.
2. Localize the ~12 backend axis labels via the client-side override map.
3. Localize info-tooltip descriptions.
4. If KR/JP engagement moves: localized route segments, `hreflang`, per-locale
   `generateMetadata`, sitemap × locales, and a CJK font for OG cards.
5. ~~Wire the landing filter bar and `EfficiencyBadgeTable.tsx`~~ — **DONE,
   2026-08-04 (follow-on #2)**. See "Filter bars: DONE" under Scope above for
   the full account: `common.type`/`common.nation` are now populated from the
   corpus-attested 함종/艦種 and 국가/国家; a new `common.award` key (등급/等級)
   fills the one label no corpus pass could ever attest — a generic-chrome
   admission carrying a `NEEDS-NATIVE-CHECK` marker, the weakest attestation
   in this change; `WR ≥` was ruled deliberately English (wows-numbers keeps
   `WR Diff` in Latin in both locales too); and the `common.winRate` casing
   trap turned out not to be in this follow-on's actual path (its four sites
   are all outside the two filter bars this task's site list named). The
   remaining open item from this list is the casing trap itself, still
   unresolved and still blocking whichever future follow-on wires
   `common.winRate` into `ShipLeaderboard.tsx`'s results-table column header
   or the other three title-case sites.
