"use client";

import React, { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck, faChevronDown } from '@fortawesome/free-solid-svg-icons';
import { useLocale, useDisplayLocale, useT } from '../context/LocaleContext';
import { isLocaleSelectorEnabled } from '../lib/featureFlags';
import { trackEvent } from '../lib/umami';
import FlagImage from './FlagImage';
import type { Locale } from '../i18n';

// Native language names, not translated names: a visitor stuck in a language
// they cannot read needs to recognise their own. UK rather than US for English
// — it reads as the language, next to a realm control that offers NA.
const LOCALE_OPTIONS: Array<{ value: Locale; flag: string; nativeName: string }> = [
    { value: 'en', flag: 'uk.svg', nativeName: 'English' },
    { value: 'ko', flag: 'kr.svg', nativeName: '한국어' },
    { value: 'ja', flag: 'japan.svg', nativeName: '日本語' },
];

const INACTIVE_OPTION_COLOR = 'var(--text-secondary)';
const ACTIVE_OPTION_BACKGROUND = 'var(--accent-faint)';
const ACTIVE_OPTION_COLOR = 'var(--text-primary)';

const LocaleSelector: React.FC = () => {
    const { locale, setLocale } = useLocale();
    // Hydration-safe for the chip's flag: SSG renders 'en'.
    const displayLocale = useDisplayLocale();
    const t = useT();
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) {
            return;
        }
        const handleMouseDown = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleMouseDown);
        return () => document.removeEventListener('mousedown', handleMouseDown);
    }, [open]);

    useEffect(() => {
        if (!open) {
            return;
        }
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setOpen(false);
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [open]);

    if (!isLocaleSelectorEnabled()) {
        return null;
    }

    const current = LOCALE_OPTIONS.find((o) => o.value === displayLocale) ?? LOCALE_OPTIONS[0];

    const handleLocaleChange = (next: Locale) => {
        // Keyed on the locale id, never the label: a localized label would
        // fragment this series the moment translations land.
        trackEvent('locale-switch', { locale: next });
        setLocale(next);
        setOpen(false);
    };

    return (
        <div ref={containerRef} className="relative">
            <button
                type="button"
                onClick={() => setOpen((prev) => !prev)}
                // Asymmetric padding, unlike the sibling realm/theme chips' flat
                // 10px: this chip's only content is a 16px flag plus the chevron.
                // 11.5px on the left (3px wider than the siblings, which read too
                // tight against a bare flag) and 19.5px on the right, giving the
                // chevron 8px of breathing room before the edge.
                // Written as pl/pr rather than px + pr so the override is explicit
                // and does not depend on Tailwind's utility emission order.
                className="inline-flex items-center gap-1.5 rounded-md pl-[11.5px] pr-[19.5px] transition-colors"
                style={{
                    height: '28px',
                    border: '1px solid var(--border)',
                    backgroundColor: open ? 'var(--bg-hover)' : 'var(--bg-surface)',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                }}
                aria-label={t('nav.languageCurrent', { language: current.nativeName })}
                aria-expanded={open}
                aria-haspopup="listbox"
            >
                <FlagImage file={current.flag} title={current.nativeName} />
                <FontAwesomeIcon icon={faChevronDown} style={{ fontSize: '10px', marginLeft: '2px', opacity: 0.35 }} aria-hidden="true" />
            </button>

            {open && (
                <div
                    role="listbox"
                    aria-label={t('nav.language')}
                    className="absolute right-0 z-50 mt-1 rounded-lg shadow-lg"
                    style={{
                        width: '132px',
                        top: 'calc(100% + 4px)',
                        border: '1px solid var(--border)',
                        backgroundColor: 'var(--bg-surface)',
                    }}
                >
                    {LOCALE_OPTIONS.map((option) => {
                        const isActive = locale === option.value;
                        return (
                            <button
                                key={option.value}
                                role="option"
                                aria-selected={isActive}
                                type="button"
                                onClick={() => handleLocaleChange(option.value)}
                                className="flex w-full items-center justify-between rounded-md px-2 transition-colors"
                                style={{
                                    height: '32px',
                                    paddingLeft: '8px',
                                    paddingRight: '8px',
                                    color: isActive ? ACTIVE_OPTION_COLOR : INACTIVE_OPTION_COLOR,
                                    cursor: 'pointer',
                                    backgroundColor: isActive ? ACTIVE_OPTION_BACKGROUND : 'transparent',
                                }}
                                onMouseEnter={(e) => {
                                    if (!isActive) {
                                        (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-hover)';
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    (e.currentTarget as HTMLButtonElement).style.backgroundColor = isActive
                                        ? ACTIVE_OPTION_BACKGROUND
                                        : 'transparent';
                                }}
                            >
                                <span className="inline-flex items-center gap-2" style={{ fontSize: '13px', fontWeight: isActive ? 600 : 500 }}>
                                    <FlagImage file={option.flag} title={option.nativeName} />
                                    {option.nativeName}
                                </span>
                                {isActive ? <FontAwesomeIcon icon={faCheck} style={{ fontSize: '11px' }} aria-hidden="true" /> : null}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default LocaleSelector;
