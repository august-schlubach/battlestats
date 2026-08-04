import type { StringKey } from './keys';
import { en } from './en';
import { ko } from './ko';
import { ja } from './ja';

export type { StringKey };

export type Locale = 'en' | 'ko' | 'ja';

export const LOCALES: Locale[] = ['en', 'ko', 'ja'];

export const isLocale = (value: unknown): value is Locale =>
    typeof value === 'string' && (LOCALES as string[]).includes(value);

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
