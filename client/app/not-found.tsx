"use client";

import { useT } from './context/LocaleContext';

export default function NotFound() {
    const t = useT();
    return (
        <div className="rounded-md border border-[var(--border)] bg-[var(--bg-surface)] px-6 py-10 text-center text-[var(--text-secondary)]">
            <h2 className="text-xl font-semibold text-[var(--accent-mid)]">{t('notFound.title')}</h2>
            <p className="mt-2 text-sm">{t('notFound.body')}</p>
        </div>
    );
}
