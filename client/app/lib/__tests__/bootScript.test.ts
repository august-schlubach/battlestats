import { buildBootScript } from '../bootScript';

// The boot script is a raw string injected into <head> and run before paint, so
// it can neither import a module nor be exercised by rendering the layout. This
// suite evaluates the actual string in jsdom — the only way its branches are
// covered at all. Its locale branch duplicates detectLocale(); the case table
// below mirrors detectLocale.test.ts on purpose, since a drift between the two
// shows up as a first-frame flash of the wrong typography, which no rendering
// test can see.
const run = (script: string) => {
    new Function(script)();
};

const setLanguages = (languages: string[] | undefined, language?: string) => {
    Object.defineProperty(window.navigator, 'languages', { value: languages, configurable: true });
    Object.defineProperty(window.navigator, 'language', { value: language ?? '', configurable: true });
};

describe('buildBootScript', () => {
    beforeEach(() => {
        localStorage.clear();
        document.documentElement.removeAttribute('data-lang');
        document.documentElement.removeAttribute('data-theme');
        document.documentElement.removeAttribute('data-realm');
        document.documentElement.removeAttribute('lang');
        setLanguages(['en-US']);
    });

    it('stamps the theme and realm defaults it always has', () => {
        run(buildBootScript());
        expect(document.documentElement.dataset.theme).toBe('dark');
        expect(document.documentElement.dataset.realm).toBe('na');
    });

    it('honours stored theme, realm and locale', () => {
        localStorage.setItem('bs-theme', 'light');
        localStorage.setItem('bs-realm', 'eu');
        localStorage.setItem('bs-locale', 'ja');
        run(buildBootScript());
        expect(document.documentElement.dataset.theme).toBe('light');
        expect(document.documentElement.dataset.realm).toBe('eu');
        expect(document.documentElement.dataset.lang).toBe('ja');
        expect(document.documentElement.lang).toBe('ja');
    });

    it('stays English with autodetect off, whatever the browser asks for', () => {
        setLanguages(['ko-KR', 'en-US']);
        run(buildBootScript({ autodetectLocale: false }));
        expect(document.documentElement.dataset.lang).toBe('en');
    });

    it('detects the browser language with autodetect on', () => {
        setLanguages(['ko-KR', 'en-US']);
        run(buildBootScript({ autodetectLocale: true }));
        expect(document.documentElement.dataset.lang).toBe('ko');
        expect(document.documentElement.lang).toBe('ko');
    });

    it('walks navigator.languages in order', () => {
        setLanguages(['en-US', 'ja-JP']);
        run(buildBootScript({ autodetectLocale: true }));
        expect(document.documentElement.dataset.lang).toBe('en');
    });

    it('skips unsupported languages', () => {
        setLanguages(['de-DE', 'ja-JP']);
        run(buildBootScript({ autodetectLocale: true }));
        expect(document.documentElement.dataset.lang).toBe('ja');
    });

    it('falls back to en when nothing is supported', () => {
        setLanguages(['zh-CN', 'pl-PL']);
        run(buildBootScript({ autodetectLocale: true }));
        expect(document.documentElement.dataset.lang).toBe('en');
    });

    it('falls back to navigator.language when languages is unavailable', () => {
        setLanguages(undefined, 'ja-JP');
        run(buildBootScript({ autodetectLocale: true }));
        expect(document.documentElement.dataset.lang).toBe('ja');
    });

    it('lets an explicit stored choice outrank detection', () => {
        // This is what makes a ko-browser visitor who picked English stay in
        // English: bs-locale records explicit choices only.
        localStorage.setItem('bs-locale', 'en');
        setLanguages(['ko-KR']);
        run(buildBootScript({ autodetectLocale: true }));
        expect(document.documentElement.dataset.lang).toBe('en');
    });

    it('never writes the detected locale to storage', () => {
        setLanguages(['ko-KR']);
        run(buildBootScript({ autodetectLocale: true }));
        expect(localStorage.getItem('bs-locale')).toBeNull();
    });
});
