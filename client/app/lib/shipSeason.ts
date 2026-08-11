// Ship-standings window label formatter.
//
// The ship standings (treemap, /ship leaderboards, profile medals) are a rolling
// trailing 30-day window recomputed nightly — there is no fixed "season" anymore
// (the fixed-fortnight model was retired 2026-06-15). This module keeps the one
// helper still needed: a UTC date-range label for that window's [start, end)
// bounds, e.g. "11–24 May". Dates are formatted in UTC since the window bounds
// are UTC-anchored (the backend buckets by UTC date).

// Range label from [start, end) bounds, e.g. "11–24 May". `endMs` is the
// exclusive end (== the snapshot's captured_on), so the last included day is
// endMs - 1 day.
//
// Locale-aware since 2026-08-11, after a Japanese terminology audit found the
// label rendering as "27 6月 – 10 8月". TWO bugs met there:
//
//  1. day-then-month order was hardcoded (British form), while Korean and
//     Japanese both write month-then-day; and
//  2. the month name came from `toLocaleDateString(undefined, …)`, i.e. the
//     BROWSER's locale rather than ours — so a ja/ko-browser visitor got a
//     Japanese month name inside an otherwise English page, whatever the
//     language selector said. That is why this takes an explicit locale and
//     pins the English branch to en-GB: no formatter here may consult the
//     browser again.
//
// CJK renders numerically (6月27日 / 6월 27일) rather than via a month name,
// which also sidesteps per-character wrapping in the narrow branch.
export function formatSeasonLabel(startMs: number, endMs: number, locale: 'en' | 'ko' | 'ja' = 'en'): string {
    const start = new Date(startMs);
    const lastDay = new Date(endMs - 24 * 60 * 60 * 1000);
    const day = (d: Date) => d.getUTCDate();
    const month = (d: Date) => d.getUTCMonth() + 1;
    const sameMonth = start.getUTCMonth() === lastDay.getUTCMonth();

    if (locale === 'ja' || locale === 'ko') {
        // Japanese closes the month up (6月27日); Korean spaces it (6월 27일).
        const fmt = locale === 'ja'
            ? (d: Date) => `${month(d)}月${day(d)}日`
            : (d: Date) => `${month(d)}월 ${day(d)}일`;
        const dayUnit = locale === 'ja' ? '日' : '일';
        return sameMonth
            ? `${fmt(start)}–${day(lastDay)}${dayUnit}`
            : `${fmt(start)} – ${fmt(lastDay)}`;
    }

    const mon = (d: Date) => d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
    return sameMonth
        ? `${day(start)}–${day(lastDay)} ${mon(lastDay)}`
        : `${day(start)} ${mon(start)} – ${day(lastDay)} ${mon(lastDay)}`;
}
