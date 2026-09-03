// Client feature flags. NEXT_PUBLIC_* vars are inlined at build time; read them
// through small functions so unit tests can toggle process.env per-case and so a
// flag has exactly one source of truth.

// Player-page de-waterfall: fetch the clan-members rail immediately after the
// player detail resolves — in parallel with the chart "warmup" — instead of
// gating it behind warmup completion (the legacy provisional serialization).
// Off by default; set NEXT_PUBLIC_PLAYER_DEWATERFALL=1 to enable. Reversible at
// build time. See agents/runbooks (player fetch orchestration) + the prior
// de-waterfall incident — ship behind a visual verify.
export const isPlayerDewaterfallEnabled = (): boolean =>
    process.env.NEXT_PUBLIC_PLAYER_DEWATERFALL === '1';

// Header language selector (en/ko/ja). Off unless explicitly enabled, so the
// control ships dark while ko/ja dictionaries are still filling in. The flag
// gates the SELECTOR ONLY — LocaleContext, the dictionaries, and every t() call
// ship live regardless, so ?lang=ko previews the real thing in prod without
// exposing a control. Set NEXT_PUBLIC_LOCALE_SELECTOR=1 to reveal it.
export const isLocaleSelectorEnabled = (): boolean =>
    process.env.NEXT_PUBLIC_LOCALE_SELECTOR === '1';

// Browser-language defaulting. Off unless explicitly enabled. With it on, a
// visitor who has never chosen a language gets the first locale we support out
// of navigator.languages instead of English; precedence becomes
// ?lang= > bs-locale > navigator.languages > en. The detected value is NEVER
// persisted — bs-locale stays the record of an explicit choice, so one click of
// the selector undoes detection permanently. Measured motivation: ~37% of new
// visitors arrive with a ko/ja browser and six had ever found the selector
// (runbook-locale-adoption-measurement-2026-08-10.md §5). Two consumers must
// agree: LocaleContext (React) and the pre-paint head script (lib/bootScript).
export const isLocaleAutodetectEnabled = (): boolean =>
    process.env.NEXT_PUBLIC_LOCALE_AUTODETECT === '1';

// Timezone realm defaulting. Off unless explicitly enabled. With it on, a
// visitor who has never chosen a realm lands on the realm their browser's IANA
// timezone implies (Asia/Oceania → asia, Europe/Africa/Middle East → eu,
// everything else → na) instead of always na; precedence becomes
// ?realm= > bs-realm > timezone > na. The detected value is NEVER persisted —
// bs-realm stays the record of an explicit choice, so one click of the realm
// selector undoes detection permanently. Motivation: the Korean community
// post links the bare domain (arca.live's filter rejects the ?realm=asia
// link), so KR/JP arrivals were landing on the NA treemap. Two consumers must
// agree: RealmContext (React) and the pre-paint head script (lib/bootScript);
// the mapping itself lives in lib/realmDetect.ts.
export const isRealmAutodetectEnabled = (): boolean =>
    process.env.NEXT_PUBLIC_REALM_AUTODETECT === '1';
