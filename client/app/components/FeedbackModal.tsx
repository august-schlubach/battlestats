"use client";

import React, { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { trackEvent } from '../lib/umami';
import { useT, useLocale } from '../context/LocaleContext';
import { useRealm } from '../context/RealmContext';
import type { StringKey } from '../i18n';

interface FeedbackModalProps {
    open: boolean;
    onClose: () => void;
}

type SubmitState = 'idle' | 'submitting' | 'success' | 'error';

// Machine values — sent verbatim to the backend, never the translated label.
// Must stay in sync with server/warships/models.py's Feedback.Category.
type Category = 'language_issue' | 'feature_suggestion' | 'bug_report';

const CATEGORIES: Category[] = ['language_issue', 'feature_suggestion', 'bug_report'];

const CATEGORY_LABEL_KEY: Record<Category, StringKey> = {
    language_issue: 'feedback.category.languageIssue',
    feature_suggestion: 'feedback.category.featureSuggestion',
    bug_report: 'feedback.category.bugReport',
};

const MESSAGE_MAX_LENGTH = 2000;

interface FieldErrors {
    category?: string;
    message?: string;
}

const inputClass =
    'w-full rounded border border-[var(--border)] bg-[var(--bg-page)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:border-[var(--accent-mid)] focus:outline-none';

const FeedbackModal: React.FC<FeedbackModalProps> = ({ open, onClose }) => {
    const t = useT();
    const { locale } = useLocale();
    const { realm } = useRealm();
    const path = usePathname();

    const [category, setCategory] = useState<Category | ''>('');
    const [message, setMessage] = useState('');
    const [website, setWebsite] = useState(''); // honeypot
    const [state, setState] = useState<SubmitState>('idle');
    const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
    const [genericError, setGenericError] = useState('');
    const loadedAtRef = useRef<number>(0);
    const firstRadioRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!open) return;
        loadedAtRef.current = Date.now();
        setState('idle');
        setFieldErrors({});
        setGenericError('');
        setCategory('');
        setMessage('');
        setWebsite('');
        setTimeout(() => firstRadioRef.current?.focus(), 30);

        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    useEffect(() => {
        if (state !== 'success') return;
        const timer = setTimeout(onClose, 2000);
        return () => clearTimeout(timer);
    }, [state, onClose]);

    if (!open) return null;

    const trimmedMessage = message.trim();
    const canSubmit = category !== '' && trimmedMessage.length > 0;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canSubmit) return;
        setState('submitting');
        setFieldErrors({});
        setGenericError('');
        try {
            const res = await fetch('/api/feedback/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    category,
                    message: trimmedMessage,
                    locale,
                    realm,
                    path,
                    website,
                    form_loaded_at: loadedAtRef.current,
                }),
            });
            if (res.status === 201) {
                trackEvent('feedback-submit', { category, status: 'success' });
                setState('success');
                return;
            }
            if (res.status === 400) {
                const body = await res.json().catch(() => ({}));
                const errs: FieldErrors = {};
                for (const k of ['category', 'message'] as const) {
                    if (body[k]) errs[k] = Array.isArray(body[k]) ? body[k][0] : String(body[k]);
                }
                setFieldErrors(errs);
                setGenericError(t('feedback.error.correctBelow'));
                trackEvent('feedback-submit', { category, status: 'invalid' });
                setState('error');
                return;
            }
            setGenericError(t('feedback.error.generic'));
            trackEvent('feedback-submit', { category, status: 'error' });
            setState('error');
        } catch {
            setGenericError(t('feedback.error.network'));
            trackEvent('feedback-submit', { category, status: 'error' });
            setState('error');
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-modal-title"
        >
            <div
                className="w-full max-w-[480px] rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] p-5 shadow-xl"
            >
                <div className="mb-3 flex items-start justify-between">
                    <h2
                        id="feedback-modal-title"
                        className="text-base font-semibold text-[var(--text-primary)]"
                    >
                        {t('feedback.modal.title')}
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label={t('feedback.close')}
                        className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    >
                        ×
                    </button>
                </div>

                {state === 'success' ? (
                    <div className="py-6 text-center text-sm text-[var(--text-primary)]">
                        {t('feedback.success')}
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-3">
                        {/* Honeypot — hidden from users, visible to naive bots */}
                        <input
                            type="text"
                            name="website"
                            tabIndex={-1}
                            aria-hidden="true"
                            autoComplete="off"
                            value={website}
                            onChange={(e) => setWebsite(e.target.value)}
                            style={{ position: 'absolute', left: '-9999px', width: 1, height: 1 }}
                        />

                        <div className="space-y-2">
                            {CATEGORIES.map((cat, i) => (
                                <label
                                    key={cat}
                                    className="flex items-center gap-2 text-sm text-[var(--text-primary)]"
                                >
                                    <input
                                        ref={i === 0 ? firstRadioRef : undefined}
                                        type="radio"
                                        name="feedback-category"
                                        value={cat}
                                        checked={category === cat}
                                        onChange={() => setCategory(cat)}
                                        required
                                        className="h-4 w-4 shrink-0 border-[var(--border)] text-[var(--accent-mid)] focus:outline-none"
                                    />
                                    {t(CATEGORY_LABEL_KEY[cat])}
                                </label>
                            ))}
                            {fieldErrors.category && (
                                <p className="text-xs text-red-500">{fieldErrors.category}</p>
                            )}
                        </div>

                        <div>
                            <textarea
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                placeholder={t('feedback.messagePlaceholder')}
                                required
                                maxLength={MESSAGE_MAX_LENGTH}
                                rows={4}
                                className={`${inputClass} resize-none`}
                            />
                            <p className="mt-1 text-right text-[10px] text-[var(--text-secondary)]">
                                {message.length}/{MESSAGE_MAX_LENGTH}
                            </p>
                            {fieldErrors.message && (
                                <p className="mt-1 text-xs text-red-500">{fieldErrors.message}</p>
                            )}
                        </div>

                        {state === 'error' && genericError && (
                            <p className="text-xs text-red-500">{genericError}</p>
                        )}

                        <div className="flex justify-end gap-2 pt-2">
                            <button
                                type="button"
                                onClick={onClose}
                                className="whitespace-nowrap rounded border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-page)]"
                            >
                                {t('feedback.cancel')}
                            </button>
                            <button
                                type="submit"
                                disabled={state === 'submitting' || !canSubmit}
                                className="whitespace-nowrap rounded bg-[var(--accent-mid)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-dark)] disabled:opacity-50"
                            >
                                {state === 'submitting' ? t('feedback.submitting') : t('feedback.submit')}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
};

export default FeedbackModal;
