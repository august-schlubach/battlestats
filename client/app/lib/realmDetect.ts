// Timezone → realm default for visitors who have never chosen a realm.
//
// The realm is a WHERE-are-you question, so the signal is the browser's IANA
// timezone, not its language: the locale detector already answers WHO-are-you,
// and a Korean speaker on the NA server must not be flipped to Asia because of
// their keyboard. There is no edge country header to lean on (no Cloudflare,
// no nginx geoip), so this runs client-side like the locale detector.
//
// Mapping, by IANA prefix:
//   Asia/*, Australia/*, Pacific/Auckland      → asia   (WG's Asia cluster: East /
//                                                        Southeast Asia, Oceania)
//   Europe/*, Africa/*, the EU-side Atlantic/* → eu
//   Middle East (IANA files it under Asia/)    → eu     (those players play EU)
//   everything else (Americas, UTC, unknown)   → null   (caller falls back to na)
//
// This list is DUPLICATED in the pre-paint boot script (lib/bootScript.ts),
// which cannot import. bootScript.test.ts drives its case table through this
// function so a drift fails there. Change one, change both.
export type DetectedRealm = 'asia' | 'eu';

// IANA puts the Middle East and the Caucasus under Asia/; WG does not.
export const MIDDLE_EAST_ZONES: readonly string[] = [
    'Asia/Istanbul', 'Asia/Nicosia', 'Asia/Famagusta',
    'Asia/Jerusalem', 'Asia/Tel_Aviv', 'Asia/Hebron', 'Asia/Gaza',
    'Asia/Beirut', 'Asia/Damascus', 'Asia/Amman', 'Asia/Baghdad',
    'Asia/Kuwait', 'Asia/Riyadh', 'Asia/Bahrain', 'Asia/Qatar',
    'Asia/Dubai', 'Asia/Muscat', 'Asia/Aden', 'Asia/Tehran',
    'Asia/Baku', 'Asia/Yerevan', 'Asia/Tbilisi',
];

// The Atlantic/ zones on the European side. Atlantic/Bermuda is deliberately
// absent (NA).
export const EU_ATLANTIC_ZONES: readonly string[] = [
    'Atlantic/Reykjavik', 'Atlantic/Canary', 'Atlantic/Azores',
    'Atlantic/Madeira', 'Atlantic/Faroe', 'Atlantic/Faeroe',
];

export const realmForTimeZone = (timeZone: unknown): DetectedRealm | null => {
    if (typeof timeZone !== 'string' || !timeZone) {
        return null;
    }
    if (MIDDLE_EAST_ZONES.includes(timeZone)) {
        return 'eu';
    }
    if (/^(Asia|Australia)\//.test(timeZone) || timeZone === 'Pacific/Auckland') {
        return 'asia';
    }
    if (/^(Europe|Africa)\//.test(timeZone) || EU_ATLANTIC_ZONES.includes(timeZone)) {
        return 'eu';
    }
    return null;
};

// The browser's own timezone, or null where Intl is missing or throws (old
// WebViews, locked-down privacy modes).
export const browserTimeZone = (): string | null => {
    try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        return typeof tz === 'string' && tz ? tz : null;
    } catch {
        return null;
    }
};
