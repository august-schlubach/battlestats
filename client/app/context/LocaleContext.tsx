"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { isLocale, translate, type Locale, type StringKey } from '../i18n';

const STORAGE_KEY = 'bs-locale';

interface LocaleContextValue {
    locale: Locale;
    setLocale: (l: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue>({
    locale: 'en',
    setLocale: () => undefined,
});

// Resolved synchronously at first render, same precedence the realm uses:
// explicit ?lang= wins, else the stored preference, else English. SSR has no
// window, so it returns 'en' there — see useDisplayLocale for the text that
// renders during SSR.
const resolveInitialLocale = (): Locale => {
    if (typeof window === 'undefined') {
        return 'en';
    }
    try {
        const urlLocale = new URLSearchParams(window.location.search).get('lang');
        if (isLocale(urlLocale)) {
            return urlLocale;
        }
        const stored = localStorage.getItem(STORAGE_KEY);
        if (isLocale(stored)) {
            return stored;
        }
    } catch {
        // URL / localStorage unavailable
    }
    return 'en';
};

export const LocaleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [locale, setLocaleState] = useState<Locale>(resolveInitialLocale);

    // Keep <html lang> and data-lang in sync on EVERY change, including the
    // initial resolve. RealmContext deliberately does not do this for the realm
    // — nothing reads data-realm after load. Here two things do: the CJK
    // typography rule in globals.css, and assistive tech reading lang. Without
    // this effect a switch to ko leaves Korean text under `uppercase` +
    // `tracking-wide`, and a ?lang=ko cold load stamps nothing at all, because
    // the head script reads only localStorage.
    useEffect(() => {
        document.documentElement.lang = locale;
        document.documentElement.dataset.lang = locale;
    }, [locale]);

    const setLocale = useCallback((l: Locale) => {
        setLocaleState(l);
        try {
            localStorage.setItem(STORAGE_KEY, l);
        } catch {
            // localStorage unavailable
        }
    }, []);

    const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);

    return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
};

export const useLocale = (): LocaleContextValue => useContext(LocaleContext);

// Locale for TEXT rendered in the statically-prerendered shell (the header).
// The live locale comes from localStorage, which the server cannot know, so
// rendering it directly would mismatch the SSG 'en' default. Returns 'en' until
// mounted, then the real locale. Same split as useDisplayRealm.
export const useDisplayLocale = (): Locale => {
    const { locale } = useLocale();
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    return mounted ? locale : 'en';
};

export const useT = () => {
    const { locale } = useLocale();
    return useCallback(
        (key: StringKey, vars?: Record<string, string | number>) => translate(locale, key, vars),
        [locale],
    );
};
