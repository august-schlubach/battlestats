import React from 'react';
import { chartColors, type ChartTheme } from '../lib/chartTheme';

// Key for the ranked season AWARD marks: a square on point = Silver, a star =
// Gold or above. Bronze and unrated seasons earn no mark, so the legend lists
// none. Kept as a d3-free presentational component (inline SVG) so it can be
// imported normally without pulling d3 into the tabs bundle.
//
// Geometry and metal fills mirror `leagueAwardSymbol` (lib/rankedLeagueGlyph),
// which draws the same marks under the scatter's x-axis and above the season
// lattice's boxes — one league, one mark, everywhere on the tab. `theme` is
// passed (not read from context) so the metals match the charts without a
// provider dependency in tests.
interface RankedLeagueLegendProps {
    theme: ChartTheme;
}

const RankedLeagueLegend: React.FC<RankedLeagueLegendProps> = ({ theme }) => {
    const colors = chartColors[theme];

    // badgeI = gold, badgeII = silver (the same tokens the chart marks use).
    const awards = [
        { label: 'Silver', fill: colors.badgeII, shape: <rect x="3.5" y="3.5" width="7" height="7" transform="rotate(45 7 7)" /> },
        {
            label: 'Gold+',
            fill: colors.badgeI,
            shape: <path d="M7 1 L8.47 4.98 L12.71 5.15 L9.38 7.77 L10.53 11.85 L7 9.5 L3.47 11.85 L4.62 7.77 L1.29 5.15 L5.53 4.98 Z" />,
        },
    ];

    return (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)]" aria-label="Season award legend by highest league">
            <span className="uppercase tracking-wide text-[var(--text-muted)]">Season award</span>
            {awards.map((award) => (
                <span key={award.label} className="inline-flex items-center gap-1.5">
                    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                        {React.cloneElement(award.shape, { fill: award.fill })}
                    </svg>
                    {award.label}
                </span>
            ))}
        </div>
    );
};

export default RankedLeagueLegend;
