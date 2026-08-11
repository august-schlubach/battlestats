import { formatSeasonLabel } from '../shipSeason';

// The standings-window label under the landing treemap heading. Untested until
// 2026-08-11, when a Japanese terminology audit found it rendering "27 6月 –
// 10 8月": day-then-month order was hardcoded British, and the month NAME came
// from `toLocaleDateString(undefined, …)` — the browser's locale, not ours. A
// ja/ko-browser visitor therefore got a Japanese month inside an otherwise
// English page, whatever the language selector said.
//
// UTC throughout: the window bounds are UTC-anchored because the backend
// buckets by UTC date, so these assertions must not drift with the runner's
// timezone.
const JUN_1 = Date.UTC(2026, 5, 1);
const JUL_1 = Date.UTC(2026, 6, 1);   // exclusive end → last day is 30 Jun
const AUG_11 = Date.UTC(2026, 7, 11); // exclusive end → last day is 10 Aug

describe('formatSeasonLabel', () => {
    it('defaults to English, day-then-month', () => {
        expect(formatSeasonLabel(JUN_1, JUL_1)).toBe('1–30 Jun');
        expect(formatSeasonLabel(JUN_1, AUG_11)).toBe('1 Jun – 10 Aug');
    });

    it('renders Japanese month-first and numerically', () => {
        expect(formatSeasonLabel(JUN_1, JUL_1, 'ja')).toBe('6月1日–30日');
        expect(formatSeasonLabel(JUN_1, AUG_11, 'ja')).toBe('6月1日 – 8月10日');
    });

    it('renders Korean month-first, spaced', () => {
        expect(formatSeasonLabel(JUN_1, JUL_1, 'ko')).toBe('6월 1일–30일');
        expect(formatSeasonLabel(JUN_1, AUG_11, 'ko')).toBe('6월 1일 – 8월 10일');
    });

    it('never emits a CJK month name in the English branch', () => {
        // The actual regression: `undefined` as the locale argument meant a
        // ja-browser visitor saw "6月" here even with the UI in English. The
        // English branch is pinned to en-GB now, so no browser setting can
        // reach it. Asserting on the SHAPE rather than one month name keeps
        // this meaningful whatever date the caller passes.
        for (const end of [JUL_1, AUG_11]) {
            expect(formatSeasonLabel(JUN_1, end)).toMatch(/^[\d\s–-]*[A-Za-z]{3}( – |\s|$)/);
            expect(formatSeasonLabel(JUN_1, end)).not.toMatch(/[月日월일]/);
        }
    });

    it('steps back a day, since the end bound is exclusive', () => {
        // JUL_1 is the snapshot's captured_on, so the last INCLUDED day is
        // 30 Jun — an off-by-one here would advertise a window a day longer
        // than the one actually served.
        expect(formatSeasonLabel(JUN_1, JUL_1)).toContain('30');
        expect(formatSeasonLabel(JUN_1, JUL_1)).not.toContain('Jul');
    });
});
