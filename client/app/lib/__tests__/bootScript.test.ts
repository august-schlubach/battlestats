import { buildBootScript } from '../bootScript';
import { realmForTimeZone } from '../realmDetect';

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

// The realm branch duplicates realmForTimeZone() the same way the locale
// branch duplicates detectLocale(): the boot string cannot import. The case
// table below is driven THROUGH realmForTimeZone so a drift between the two
// fails here rather than as a first-frame realm flash.
const setTimeZone = (timeZone: string | undefined) => {
    const resolvedOptions = () => ({ timeZone } as Intl.ResolvedDateTimeFormatOptions);
    jest.spyOn(Intl, 'DateTimeFormat').mockImplementation(
        () => ({ resolvedOptions } as unknown as Intl.DateTimeFormat),
    );
};

describe('buildBootScript realm autodetect', () => {
    beforeEach(() => {
        localStorage.clear();
        document.documentElement.removeAttribute('data-realm');
    });
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('stays na with autodetect off, whatever the timezone', () => {
        setTimeZone('Asia/Seoul');
        run(buildBootScript({ autodetectRealm: false }));
        expect(document.documentElement.dataset.realm).toBe('na');
    });

    it.each([
        ['Asia/Seoul', 'asia'],
        ['Australia/Sydney', 'asia'],
        ['Pacific/Auckland', 'asia'],
        ['Europe/Paris', 'eu'],
        ['Africa/Cairo', 'eu'],
        ['Atlantic/Reykjavik', 'eu'],
        ['Asia/Riyadh', 'eu'],
        ['Asia/Istanbul', 'eu'],
        ['America/Chicago', 'na'],
        ['Pacific/Honolulu', 'na'],
        ['UTC', 'na'],
    ])('agrees with realmForTimeZone for %s → %s', (tz, realm) => {
        setTimeZone(tz);
        run(buildBootScript({ autodetectRealm: true }));
        expect(document.documentElement.dataset.realm).toBe(realm);
        expect(realmForTimeZone(tz) ?? 'na').toBe(realm);
    });

    it('lets a stored realm outrank detection', () => {
        localStorage.setItem('bs-realm', 'na');
        setTimeZone('Asia/Tokyo');
        run(buildBootScript({ autodetectRealm: true }));
        expect(document.documentElement.dataset.realm).toBe('na');
    });

    it('never writes the detected realm to storage', () => {
        setTimeZone('Asia/Tokyo');
        run(buildBootScript({ autodetectRealm: true }));
        expect(document.documentElement.dataset.realm).toBe('asia');
        expect(localStorage.getItem('bs-realm')).toBeNull();
    });

    it('falls back to na when Intl is unavailable', () => {
        jest.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
            throw new Error('no Intl');
        });
        run(buildBootScript({ autodetectRealm: true }));
        expect(document.documentElement.dataset.realm).toBe('na');
    });
});
