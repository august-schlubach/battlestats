import { realmForTimeZone } from '../realmDetect';

// Timezone → realm mapping used by RealmContext (and mirrored in the pre-paint
// boot script). The realm is a WHERE-are-you proxy; language is a WHO-are-you
// proxy and is handled by the locale detector — a Korean speaker on the NA
// server must not be flipped to Asia because of their keyboard.
describe('realmForTimeZone', () => {
    it.each([
        ['Asia/Seoul', 'asia'],
        ['Asia/Tokyo', 'asia'],
        ['Asia/Singapore', 'asia'],
        ['Asia/Kolkata', 'asia'],
        ['Australia/Sydney', 'asia'],
        ['Pacific/Auckland', 'asia'],
        ['Europe/Berlin', 'eu'],
        ['Europe/London', 'eu'],
        ['Africa/Johannesburg', 'eu'],
        ['Atlantic/Reykjavik', 'eu'],
        ['Atlantic/Canary', 'eu'],
    ])('%s → %s', (tz, realm) => {
        expect(realmForTimeZone(tz)).toBe(realm);
    });

    it('sends the Middle East to EU even though IANA files it under Asia/', () => {
        for (const tz of ['Asia/Istanbul', 'Asia/Jerusalem', 'Asia/Riyadh', 'Asia/Dubai', 'Asia/Tehran', 'Asia/Baku']) {
            expect(realmForTimeZone(tz)).toBe('eu');
        }
    });

    it('returns null (caller falls back to na) for the Americas and unknowns', () => {
        for (const tz of ['America/New_York', 'America/Sao_Paulo', 'Pacific/Honolulu', 'Atlantic/Bermuda', 'UTC', 'Etc/GMT+5', '', 'nonsense']) {
            expect(realmForTimeZone(tz)).toBeNull();
        }
    });

    it('tolerates a missing or non-string value', () => {
        expect(realmForTimeZone(undefined)).toBeNull();
        expect(realmForTimeZone(null)).toBeNull();
    });
});
