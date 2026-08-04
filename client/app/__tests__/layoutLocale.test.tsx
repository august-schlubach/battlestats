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
