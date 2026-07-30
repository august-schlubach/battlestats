import React from 'react';
import wrColor from './wrColor';

// The shared visual for every dynamic Open Graph card.
//
// Satori (the renderer behind next/og) supports a flexbox subset only: no CSS
// custom properties, no cascade, every container needs an explicit display. So
// the product's `--accent-*` tokens are inlined as literals here and kept
// visually close to the dark theme, which is what X and Discord show by default.
//
// Runbook: agents/runbooks/runbook-audience-growth-instrumentation-2026-07-29.md

const BACKGROUND = '#0d1117';
const SURFACE = '#161b22';
const TEXT_PRIMARY = '#e6edf3';
const TEXT_MUTED = '#8b949e';
const EDGE = '#30363d';

export interface OgStat {
    label: string;
    value: string;
    /** Win-rate percentage: colours the value on the shared WR scale. */
    winRate?: number | null;
}

export interface OgCardLayoutProps {
    /** Small uppercase line above the title, e.g. "PLAYER · ASIA". */
    kicker: string;
    title: string;
    subtitle?: string | null;
    stats?: OgStat[];
    /** Shown instead of stats when there are none (hidden account, cold fetch). */
    fallbackNote?: string | null;
}

export const ogCardLayout = ({
    kicker,
    title,
    subtitle,
    stats = [],
    fallbackNote = null,
}: OgCardLayoutProps): React.ReactElement => (
    <div
        style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            width: '100%',
            height: '100%',
            backgroundColor: BACKGROUND,
            color: TEXT_PRIMARY,
            padding: '64px 72px',
        }}
    >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div
                style={{
                    display: 'flex',
                    fontSize: 26,
                    letterSpacing: 4,
                    color: TEXT_MUTED,
                    textTransform: 'uppercase',
                }}
            >
                {kicker}
            </div>
            <div
                style={{
                    display: 'flex',
                    marginTop: 18,
                    fontSize: title.length > 22 ? 64 : 82,
                    fontWeight: 700,
                    lineHeight: 1.1,
                }}
            >
                {title}
            </div>
            {subtitle ? (
                <div style={{ display: 'flex', marginTop: 14, fontSize: 32, color: TEXT_MUTED }}>
                    {subtitle}
                </div>
            ) : null}
        </div>

        {stats.length ? (
            <div style={{ display: 'flex', gap: 28 }}>
                {stats.map((stat) => (
                    <div
                        key={stat.label}
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            backgroundColor: SURFACE,
                            border: `1px solid ${EDGE}`,
                            borderRadius: 16,
                            padding: '22px 30px',
                            minWidth: 220,
                        }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                fontSize: 58,
                                fontWeight: 700,
                                color: stat.winRate == null ? TEXT_PRIMARY : wrColor(stat.winRate),
                            }}
                        >
                            {stat.value}
                        </div>
                        <div
                            style={{
                                display: 'flex',
                                marginTop: 8,
                                fontSize: 24,
                                letterSpacing: 1,
                                color: TEXT_MUTED,
                                textTransform: 'uppercase',
                            }}
                        >
                            {stat.label}
                        </div>
                    </div>
                ))}
            </div>
        ) : (
            // No stats: one explanatory line, or an empty spacer when the subtitle
            // already says it (a note plus a near-identical subtitle reads as a bug).
            <div style={{ display: 'flex', fontSize: 32, color: TEXT_MUTED }}>
                {fallbackNote ?? ''}
            </div>
        )}

        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderTop: `1px solid ${EDGE}`,
                paddingTop: 24,
                fontSize: 28,
                color: TEXT_MUTED,
            }}
        >
            <div style={{ display: 'flex' }}>battlestats.online</div>
            <div style={{ display: 'flex' }}>WoWs Battlestats</div>
        </div>
    </div>
);

export default ogCardLayout;
