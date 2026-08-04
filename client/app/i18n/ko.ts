import type { StringKey } from './keys';

// Korean. Partial by design: an untranslated string is ABSENT, not a copy of
// the English one — that is what makes coverage countable. Terminology and
// register: agents/work-items/i18n-terminology-research.md
export const ko: Partial<Record<StringKey, string>> = {};
