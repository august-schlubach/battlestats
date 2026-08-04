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
`<h1>`–`<h4>` sites), the six insight-tab labels, and button/filter labels.
Roughly 80–110 strings.

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
- `ko.ts`, `ja.ts` — `Record<StringKey, string>` typed against the same union,
  populated from the terminology research. Strings with no in-game source carry a
  `// NEEDS-NATIVE-CHECK` comment and hold the English text deliberately. Because
  the type is shared, a key added to `en.ts` and forgotten elsewhere is a **build
  failure**, not a blank label in production.
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
- **Dictionary parity:** `Object.keys(ko)` and `Object.keys(ja)` equal
  `Object.keys(en)` — belt alongside the type, and it catches a dictionary loaded
  from any future non-typed source.
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

## Follow-ons (not in this work item)

1. Native check on the `NEEDS-NATIVE-CHECK` residue; flip
   `NEXT_PUBLIC_LOCALE_SELECTOR=1`; cut a minor.
2. Localize the ~12 backend axis labels via the client-side override map.
3. Localize info-tooltip descriptions.
4. If KR/JP engagement moves: localized route segments, `hreflang`, per-locale
   `generateMetadata`, sitemap × locales, and a CJK font for OG cards.
