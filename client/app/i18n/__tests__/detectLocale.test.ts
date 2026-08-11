import { detectLocale } from '../index';

// The mapping this pins is duplicated, deliberately, into the pre-paint head
// script (app/lib/bootScript.ts) — that script runs before any module loads and
// so cannot import. bootScript.test.ts drives the same table through the string
// form; keep the two case lists in step.
describe('detectLocale', () => {
    it('folds a regional subtag onto the supported primary', () => {
        expect(detectLocale(['ko-KR'])).toBe('ko');
        expect(detectLocale(['ja-JP'])).toBe('ja');
        expect(detectLocale(['en-GB'])).toBe('en');
    });

    it('walks the array in order, so an English-first visitor stays English', () => {
        // The whole point of reading navigator.languages rather than
        // navigator.language: ['en-US','ko-KR'] is an English preference that
        // also reads Korean, and must not be flipped to Korean.
        expect(detectLocale(['en-US', 'ko-KR'])).toBe('en');
        expect(detectLocale(['ko-KR', 'en-US'])).toBe('ko');
    });

    it('skips unsupported languages rather than stopping at the first entry', () => {
        expect(detectLocale(['de-DE', 'ja-JP'])).toBe('ja');
        expect(detectLocale(['zh-CN', 'pl-PL'])).toBeNull();
    });

    it('is case-insensitive on the primary subtag', () => {
        expect(detectLocale(['KO-kr'])).toBe('ko');
    });

    it('returns null for nothing usable, so the caller can fall back to en', () => {
        expect(detectLocale([])).toBeNull();
        expect(detectLocale(undefined)).toBeNull();
    });

    it('survives malformed entries', () => {
        expect(detectLocale(['', '-', 'ja'])).toBe('ja');
    });
});
