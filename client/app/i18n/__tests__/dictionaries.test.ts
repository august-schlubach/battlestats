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
        // ko is an empty Partial at this stage (Task 7 populates it), so any
        // key exercises the fallback; 'player.section.efficiencyBadges' is
        // just a representative pick, not a specially-untranslated string.
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
