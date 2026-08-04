# Client Locale Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a header language selector (English / Korean / Japanese) that localizes the site's chrome, section headings, and insight-tab labels, shipped dark behind a feature flag.

**Architecture:** A `LocaleContext` mirroring the existing `RealmContext` (localStorage-persisted, synchronously resolved, SSR-safe display hook) plus typed dictionary modules under `app/i18n/`. `en.ts` is a total record and the source of truth; `ko.ts`/`ja.ts` are `Partial` records so untranslated strings are *absent* and coverage is countable. A `LocaleSelector` sits left of `RealmSelector` in the header, rendering national flags through a `FlagImage` component extracted from `NationFlag`.

**Tech Stack:** Next.js 16 App Router, React 18, TypeScript 5.9, Tailwind 3.4, Jest 30 + @testing-library/react.

## Global Constraints

- **Spec:** `agents/work-items/client-locale-toggle-spec.md`. **Terminology:** `agents/work-items/i18n-terminology-research.md`. Both are authoritative; do not invent translations.
- **Branch:** `feat/locale-toggle`, worktree `.claude/worktrees/locale-toggle`. All work happens there, never in the main checkout.
- **No new runtime dependencies.** The client's runtime deps are React, Next, d3, FontAwesome. Adding an i18n library is out of scope and was explicitly rejected.
- **No `server/` changes.** This is frontend-only.
- **Default locale is `'en'`,** and `en.ts` strings are lifted **verbatim** from the components. The existing 176 English test assertions must stay green untouched.
- **Register (from the research doc):** compact Korean mode names `랜덤전 / 랭크전 / 클랜전`; `데미지` not `피해량`; Latin `Tier` in Japanese; `戦績` / `전적` for a player's record, not `統計` / `통계`.
- **Unsourced strings** (survival rate, nation, "efficiency", *Reigning champion*, *Skill bracket*, *Compare vs*) are **omitted** from `ko.ts`/`ja.ts` with a `// NEEDS-NATIVE-CHECK` comment. Omission is the mechanism; never ship a guess.
- **Umami events key on ids, never labels** (`trackEvent('locale-switch', { locale })`).
- Commit after every task. Conventional Commits; `docs:`/`feat:`/`refactor:` prefixes. Every commit message ends with:
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
- Run tests from `client/`: `npm test -- <path>`.

## Spec amendment adopted by this plan

The spec's `t(key)` signature cannot express two existing headings that are composed at runtime: `RealmTopShipsTreemapSVG.tsx:405` (`NA most-played ships · top 50% · …`) and `ShipLeaderboard.tsx`'s `headingLabel`. Word order differs across these three languages, so string concatenation in components would make those headings untranslatable in principle.

**Therefore `t` takes an optional variables object** — `t(key, vars?)` with `{name}` placeholder substitution. This is a strict superset of the spec's signature and changes nothing else.

## File Structure

| File | Responsibility |
|---|---|
| `client/app/i18n/keys.ts` | The `StringKey` union. Nothing else. |
| `client/app/i18n/en.ts` | Total `Record<StringKey, string>`. Source of truth. |
| `client/app/i18n/ko.ts` | `Partial<Record<StringKey, string>>`. Korean. |
| `client/app/i18n/ja.ts` | `Partial<Record<StringKey, string>>`. Japanese. |
| `client/app/i18n/index.ts` | Locale union, registry, `resolveDictionary`, `translate`. |
| `client/app/context/LocaleContext.tsx` | Provider, `useLocale`, `useDisplayLocale`, `useT`, `data-lang` stamping. |
| `client/app/components/FlagImage.tsx` | Presentational flag `<img>`, extracted from `NationFlag`. |
| `client/app/components/NationFlag.tsx` | *Modified.* Becomes the nation→file map over `FlagImage`. |
| `client/app/components/LocaleSelector.tsx` | The header control. |
| `client/app/lib/featureFlags.ts` | *Modified.* Adds `isLocaleSelectorEnabled()`. |
| `client/app/layout.tsx` | *Modified.* Provider, head-script stamp, Inter CJK fallback. |
| `client/app/globals.css` | *Modified.* CJK typography neutralization. |
| `client/public/flags/kr.svg` | New asset (lipis/flag-icons). |

---

### Task 1: i18n core — keys, English dictionary, translate

**Files:**
- Create: `client/app/i18n/keys.ts`
- Create: `client/app/i18n/en.ts`
- Create: `client/app/i18n/ko.ts`
- Create: `client/app/i18n/ja.ts`
- Create: `client/app/i18n/index.ts`
- Test: `client/app/i18n/__tests__/dictionaries.test.ts`

**Interfaces:**
- Produces: `type StringKey`; `type Locale = 'en' | 'ko' | 'ja'`; `const LOCALES: Locale[]`; `resolveDictionary(locale: Locale): Partial<Record<StringKey, string>>`; `translate(locale: Locale, key: StringKey, vars?: Record<string, string | number>): string`.

- [ ] **Step 1: Write the failing test**

Create `client/app/i18n/__tests__/dictionaries.test.ts`:

```ts
import { en } from '../en';
import { ko } from '../ko';
import { ja } from '../ja';
import { translate, LOCALES, resolveDictionary } from '../index';

describe('dictionaries', () => {
    it('en is total: every key has a non-empty string', () => {
        const empty = Object.entries(en).filter(([, v]) => !v || !v.trim());
        expect(empty).toEqual([]);
    });

    it('ko and ja contain no keys absent from en', () => {
        const enKeys = new Set(Object.keys(en));
        expect(Object.keys(ko).filter((k) => !enKeys.has(k))).toEqual([]);
        expect(Object.keys(ja).filter((k) => !enKeys.has(k))).toEqual([]);
    });

    it('reports translation coverage', () => {
        const total = Object.keys(en).length;
        for (const [name, dict] of [['ko', ko], ['ja', ja]] as const) {
            const pct = Math.round((Object.keys(dict).length / total) * 100);
            // Visible in test output: the translation residue is a number.
            console.log(`i18n coverage ${name}: ${Object.keys(dict).length}/${total} (${pct}%)`);
            expect(pct).toBeGreaterThan(0);
        }
    });

    it('every locale resolves to a dictionary', () => {
        for (const locale of LOCALES) {
            expect(resolveDictionary(locale)).toBeDefined();
        }
    });
});

describe('translate', () => {
    it('returns the locale string when present', () => {
        expect(translate('en', 'insights.tabs.activity')).toBe('Activity');
    });

    it('falls back to English when the locale lacks the key', () => {
        // 'nav.language' is deliberately untranslated (NEEDS-NATIVE-CHECK).
        expect(translate('ko', 'player.section.efficiencyBadges'))
            .toBe(en['player.section.efficiencyBadges']);
    });

    it('substitutes {vars}', () => {
        expect(translate('en', 'landing.treemap.heading', {
            realm: 'NA', bucket: 'ships', suffix: '',
        })).toContain('NA');
    });

    it('leaves an unmatched placeholder untouched rather than throwing', () => {
        expect(translate('en', 'landing.treemap.heading', { realm: 'NA' }))
            .toContain('{bucket}');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npm test -- app/i18n/__tests__/dictionaries.test.ts`
Expected: FAIL — `Cannot find module '../en'`.

- [ ] **Step 3: Write `keys.ts`**

```ts
// Every localizable string in the client, keyed semantically. Semantic keys
// (not English-source-as-key) because one English word maps to two different
// CJK words depending on context: the "Ships" tab and a "Ships" column are not
// the same noun in Korean.
export type StringKey =
    // — header / footer chrome —
    | 'nav.selectRealm'
    | 'nav.language'
    | 'nav.searchPlayer'
    | 'nav.searchClan'
    | 'nav.theme'
    | 'footer.lastViewed'
    // — player insight tabs —
    | 'insights.tabs.activity'
    | 'insights.tabs.ships'
    | 'insights.tabs.profile'
    | 'insights.tabs.efficiency'
    | 'insights.tabs.ranked'
    | 'insights.tabs.clanBattles'
    | 'insights.panel.activity'
    | 'insights.panel.ships'
    | 'insights.panel.profile'
    | 'insights.panel.efficiency'
    | 'insights.panel.ranked'
    | 'insights.panel.clanBattles'
    | 'insights.tabsAriaLabel'
    // — player section headings —
    | 'player.section.rankedGamesVsWinRate'
    | 'player.section.rankedSeasonTimeline'
    | 'player.section.rankedSeasons'
    | 'player.section.randomBattlesByTier'
    | 'player.section.winRateVsSurvival'
    | 'player.section.battlesPlayedDistribution'
    | 'player.section.clanBattlesVsWinRate'
    | 'player.section.clanSeasonTimeline'
    | 'player.section.efficiencyBadges'
    // — landing —
    | 'landing.treemap.heading'
    | 'landing.shipLeaderboard.heading'
    // — shared controls —
    | 'common.all'
    | 'common.clear'
    | 'common.tier'
    | 'common.type'
    | 'common.battles'
    | 'common.avgDamage'
    | 'common.winRate'
    | 'common.ship'
    | 'common.player'
    | 'common.clan'
    | 'common.season'
    | 'common.close'
    // — not found —
    | 'notFound.title'
    | 'notFound.body';
```

- [ ] **Step 4: Write `en.ts`**

Strings are lifted **verbatim** from the components so the English render is byte-identical to today.

```ts
import type { StringKey } from './keys';

// Total by type: `en` can never have a hole. Every other dictionary is Partial.
export const en: Record<StringKey, string> = {
    'nav.selectRealm': 'Select realm',
    'nav.language': 'Language',
    'nav.searchPlayer': 'Search players',
    'nav.searchClan': 'Search clans',
    'nav.theme': 'Toggle theme',
    'footer.lastViewed': 'Last viewed:',

    'insights.tabs.activity': 'Activity',
    'insights.tabs.ships': 'Ships',
    'insights.tabs.profile': 'Profile',
    'insights.tabs.efficiency': 'Efficiency',
    'insights.tabs.ranked': 'Ranked',
    'insights.tabs.clanBattles': 'Clan Battles',
    'insights.panel.activity': 'Recent battle activity',
    'insights.panel.ships': 'Ship insights',
    'insights.panel.profile': 'Profile insights',
    'insights.panel.efficiency': 'Efficiency insights',
    'insights.panel.ranked': 'Ranked insights',
    'insights.panel.clanBattles': 'Clan battles insights',
    'insights.tabsAriaLabel': 'Player insight tabs',

    'player.section.rankedGamesVsWinRate': 'Ranked Games vs Win Rate',
    'player.section.rankedSeasonTimeline': 'Ranked Season Timeline',
    'player.section.rankedSeasons': 'Ranked Seasons',
    'player.section.randomBattlesByTier': 'Random Battles by Tier',
    'player.section.winRateVsSurvival': 'Win Rate vs Survival',
    'player.section.battlesPlayedDistribution': 'Battles Played Distribution',
    'player.section.clanBattlesVsWinRate': 'Clan Battles vs Win Rate',
    'player.section.clanSeasonTimeline': 'Clan Season Timeline',
    'player.section.efficiencyBadges': 'Efficiency Badges',

    // Composed at runtime; word order differs per language, so the whole
    // sentence is one template rather than concatenated fragments.
    'landing.treemap.heading': '{realm} most-played {bucket}{suffix}',
    'landing.shipLeaderboard.heading': '{realm} ship leaderboard',

    'common.all': 'All',
    'common.clear': 'Clear',
    'common.tier': 'Tier',
    'common.type': 'Type',
    'common.battles': 'Battles',
    'common.avgDamage': 'Avg dmg',
    'common.winRate': 'Win rate',
    'common.ship': 'Ship',
    'common.player': 'Player',
    'common.clan': 'Clan',
    'common.season': 'Season',
    'common.close': 'Close',

    'notFound.title': 'Page Not Found',
    'notFound.body': 'The requested page could not be found.',
};
```

- [ ] **Step 5: Write `ko.ts` and `ja.ts` as empty partials for now**

Populating them is Task 7. They must exist and typecheck now so `index.ts` compiles.

`client/app/i18n/ko.ts`:

```ts
import type { StringKey } from './keys';

// Korean. Partial by design: an untranslated string is ABSENT, not a copy of
// the English one — that is what makes coverage countable. Terminology and
// register: agents/work-items/i18n-terminology-research.md
export const ko: Partial<Record<StringKey, string>> = {};
```

`client/app/i18n/ja.ts`:

```ts
import type { StringKey } from './keys';

// Japanese. Partial by design — see ko.ts.
export const ja: Partial<Record<StringKey, string>> = {};
```

- [ ] **Step 6: Write `index.ts`**

```ts
import type { StringKey } from './keys';
import { en } from './en';
import { ko } from './ko';
import { ja } from './ja';

export type { StringKey };

export type Locale = 'en' | 'ko' | 'ja';

export const LOCALES: Locale[] = ['en', 'ko', 'ja'];

export const isLocale = (value: unknown): value is Locale =>
    typeof value === 'string' && (LOCALES as string[]).includes(value);

const DICTIONARIES: Record<Locale, Partial<Record<StringKey, string>>> = { en, ko, ja };

export const resolveDictionary = (locale: Locale): Partial<Record<StringKey, string>> =>
    DICTIONARIES[locale] ?? en;

// `{name}` substitution. An unmatched placeholder is left in place rather than
// blanked: a visible `{bucket}` is a bug report, an empty string is silence.
const interpolate = (template: string, vars?: Record<string, string | number>): string => {
    if (!vars) {
        return template;
    }
    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
        name in vars ? String(vars[name]) : match);
};

// Falls back to English when the locale lacks the key. Never throws, never
// renders a raw key — an untranslated string shows in English, which is a
// degraded but honest result.
export const translate = (
    locale: Locale,
    key: StringKey,
    vars?: Record<string, string | number>,
): string => interpolate(resolveDictionary(locale)[key] ?? en[key], vars);
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd client && npm test -- app/i18n/__tests__/dictionaries.test.ts`
Expected: PASS, 8 tests. Output includes `i18n coverage ko: 0/…` — correct at this stage; Task 7 raises it.

Note: the `expect(pct).toBeGreaterThan(0)` assertion **fails** while the dictionaries are empty. Change that line to `expect(pct).toBeGreaterThanOrEqual(0)` now, and tighten it to `toBeGreaterThan(0)` in Task 7 when the dictionaries are populated.

- [ ] **Step 8: Commit**

```bash
git add client/app/i18n
git commit -m "feat: add i18n dictionary core (keys, en source of truth, translate)

en.ts is a total Record so the source of truth cannot have a hole; ko/ja
are Partial so an untranslated string is absence, not a duplicated English
value, which keeps coverage countable.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: LocaleContext with `data-lang` stamping

**Files:**
- Create: `client/app/context/LocaleContext.tsx`
- Test: `client/app/context/__tests__/LocaleContext.test.tsx`

**Interfaces:**
- Consumes: `Locale`, `isLocale`, `translate`, `StringKey` from `app/i18n`.
- Produces: `LocaleProvider`; `useLocale(): { locale, setLocale }`; `useDisplayLocale(): Locale`; `useT(): (key: StringKey, vars?: Record<string, string | number>) => string`.

Read `client/app/context/RealmContext.tsx` first. This mirrors it, with **one deliberate divergence**: `RealmProvider` never re-stamps `documentElement.dataset.realm` after a change. Copying that here would leave `data-lang` stale after a switch, so Korean would render with `uppercase`/`tracking-wide` still applied.

- [ ] **Step 1: Write the failing test**

Create `client/app/context/__tests__/LocaleContext.test.tsx`:

```tsx
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { LocaleProvider, useLocale, useT } from '../LocaleContext';

const Probe: React.FC = () => {
    const { locale, setLocale } = useLocale();
    const t = useT();
    return (
        <div>
            <span data-testid="locale">{locale}</span>
            <span data-testid="tab">{t('insights.tabs.activity')}</span>
            <button onClick={() => setLocale('ko')}>ko</button>
        </div>
    );
};

const renderProbe = () => render(<LocaleProvider><Probe /></LocaleProvider>);

describe('LocaleContext', () => {
    beforeEach(() => {
        localStorage.clear();
        document.documentElement.removeAttribute('data-lang');
        window.history.replaceState({}, '', '/');
    });

    it('defaults to en', () => {
        renderProbe();
        expect(screen.getByTestId('locale')).toHaveTextContent('en');
    });

    it('restores a stored locale', () => {
        localStorage.setItem('bs-locale', 'ja');
        renderProbe();
        expect(screen.getByTestId('locale')).toHaveTextContent('ja');
    });

    it('lets ?lang= win over storage', () => {
        localStorage.setItem('bs-locale', 'ja');
        window.history.replaceState({}, '', '/?lang=ko');
        renderProbe();
        expect(screen.getByTestId('locale')).toHaveTextContent('ko');
    });

    it('ignores an unknown value', () => {
        localStorage.setItem('bs-locale', 'klingon');
        renderProbe();
        expect(screen.getByTestId('locale')).toHaveTextContent('en');
    });

    it('persists a switch', () => {
        renderProbe();
        act(() => { screen.getByText('ko').click(); });
        expect(localStorage.getItem('bs-locale')).toBe('ko');
    });

    it('stamps lang and data-lang on the initial resolve', () => {
        localStorage.setItem('bs-locale', 'ja');
        renderProbe();
        expect(document.documentElement.dataset.lang).toBe('ja');
        expect(document.documentElement.lang).toBe('ja');
    });

    it('re-stamps data-lang after a switch, without a reload', () => {
        renderProbe();
        act(() => { screen.getByText('ko').click(); });
        expect(document.documentElement.dataset.lang).toBe('ko');
        expect(document.documentElement.lang).toBe('ko');
    });

    it('stamps on a ?lang= cold load with empty storage', () => {
        window.history.replaceState({}, '', '/?lang=ko');
        renderProbe();
        // The head script reads only localStorage, so the provider is the ONLY
        // thing that can stamp here. This is the prod preview path.
        expect(document.documentElement.dataset.lang).toBe('ko');
    });

    it('t() returns English for an untranslated key', () => {
        localStorage.setItem('bs-locale', 'ko');
        renderProbe();
        expect(screen.getByTestId('tab')).toHaveTextContent('Activity');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npm test -- app/context/__tests__/LocaleContext.test.tsx`
Expected: FAIL — `Cannot find module '../LocaleContext'`.

- [ ] **Step 3: Write the provider**

```tsx
"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { isLocale, translate, type Locale, type StringKey } from '../i18n';

const STORAGE_KEY = 'bs-locale';

interface LocaleContextValue {
    locale: Locale;
    setLocale: (l: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue>({
    locale: 'en',
    setLocale: () => undefined,
});

// Resolved synchronously at first render, same precedence the realm uses:
// explicit ?lang= wins, else the stored preference, else English. SSR has no
// window, so it returns 'en' there — see useDisplayLocale for the text that
// renders during SSR.
const resolveInitialLocale = (): Locale => {
    if (typeof window === 'undefined') {
        return 'en';
    }
    try {
        const urlLocale = new URLSearchParams(window.location.search).get('lang');
        if (isLocale(urlLocale)) {
            return urlLocale;
        }
        const stored = localStorage.getItem(STORAGE_KEY);
        if (isLocale(stored)) {
            return stored;
        }
    } catch {
        // URL / localStorage unavailable
    }
    return 'en';
};

export const LocaleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [locale, setLocaleState] = useState<Locale>(resolveInitialLocale);

    // Keep <html lang> and data-lang in sync on EVERY change, including the
    // initial resolve. RealmContext deliberately does not do this for the realm
    // — nothing reads data-realm after load. Here two things do: the CJK
    // typography rule in globals.css, and assistive tech reading lang. Without
    // this effect a switch to ko leaves Korean text under `uppercase` +
    // `tracking-wide`, and a ?lang=ko cold load stamps nothing at all, because
    // the head script reads only localStorage.
    useEffect(() => {
        document.documentElement.lang = locale;
        document.documentElement.dataset.lang = locale;
    }, [locale]);

    const setLocale = useCallback((l: Locale) => {
        setLocaleState(l);
        try {
            localStorage.setItem(STORAGE_KEY, l);
        } catch {
            // localStorage unavailable
        }
    }, []);

    const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);

    return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
};

export const useLocale = (): LocaleContextValue => useContext(LocaleContext);

// Locale for TEXT rendered in the statically-prerendered shell (the header).
// The live locale comes from localStorage, which the server cannot know, so
// rendering it directly would mismatch the SSG 'en' default. Returns 'en' until
// mounted, then the real locale. Same split as useDisplayRealm.
export const useDisplayLocale = (): Locale => {
    const { locale } = useLocale();
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    return mounted ? locale : 'en';
};

export const useT = () => {
    const { locale } = useLocale();
    return useCallback(
        (key: StringKey, vars?: Record<string, string | number>) => translate(locale, key, vars),
        [locale],
    );
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd client && npm test -- app/context/__tests__/LocaleContext.test.tsx`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add client/app/context/LocaleContext.tsx client/app/context/__tests__/LocaleContext.test.tsx
git commit -m "feat: add LocaleContext with lang/data-lang stamping

Mirrors RealmContext, with one deliberate divergence: the provider
re-stamps documentElement lang/data-lang on every locale change. Without
it a switch leaves CJK text under uppercase/tracking-wide, and a ?lang=
cold load stamps nothing since the head script reads only localStorage.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Extract `FlagImage`, add the Korean flag asset

**Files:**
- Create: `client/app/components/FlagImage.tsx`
- Modify: `client/app/components/NationFlag.tsx`
- Create: `client/public/flags/kr.svg`
- Test: `client/app/components/__tests__/FlagImage.test.tsx`

**Interfaces:**
- Produces: `FlagImage` with props `{ file: string; title: string; positionClass?: string; className?: string }`.

- [ ] **Step 1: Add the Korean flag asset**

Fetch from lipis/flag-icons, the same upstream as the existing SVGs:

```bash
cd /home/august/code/battlestats/.claude/worktrees/locale-toggle
curl -sSfL -o client/public/flags/kr.svg \
  https://raw.githubusercontent.com/lipis/flag-icons/main/flags/4x3/kr.svg
head -c 120 client/public/flags/kr.svg
```

Expected: an `<svg ...` opening tag. If the fetch fails, stop and report — do not hand-author a flag.

- [ ] **Step 2: Write the failing test**

Create `client/app/components/__tests__/FlagImage.test.tsx`:

```tsx
import React from 'react';
import { render } from '@testing-library/react';
import FlagImage from '../FlagImage';
import NationFlag from '../NationFlag';

describe('FlagImage', () => {
    it('renders a decorative img from /flags', () => {
        const { container } = render(<FlagImage file="kr.svg" title="Korea" />);
        const img = container.querySelector('img')!;
        expect(img).toHaveAttribute('src', '/flags/kr.svg');
        expect(img).toHaveAttribute('aria-hidden', 'true');
        expect(img).toHaveAttribute('title', 'Korea');
        expect(img.getAttribute('alt')).toBe('');
    });

    it('applies a position class when given', () => {
        const { container } = render(
            <FlagImage file="ussr.webp" title="USSR" positionClass="object-left-top" />,
        );
        expect(container.querySelector('img')!.className).toContain('object-left-top');
    });
});

describe('NationFlag after the extraction', () => {
    it('still renders a known nation', () => {
        const { container } = render(<NationFlag nation="japan" />);
        expect(container.querySelector('img')).toHaveAttribute('src', '/flags/japan.svg');
    });

    it('still renders nothing for an unknown nation', () => {
        const { container } = render(<NationFlag nation="atlantis" />);
        expect(container.querySelector('img')).toBeNull();
    });

    it('still anchors the USSR flag to its canton', () => {
        const { container } = render(<NationFlag nation="ussr" />);
        expect(container.querySelector('img')!.className).toContain('object-left-top');
    });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd client && npm test -- app/components/__tests__/FlagImage.test.tsx`
Expected: FAIL — `Cannot find module '../FlagImage'`.

- [ ] **Step 4: Write `FlagImage.tsx`**

Move the presentation verbatim out of `NationFlag` — the 16×12 box, `object-cover`, the ring that keeps pale flags legible on dark, lazy loading, the eslint exemption.

```tsx
import React from 'react';

interface FlagImageProps {
    // File name inside /public/flags, e.g. 'kr.svg'.
    file: string;
    // Hover tooltip for sighted users. The image itself is decorative.
    title: string;
    // object-position override for flags whose emblem sits off-centre.
    positionClass?: string;
    className?: string;
}

// A small flag. Decorative by construction: the adjacent text (ship name,
// language name) is the accessible content, so the image is aria-hidden and
// carries an empty alt. object-cover keeps every flag the same height — wide
// flags crop left/right rather than squish.
const FlagImage: React.FC<FlagImageProps> = ({ file, title, positionClass = '', className = '' }) => (
    // eslint-disable-next-line @next/next/no-img-element -- tiny static flag SVG; next/image optimization is unnecessary here
    <img
        src={`/flags/${file}`}
        alt=""
        aria-hidden="true"
        title={title}
        width={16}
        height={12}
        loading="lazy"
        className={`inline-block h-3 w-4 shrink-0 rounded-[1px] object-cover ${positionClass} ring-1 ring-black/25 ${className}`.replace(/\s+/g, ' ').trim()}
    />
);

export default FlagImage;
```

- [ ] **Step 5: Rewrite `NationFlag.tsx` over `FlagImage`**

Keep `FLAG_FILE` and `FLAG_POSITION` and their comments exactly as they are; replace only the `<img>` with `FlagImage`.

```tsx
import React from 'react';
import { nationLabel } from '../lib/shipIdentity';
import FlagImage from './FlagImage';

// ... FLAG_FILE and FLAG_POSITION unchanged ...

const NationFlag: React.FC<NationFlagProps> = ({ nation, className = '' }) => {
    if (!nation || !(nation in FLAG_FILE)) {
        return null;
    }
    return (
        <FlagImage
            file={FLAG_FILE[nation]}
            title={nationLabel(nation) ?? nation}
            positionClass={FLAG_POSITION[nation]}
            className={className}
        />
    );
};

export default NationFlag;
```

- [ ] **Step 6: Run the new test and the full suite**

Run: `cd client && npm test -- app/components/__tests__/FlagImage.test.tsx`
Expected: PASS, 5 tests.

Run: `cd client && npm test`
Expected: PASS. `NationFlag` renders in ship and efficiency surfaces; any regression there surfaces here.

- [ ] **Step 7: Commit**

```bash
git add client/app/components/FlagImage.tsx client/app/components/NationFlag.tsx \
        client/app/components/__tests__/FlagImage.test.tsx client/public/flags/kr.svg
git commit -m "refactor: extract FlagImage from NationFlag; add kr.svg

The locale selector needs the same flag treatment (sizing, ring, crop)
that NationFlag had inlined. Extracting it means both surfaces render
identically by construction rather than by copied classes.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: The `LocaleSelector` control

**Files:**
- Create: `client/app/components/LocaleSelector.tsx`
- Modify: `client/app/lib/featureFlags.ts`
- Test: `client/app/components/__tests__/LocaleSelector.test.tsx`

**Interfaces:**
- Consumes: `useLocale`, `useDisplayLocale`, `useT`; `FlagImage`; `isLocaleSelectorEnabled`.
- Produces: default-exported `LocaleSelector` (no props).

Read `client/app/components/RealmSelector.tsx` first: this is a structural copy of its dropdown (chip button, chevron, outside-mousedown close, Escape close, check mark on the active row, the same colour constants). Do not invent new interaction behaviour.

- [ ] **Step 1: Add the feature flag**

Append to `client/app/lib/featureFlags.ts`:

```ts
// Header language selector (en/ko/ja). Off unless explicitly enabled, so the
// control ships dark while ko/ja dictionaries are still filling in. The flag
// gates the SELECTOR ONLY — LocaleContext, the dictionaries, and every t() call
// ship live regardless, so ?lang=ko previews the real thing in prod without
// exposing a control. Set NEXT_PUBLIC_LOCALE_SELECTOR=1 to reveal it.
export const isLocaleSelectorEnabled = (): boolean =>
    process.env.NEXT_PUBLIC_LOCALE_SELECTOR === '1';
```

- [ ] **Step 2: Write the failing test**

Create `client/app/components/__tests__/LocaleSelector.test.tsx`:

```tsx
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { LocaleProvider } from '../../context/LocaleContext';
import LocaleSelector from '../LocaleSelector';

const trackEvent = jest.fn();
jest.mock('../../lib/umami', () => ({ trackEvent: (...args: unknown[]) => trackEvent(...args) }));

const renderSelector = () => render(<LocaleProvider><LocaleSelector /></LocaleProvider>);

describe('LocaleSelector', () => {
    beforeEach(() => {
        localStorage.clear();
        trackEvent.mockClear();
        process.env.NEXT_PUBLIC_LOCALE_SELECTOR = '1';
    });

    it('renders nothing when the flag is off', () => {
        process.env.NEXT_PUBLIC_LOCALE_SELECTOR = '0';
        const { container } = renderSelector();
        expect(container).toBeEmptyDOMElement();
    });

    it('shows the current locale flag on the collapsed chip', () => {
        const { container } = renderSelector();
        expect(container.querySelector('img')).toHaveAttribute('src', '/flags/uk.svg');
    });

    it('opens to three options with native names', () => {
        renderSelector();
        act(() => { screen.getByRole('button').click(); });
        expect(screen.getByRole('option', { name: /English/ })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: /한국어/ })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: /日本語/ })).toBeInTheDocument();
    });

    it('switches, persists, and tracks by locale id', () => {
        renderSelector();
        act(() => { screen.getByRole('button').click(); });
        act(() => { screen.getByRole('option', { name: /한국어/ }).click(); });
        expect(localStorage.getItem('bs-locale')).toBe('ko');
        expect(trackEvent).toHaveBeenCalledWith('locale-switch', { locale: 'ko' });
    });

    it('closes on Escape', () => {
        renderSelector();
        act(() => { screen.getByRole('button').click(); });
        expect(screen.queryByRole('listbox')).toBeInTheDocument();
        act(() => {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        });
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd client && npm test -- app/components/__tests__/LocaleSelector.test.tsx`
Expected: FAIL — `Cannot find module '../LocaleSelector'`.

- [ ] **Step 4: Write `LocaleSelector.tsx`**

```tsx
"use client";

import React, { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck, faChevronDown } from '@fortawesome/free-solid-svg-icons';
import { useLocale, useDisplayLocale, useT } from '../context/LocaleContext';
import { isLocaleSelectorEnabled } from '../lib/featureFlags';
import { trackEvent } from '../lib/umami';
import FlagImage from './FlagImage';
import type { Locale } from '../i18n';

// Native language names, not translated names: a visitor stuck in a language
// they cannot read needs to recognise their own. UK rather than US for English
// — it reads as the language, next to a realm control that offers NA.
const LOCALE_OPTIONS: Array<{ value: Locale; flag: string; nativeName: string }> = [
    { value: 'en', flag: 'uk.svg', nativeName: 'English' },
    { value: 'ko', flag: 'kr.svg', nativeName: '한국어' },
    { value: 'ja', flag: 'japan.svg', nativeName: '日本語' },
];

const INACTIVE_OPTION_COLOR = 'var(--text-secondary)';
const ACTIVE_OPTION_BACKGROUND = 'var(--accent-faint)';
const ACTIVE_OPTION_COLOR = 'var(--text-primary)';

const LocaleSelector: React.FC = () => {
    const { locale, setLocale } = useLocale();
    // Hydration-safe for the chip's flag: SSG renders 'en'.
    const displayLocale = useDisplayLocale();
    const t = useT();
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) {
            return;
        }
        const handleMouseDown = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleMouseDown);
        return () => document.removeEventListener('mousedown', handleMouseDown);
    }, [open]);

    useEffect(() => {
        if (!open) {
            return;
        }
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setOpen(false);
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [open]);

    if (!isLocaleSelectorEnabled()) {
        return null;
    }

    const current = LOCALE_OPTIONS.find((o) => o.value === displayLocale) ?? LOCALE_OPTIONS[0];

    const handleLocaleChange = (next: Locale) => {
        // Keyed on the locale id, never the label: a localized label would
        // fragment this series the moment translations land.
        trackEvent('locale-switch', { locale: next });
        setLocale(next);
        setOpen(false);
    };

    return (
        <div ref={containerRef} className="relative">
            <button
                type="button"
                onClick={() => setOpen((prev) => !prev)}
                className="inline-flex items-center gap-1.5 rounded-md px-[10px] transition-colors"
                style={{
                    height: '28px',
                    border: '1px solid var(--border)',
                    backgroundColor: open ? 'var(--bg-hover)' : 'var(--bg-surface)',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                }}
                aria-label={t('nav.language')}
                aria-expanded={open}
                aria-haspopup="listbox"
            >
                <FlagImage file={current.flag} title={current.nativeName} />
                <FontAwesomeIcon icon={faChevronDown} style={{ fontSize: '10px', marginLeft: '2px', opacity: 0.35 }} aria-hidden="true" />
            </button>

            {open && (
                <div
                    role="listbox"
                    aria-label={t('nav.language')}
                    className="absolute right-0 z-50 mt-1 rounded-lg shadow-lg"
                    style={{
                        width: '132px',
                        top: 'calc(100% + 4px)',
                        border: '1px solid var(--border)',
                        backgroundColor: 'var(--bg-surface)',
                    }}
                >
                    {LOCALE_OPTIONS.map((option) => {
                        const isActive = locale === option.value;
                        return (
                            <button
                                key={option.value}
                                role="option"
                                aria-selected={isActive}
                                type="button"
                                onClick={() => handleLocaleChange(option.value)}
                                className="flex w-full items-center justify-between rounded-md px-2 transition-colors"
                                style={{
                                    height: '32px',
                                    paddingLeft: '8px',
                                    paddingRight: '8px',
                                    color: isActive ? ACTIVE_OPTION_COLOR : INACTIVE_OPTION_COLOR,
                                    cursor: 'pointer',
                                    backgroundColor: isActive ? ACTIVE_OPTION_BACKGROUND : 'transparent',
                                }}
                            >
                                <span className="inline-flex items-center gap-2" style={{ fontSize: '13px', fontWeight: isActive ? 600 : 500 }}>
                                    <FlagImage file={option.flag} title={option.nativeName} />
                                    {option.nativeName}
                                </span>
                                {isActive ? <FontAwesomeIcon icon={faCheck} style={{ fontSize: '11px' }} aria-hidden="true" /> : null}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default LocaleSelector;
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd client && npm test -- app/components/__tests__/LocaleSelector.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add client/app/components/LocaleSelector.tsx client/app/lib/featureFlags.ts \
        client/app/components/__tests__/LocaleSelector.test.tsx
git commit -m "feat: add LocaleSelector behind NEXT_PUBLIC_LOCALE_SELECTOR

Structural copy of RealmSelector's dropdown. Collapsed chip shows the flag
alone; the menu shows native language names so a visitor stuck in a script
they cannot read can still find their way out.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Wire the provider, head-script stamp, CJK typography, and font fallback

**Files:**
- Modify: `client/app/layout.tsx`
- Modify: `client/app/globals.css`
- Test: `client/app/__tests__/layoutLocale.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `client/app/__tests__/layoutLocale.test.tsx`. The layout itself is a server component, so test the head script's logic directly — it is the part that can silently rot.

```tsx
// The inline <head> script is a string in layout.tsx. Extracting its behaviour
// into a test means a typo inside the string literal fails CI instead of
// shipping a header that never stamps.
import { readFileSync } from 'fs';
import { join } from 'path';

describe('layout head script', () => {
    const source = readFileSync(join(process.cwd(), 'app/layout.tsx'), 'utf8');

    it('stamps the locale from localStorage before hydration', () => {
        expect(source).toContain("localStorage.getItem('bs-locale')");
        expect(source).toContain('documentElement.lang');
        expect(source).toContain("dataset.lang");
    });

    it('wraps the tree in LocaleProvider', () => {
        expect(source).toContain('<LocaleProvider>');
    });

    it('renders LocaleSelector next to RealmSelector', () => {
        const localeIdx = source.indexOf('<LocaleSelector />');
        const realmIdx = source.indexOf('<RealmSelector />');
        expect(localeIdx).toBeGreaterThan(-1);
        expect(realmIdx).toBeGreaterThan(-1);
        // Locale sits immediately left of realm.
        expect(localeIdx).toBeLessThan(realmIdx);
    });

    it('gives Inter a system CJK fallback', () => {
        expect(source).toContain('fallback:');
        expect(source).toContain('Malgun Gothic');
    });
});

describe('globals.css CJK typography', () => {
    const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8');

    it('neutralizes uppercase and tracking under ko and ja', () => {
        expect(css).toContain(':root[data-lang="ko"] .uppercase');
        expect(css).toContain(':root[data-lang="ja"] .uppercase');
        expect(css).toContain(':root[data-lang="ko"] .tracking-wide');
        expect(css).toContain(':root[data-lang="ja"] .tracking-wide');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npm test -- app/__tests__/layoutLocale.test.tsx`
Expected: FAIL — the assertions do not match the current file.

- [ ] **Step 3: Extend the head script in `layout.tsx`**

The existing script already stamps theme and realm. Add the locale read. Current line:

```js
(function(){var t=localStorage.getItem('bs-theme');...document.documentElement.dataset.realm='na';})();
```

Append before the closing `})();`:

```js
var l=localStorage.getItem('bs-locale');if(l!=='ko'&&l!=='ja')l='en';document.documentElement.lang=l;document.documentElement.dataset.lang=l;
```

- [ ] **Step 4: Add the Inter CJK fallback in `layout.tsx`**

Replace:

```tsx
const inter = Inter({ subsets: ["latin"] });
```

with:

```tsx
// Inter carries no CJK glyphs. Fallback applies PER GLYPH, so Latin still
// renders in Inter while Korean and Japanese fall to the system faces every
// real device already has. Self-hosting Noto CJK would cost megabytes against a
// client that currently ships one Latin subset.
const inter = Inter({
    subsets: ["latin"],
    fallback: [
        'Malgun Gothic', 'Apple SD Gothic Neo', 'Noto Sans KR',
        'Hiragino Kaku Gothic ProN', 'Yu Gothic', 'Meiryo', 'Noto Sans JP',
        'sans-serif',
    ],
});
```

- [ ] **Step 5: Wire the provider and the selector in `layout.tsx`**

Add the imports:

```tsx
import LocaleSelector from "./components/LocaleSelector";
import { LocaleProvider } from "./context/LocaleContext";
```

Wrap inside `ThemeProvider` (outside `RealmProvider` is equally fine; keep it adjacent so the two preference providers read as a pair), and place the control in the header cluster:

```tsx
<div className="flex w-full min-w-0 flex-wrap items-center justify-end gap-3 sm:w-auto sm:flex-1 sm:flex-nowrap">
    <ThemeToggle />
    <LocaleSelector />
    <RealmSelector />
    <Suspense fallback={null}>
        <HeaderSearch />
    </Suspense>
</div>
```

- [ ] **Step 6: Add the CJK typography rule to `globals.css`**

```css
/* CJK typography. `uppercase` is a no-op on Korean and Japanese, and
   `tracking-wide` reads as broken spacing. Attribute-scoped descendant
   selectors (0,2,1) outrank Tailwind's single-class utilities (0,1,0), so no
   !important is needed and the rule cannot drift as new headings are written.
   Accepted: this also de-uppercases the English strings still out of i18n
   scope. A uniformly sentence-case page beats a half-uppercased one. */
:root[data-lang="ko"] .uppercase,
:root[data-lang="ja"] .uppercase { text-transform: none; }

:root[data-lang="ko"] .tracking-wide,
:root[data-lang="ja"] .tracking-wide { letter-spacing: normal; }
```

- [ ] **Step 7: Run the test and the full suite**

Run: `cd client && npm test -- app/__tests__/layoutLocale.test.tsx`
Expected: PASS, 5 tests.

Run: `cd client && npm test && npm run lint && npm run build`
Expected: all green. The build must succeed — `layout.tsx` is on every route.

- [ ] **Step 8: Commit**

```bash
git add client/app/layout.tsx client/app/globals.css client/app/__tests__/layoutLocale.test.tsx
git commit -m "feat: wire LocaleProvider, head-script lang stamp, CJK typography

Four lines of attribute-scoped CSS neutralize uppercase/tracking-wide
under ko/ja rather than editing 106 Tailwind call sites. Inter gains a
system CJK fallback: per-glyph, so Latin is untouched and nothing new is
downloaded.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Migrate call sites to `t()`

**Files:**
- Modify: `client/app/components/PlayerDetailInsightsTabs.tsx` (TAB_CONFIG at :124-137, tabs `aria-label` at :599, the eight `SectionHeadingWithTooltip` titles)
- Modify: `client/app/components/PlayerEfficiencyBadges.tsx:116-118`
- Modify: `client/app/components/RealmTopShipsTreemapSVG.tsx:404-406`
- Modify: `client/app/components/RealmSelector.tsx` (the `aria-label="Select realm"` listbox label)
- Modify: `client/app/not-found.tsx:4-5`
- Test: `client/app/components/__tests__/localeMigration.test.tsx`

**Interfaces:**
- Consumes: `useT` from `app/context/LocaleContext`; `StringKey` values defined in Task 1.

**Critical constraint:** the English render must be **byte-identical** to today. The existing 176 assertions are the regression net; if any turns red, the `en.ts` string does not match the source and `en.ts` is what must change.

`TAB_CONFIG` is a module-level constant, so its labels cannot call a hook. Convert the label fields to `StringKey`s resolved at render.

- [ ] **Step 1: Write the failing test**

Create `client/app/components/__tests__/localeMigration.test.tsx`:

```tsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import { LocaleProvider } from '../../context/LocaleContext';
import NotFound from '../../not-found';

describe('migrated call sites', () => {
    beforeEach(() => localStorage.clear());

    it('renders English identically by default', () => {
        render(<LocaleProvider><NotFound /></LocaleProvider>);
        expect(screen.getByText('Page Not Found')).toBeInTheDocument();
        expect(screen.getByText('The requested page could not be found.')).toBeInTheDocument();
    });

    it('falls back to English for an untranslated locale', () => {
        localStorage.setItem('bs-locale', 'ko');
        render(<LocaleProvider><NotFound /></LocaleProvider>);
        // Task 7 may translate these; if so, update this assertion to the
        // Korean string rather than deleting the test.
        expect(screen.getByText(/Page Not Found|페이지/)).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npm test -- app/components/__tests__/localeMigration.test.tsx`
Expected: FAIL — `not-found.tsx` is not yet a client component wrapped by the provider, or the strings are still hardcoded.

- [ ] **Step 3: Migrate `TAB_CONFIG`**

In `PlayerDetailInsightsTabs.tsx`, change the constant's type and values:

```tsx
import type { StringKey } from '../i18n';
import { useT } from '../context/LocaleContext';

// Labels are keys, not strings: a module-level constant cannot call a hook, so
// resolution happens at render.
const TAB_CONFIG: Array<{ id: InsightsTabId; labelKey: StringKey; panelLabelKey: StringKey; minHeight: number; }> = [
    { id: 'activity', labelKey: 'insights.tabs.activity', panelLabelKey: 'insights.panel.activity', minHeight: 420 },
    { id: 'ships', labelKey: 'insights.tabs.ships', panelLabelKey: 'insights.panel.ships', minHeight: 560 },
    { id: 'profile', labelKey: 'insights.tabs.profile', panelLabelKey: 'insights.panel.profile', minHeight: 360 },
    { id: 'badges', labelKey: 'insights.tabs.efficiency', panelLabelKey: 'insights.panel.efficiency', minHeight: 360 },
    { id: 'ranked', labelKey: 'insights.tabs.ranked', panelLabelKey: 'insights.panel.ranked', minHeight: 280 },
    { id: 'career', labelKey: 'insights.tabs.clanBattles', panelLabelKey: 'insights.panel.clanBattles', minHeight: 280 },
];
```

Inside the component, add `const t = useT();` and change the render sites:
- `{tab.label}` → `{t(tab.labelKey)}`
- `aria-label="Player insight tabs"` → `aria-label={t('insights.tabsAriaLabel')}`
- any `activeConfig.panelLabel` → `t(activeConfig.panelLabelKey)`

**Do not touch `insightsTabEventByTab`.** Umami event names stay keyed on the tab id.

- [ ] **Step 4: Migrate the eight section headings**

In `PlayerDetailInsightsTabs.tsx`, each `SectionHeadingWithTooltip` keeps its `description` in English (out of scope) and takes its title from `t()`:

```tsx
<SectionHeadingWithTooltip
    title={t('player.section.rankedGamesVsWinRate')}
    description="Each tile represents a pocket of ranked players grouped by total ranked games and overall ranked win rate. The outlined marker shows where this player lands inside that broader field."
/>
```

Apply the same shape to the other seven, using these keys:

| Current title | Key |
|---|---|
| `Ranked Games vs Win Rate` | `player.section.rankedGamesVsWinRate` |
| `Ranked Season Timeline` | `player.section.rankedSeasonTimeline` |
| `Ranked Seasons` | `player.section.rankedSeasons` |
| `Random Battles by Tier` | `player.section.randomBattlesByTier` |
| `Win Rate vs Survival` | `player.section.winRateVsSurvival` |
| `Battles Played Distribution` | `player.section.battlesPlayedDistribution` |
| `Clan Battles vs Win Rate` | `player.section.clanBattlesVsWinRate` |
| `Clan Season Timeline` | `player.section.clanSeasonTimeline` |

- [ ] **Step 5: Migrate `PlayerEfficiencyBadges.tsx`**

```tsx
const t = useT();
// ...
<h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--accent-mid)]">
    {t('player.section.efficiencyBadges')}
</h3>
<InfoTooltip
    label={t('player.section.efficiencyBadges')}
    description="Efficiency badges mark a player's best qualifying ship performances in Tier V+ Random Battles. This table lists each badged ship with its tier, nation, class, and award grade (Expert, I, II, III). Click any column header to sort."
/>
```

- [ ] **Step 6: Migrate the composed treemap heading**

`RealmTopShipsTreemapSVG.tsx:405` currently concatenates fragments. Replace with the template so a translator controls word order:

```tsx
const t = useT();
// ...
<h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
    {t('landing.treemap.heading', {
        realm: displayRealm.toUpperCase(),
        bucket: bucketLabel || 'ships',
        suffix: `${wrPct ? ` · top ${wrPct}%` : ''}${windowLabel ? ` · ${windowLabel}` : ''}`,
    })}
</h2>
```

Verify by eye that the English output still reads `NA most-played ships · top 50% · …` exactly as before.

- [ ] **Step 7: Migrate the two remaining chrome strings**

- `RealmSelector.tsx`: `aria-label="Select realm"` on the listbox → `t('nav.selectRealm')` (add `const t = useT();`).
- `not-found.tsx`: add `"use client";`, `const t = useT();`, and render `{t('notFound.title')}` / `{t('notFound.body')}`.

- [ ] **Step 8: Run the full suite**

Run: `cd client && npm test`
Expected: PASS, including all 176 pre-existing English assertions. **A failure here means an `en.ts` string does not match the component's original text — fix `en.ts`, not the assertion.**

Run: `cd client && npm run lint && npm run build`
Expected: green.

- [ ] **Step 9: Commit**

```bash
git add client/app
git commit -m "feat: route chrome, tab labels, and section headings through t()

English output is byte-identical: en.ts holds the strings verbatim, so the
existing assertions are the regression net. Umami tab events still key on
tab id, never the label.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Populate the Korean and Japanese dictionaries

**Files:**
- Modify: `client/app/i18n/ko.ts`
- Modify: `client/app/i18n/ja.ts`
- Modify: `client/app/i18n/__tests__/dictionaries.test.ts`

**Source of truth:** `agents/work-items/i18n-terminology-research.md`. Do not translate anything not attested there. Anything unsourced is **omitted** with a `// NEEDS-NATIVE-CHECK` comment — omission is how the follow-on work finds itself.

- [ ] **Step 1: Write `ko.ts`**

```ts
import type { StringKey } from './keys';

// Korean. Partial by design: an untranslated string is ABSENT, not a copy of
// the English one. Terminology + register decisions (compact mode names,
// 데미지 over 피해량, 전적 over 통계) are evidenced in
// agents/work-items/i18n-terminology-research.md
export const ko: Partial<Record<StringKey, string>> = {
    'nav.selectRealm': '서버 선택',
    'nav.language': '언어',
    'nav.searchPlayer': '플레이어 검색',
    'nav.searchClan': '클랜 검색',

    'insights.tabs.ships': '함선',
    'insights.tabs.ranked': '랭크전',
    'insights.tabs.clanBattles': '클랜전',

    'player.section.rankedSeasons': '랭크전 시즌',
    'player.section.randomBattlesByTier': '티어별 랜덤전',

    'common.all': '전체',
    'common.tier': '티어',
    'common.battles': '전투 수',
    'common.avgDamage': '평균 데미지',
    'common.winRate': '승률',
    'common.ship': '함선',
    'common.player': '플레이어',
    'common.clan': '클랜',
    'common.season': '시즌',

    // NEEDS-NATIVE-CHECK — no in-game or community source in the corpus.
    // Omitted deliberately; they render English until a native speaker rules.
    //   insights.tabs.activity, insights.tabs.profile, insights.tabs.efficiency
    //   player.section.winRateVsSurvival   (생존율 unattested)
    //   player.section.efficiencyBadges    ("efficiency" is our coinage)
    //   landing.treemap.heading            (word order needs a native ear)
    //   notFound.title, notFound.body
};
```

- [ ] **Step 2: Write `ja.ts`**

```ts
import type { StringKey } from './keys';

// Japanese. Partial by design — see ko.ts. Latin `Tier` is deliberate: that is
// how JP players write it (Tier10, T9), evidenced in the research doc.
export const ja: Partial<Record<StringKey, string>> = {
    'nav.selectRealm': 'サーバー選択',
    'nav.language': '言語',
    'nav.searchPlayer': 'プレイヤー検索',
    'nav.searchClan': 'クラン検索',

    'insights.tabs.ships': '艦艇',
    'insights.tabs.ranked': 'ランク戦',
    'insights.tabs.clanBattles': 'クラン戦',

    'player.section.rankedSeasons': 'ランク戦シーズン',
    'player.section.randomBattlesByTier': 'Tier別ランダム戦',

    'common.all': 'すべて',
    'common.tier': 'Tier',
    'common.battles': '戦闘数',
    'common.avgDamage': '平均ダメージ',
    'common.winRate': '勝率',
    'common.ship': '艦艇',
    'common.player': 'プレイヤー',
    'common.clan': 'クラン',
    'common.season': 'シーズン',

    // NEEDS-NATIVE-CHECK — same residue as ko.ts.
};
```

- [ ] **Step 3: Tighten the coverage assertion**

In `client/app/i18n/__tests__/dictionaries.test.ts`, change the relaxed assertion from Task 1 back to a real floor:

```ts
expect(pct).toBeGreaterThan(0);
```

- [ ] **Step 4: Run the tests**

Run: `cd client && npm test -- app/i18n/__tests__/dictionaries.test.ts`
Expected: PASS. Output prints real coverage, e.g. `i18n coverage ko: 19/44 (43%)`.

Run: `cd client && npm test`
Expected: PASS — English assertions are unaffected because the default locale is `'en'`.

- [ ] **Step 5: Commit**

```bash
git add client/app/i18n
git commit -m "feat: populate ko/ja dictionaries from researched terminology

Sourced from asia.wows-numbers.com (ja/ko), namu.wiki, arca.live/b/wows,
wikiwiki.jp/wows. Unattested strings are omitted behind NEEDS-NATIVE-CHECK
rather than guessed — omission is how the follow-on finds its own worklist.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Visual verification and release

**Files:**
- Modify: `VERSION` (via `./scripts/release.sh patch`)
- Modify: `CLAUDE.md` (one line under key frontend patterns)

- [ ] **Step 1: Restart the dev server against this worktree**

The running server on :3000 serves the **main checkout** and will never show this work. Hardlink `node_modules` — a symlink breaks Next's module resolution (recorded in the project's visual-verify recipe).

```bash
cd /home/august/code/battlestats/.claude/worktrees/locale-toggle/client
cp -al ../../../client/node_modules ./node_modules
echo 'NEXT_PUBLIC_LOCALE_SELECTOR=1' >> .env.local
npm run dev
```

- [ ] **Step 2: Verify visually**

Load `http://localhost:3000` and confirm, in **both themes**:

1. The flag chip renders between the theme toggle and the realm selector, aligned on the same 28px baseline.
2. Opening it shows three rows: UK/English, KR/한국어, JP/日本語, with a check on the active row.
3. Selecting 한국어 changes the tab labels to 함선 / 랭크전 / 클랜전 **immediately, with no reload**, and those labels are **not** uppercased or letter-spaced. If they still are, the `data-lang` effect from Task 2 is not firing.
4. Untranslated labels (Activity, Profile, Efficiency) stay English rather than blank.
5. Narrow the window below 640px: the header stacks and the chip stays on the control row.
6. Load `http://localhost:3000/?lang=ja` in a fresh private window: Japanese renders with correct typography on first paint.

Capture a screenshot of the header in each locale for the PR.

- [ ] **Step 3: Run the release gate**

Run: `cd /home/august/code/battlestats/.claude/worktrees/locale-toggle && ./run_test_suite.sh`
Expected: green. Investigate any failure before proceeding; do not bump on red.

- [ ] **Step 4: Document in `CLAUDE.md`**

Add one line to the key-frontend-patterns list — the file is always-loaded context, so keep it to a single clause pointing at the spec:

```markdown
- `app/context/LocaleContext.tsx` + `app/components/LocaleSelector.tsx` — header language selector (en/ko/ja), `bs-locale` in localStorage, `?lang=` override, dictionaries in `app/i18n/` (`en` total, `ko`/`ja` `Partial` so coverage is countable). **Selector is dark in prod** behind `NEXT_PUBLIC_LOCALE_SELECTOR`; the mechanism ships live, so `?lang=ko` previews it. `:root[data-lang]` rules in `globals.css` neutralize `uppercase`/`tracking-wide` for CJK. Spec: `agents/work-items/client-locale-toggle-spec.md`; terminology: `agents/work-items/i18n-terminology-research.md`
```

- [ ] **Step 5: Run the doctrine pre-commit check**

Invoke the `doctrine-precommit` skill against the diff. Resolve anything it raises.

- [ ] **Step 6: Commit the docs, then cut the release**

```bash
git add CLAUDE.md
git commit -m "docs: record the locale toggle in CLAUDE.md

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

The selector is dark in prod, so this is user-visible nothing: **patch**.

```bash
./scripts/release.sh patch
```

- [ ] **Step 7: Deploy the client**

Mandatory after **every** bump, even a backend-free one: `NEXT_PUBLIC_APP_VERSION` is baked at build time, so the footer stays stale otherwise.

```bash
./client/deploy/deploy_to_droplet.sh battlestats.online
```

Confirm the footer shows the new version and that **no language control appears** in prod — the flag is absent from `/etc/battlestats-client.env`, and its absence is the test.

---

## Self-Review

**Spec coverage.** Every spec section maps to a task: `app/i18n/` structure and key style → Task 1; `LocaleContext`, precedence, `useDisplayLocale`, `data-lang` re-stamp → Task 2; `FlagImage` refactor, `kr.svg`, UK-for-English → Tasks 3–4; feature flag and placement → Tasks 4–5; head-script stamp, CJK typography, font fallback → Task 5; scope of migrated surfaces → Task 6; populated dictionaries and `NEEDS-NATIVE-CHECK` → Task 7; testing, visual verify, patch bump, mandatory client rebuild → Task 8. Non-goals (tables, tooltips, axis labels, OG cards, SEO, auto-detect) appear in no task, correctly.

**One gap found and closed:** the spec's `t(key)` could not express the two runtime-composed headings, which would have forced untranslatable string concatenation. `t(key, vars?)` is adopted, recorded above as an explicit amendment.

**Type consistency.** `StringKey`, `Locale`, `LOCALES`, `isLocale`, `resolveDictionary`, `translate` are defined in Task 1 and used under exactly those names in Tasks 2, 4, 6, 7. `FlagImage`'s prop names (`file`, `title`, `positionClass`, `className`) are identical in Tasks 3 and 4. `isLocaleSelectorEnabled` matches between Task 4's definition and use. `TAB_CONFIG`'s renamed fields (`labelKey`, `panelLabelKey`) are used consistently within Task 6.

**Known sequencing note:** Task 1's coverage assertion must be written relaxed (`toBeGreaterThanOrEqual(0)`) and tightened in Task 7 Step 3, because the dictionaries are empty until then. This is called out in both places rather than left as a trap.
