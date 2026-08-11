import { en } from '../en';
import { ko } from '../ko';
import { ja } from '../ja';
import { translate, LOCALES, resolveDictionary } from '../index';
import type { StringKey } from '../keys';

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

    // The untranslated residue is a DECISION, not a backlog: ko.ts's
    // NEEDS-NATIVE-CHECK block omits each of these on the record (unattested
    // connectives, our own coinages, or out-of-scope by the locale spec), and
    // the research doc argues them individually. Pinning the set means a future
    // pass cannot quietly guess a rendering, and cannot quietly drop one either
    // — both directions fail here and send the reader to the reasoning first.
    const NEEDS_NATIVE_CHECK: StringKey[] = [
        // "Window" as a span of time is our own framing, not a WoWS term, and
        // the 2026-08-11 corpus pass found no analogue: the ja player table
        // says 期間平均値 for its averages block but never labels a window on
        // its own, and the ko table's counterpart (전투 평균치) is a different
        // word entirely. WR itself stays Latin by the documented rule, so a
        // rendering would be a coinage bolted to an abbreviation.
        'battleHistory.tile.windowWr',
        'insights.tabsAriaLabel',
        'landing.treemap.infoLabel',
        'player.section.battlesPlayedDistribution',
        'player.section.clanBattlesVsWinRate',
        'player.section.clanSeasonTimeline',
        'player.section.efficiencyBadges',
        'player.section.rankedGamesVsWinRate',
        'player.section.rankedSeasonTimeline',
        'player.section.winRateVsSurvival',
    ];

    it('the untranslated residue is exactly the documented NEEDS-NATIVE-CHECK set', () => {
        const enKeys = Object.keys(en) as StringKey[];
        for (const [name, dict] of [['ko', ko], ['ja', ja]] as const) {
            const missing = enKeys.filter((k) => !(k in dict)).sort();
            expect({ [name]: missing }).toEqual({ [name]: [...NEEDS_NATIVE_CHECK].sort() });
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
        // Key-agnostic by design: ko/ja are actively-populated Partials now
        // (Task 7), so pinning one specific StringKey as "the untranslated
        // one" would make this test brittle — a future translation of that
        // exact key would break it for a reason unrelated to what it checks
        // (the fallback mechanism, not any particular key's coverage state).
        // Instead, find whichever key ko currently lacks and assert the
        // fallback against it.
        const enKeys = Object.keys(en) as StringKey[];
        const missingKey = enKeys.find((k) => !(k in ko));
        expect(missingKey).toBeDefined();
        expect(translate('ko', missingKey as StringKey))
            .toBe(en[missingKey as StringKey]);
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
