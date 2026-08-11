// The <head> script's BEHAVIOUR now lives in lib/bootScript.ts and is executed
// for real in lib/__tests__/bootScript.test.ts — that suite is what proves the
// stamping works. What can only be checked here, by source, is that layout.tsx
// actually injects it and passes the autodetect flag through: a server
// component rendering a raw string into <head> has nothing to assert against.
import { readFileSync } from 'fs';
import { join } from 'path';

describe('layout head script', () => {
    const source = readFileSync(join(process.cwd(), 'app/layout.tsx'), 'utf8');

    it('injects the boot script before paint', () => {
        expect(source).toContain('buildBootScript(');
        expect(source).toContain('dangerouslySetInnerHTML');
    });

    it('passes the autodetect flag into the boot script', () => {
        // Without this the pre-paint stamp and LocaleContext disagree, and a
        // detected ko visitor renders one frame under the Latin typography
        // rules before React corrects it.
        expect(source).toContain('autodetectLocale: isLocaleAutodetectEnabled()');
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
