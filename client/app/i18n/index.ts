import type { StringKey } from './keys';
import { en } from './en';
import { ko } from './ko';
import { ja } from './ja';

export type { StringKey };

export type Locale = 'en' | 'ko' | 'ja';

export const LOCALES: Locale[] = ['en', 'ko', 'ja'];

export const isLocale = (value: unknown): value is Locale =>
    typeof value === 'string' && (LOCALES as string[]).includes(value);

// First supported locale in a browser's language list, or null when it asks for
// nothing we speak. Two properties carry the whole design:
//   - it walks the list IN ORDER, so ['en-US','ko-KR'] resolves to English. A
//     visitor who prefers English and also reads Korean must not be flipped.
//   - it matches on the PRIMARY SUBTAG, folding ko-KR→ko, ja-JP→ja, en-GB→en.
// Caller decides what to do with null (LocaleContext falls back to 'en'). This
// mapping is duplicated in the pre-paint head script — see lib/bootScript.ts,
// which cannot import — so any change here needs the same change there.
export const detectLocale = (languages: readonly string[] | undefined): Locale | null => {
    for (const tag of languages ?? []) {
        const primary = String(tag ?? '').split('-')[0].toLowerCase();
        if (isLocale(primary)) {
            return primary;
        }
    }
    return null;
};

const DICTIONARIES: Record<Locale, Partial<Record<StringKey, string>>> = { en, ko, ja };

export const resolveDictionary = (locale: Locale): Partial<Record<StringKey, string>> =>
    DICTIONARIES[locale] ?? en;

// `{name}` substitution. An unmatched placeholder is left in place rather than
// blanked: a visible `{bucket}` is a bug report, an empty string is silence.
const interpolate = (template: string, vars?: Record<string, string | number>): string => {
    if (!vars) {
        return template;
    }
    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
        name in vars ? String(vars[name]) : match);
};

// Falls back to English when the locale lacks the key. Never throws, never
// renders a raw key — an untranslated string shows in English, which is a
// degraded but honest result.
export const translate = (
    locale: Locale,
    key: StringKey,
    vars?: Record<string, string | number>,
): string => interpolate(resolveDictionary(locale)[key] ?? en[key], vars);
