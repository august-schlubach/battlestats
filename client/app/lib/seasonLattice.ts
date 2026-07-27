import * as d3 from 'd3';
import { chartColors, drawSvgMessage, type ChartTheme } from './chartTheme';
import { LEAGUE_AWARD_MIN_ORDER, leagueAwardLabel, leagueAwardSymbol } from './rankedLeagueGlyph';
import wrColor from './wrColor';

// One slot in the season lattice: a season that EXISTS, whether or not this
// player played it. `winRate` is a PERCENT (0..100) and is only meaningful when
// `played` is true. `year` comes from the season's start date and drives the
// year dividers; it is null for a season the catalog has left undated.
// `leagueOrder` is the highest league reached that season (0 Bronze/unknown,
// 2 Silver, 3+ Gold and above) and earns the award mark above the box.
export interface LatticeSlot {
    label: string;
    year: number | null;
    played: boolean;
    battles: number;
    winRate: number;
    leagueOrder: number;
    inProgress: boolean;
}

// A NOTIONAL season timeline: one box per season in the catalog, evenly spaced
// in season order rather than by date. Boxes the player logged battles in are
// lit on the win-rate scale; the rest are drawn as empty outlines. Because the
// axis is season-ordinal, calendar years land at irregular intervals — the
// divider between two boxes marks where the year rolls over, and each year's
// label is centered under its own run of seasons.
//
// The point of the fixed lattice is comparability: every player's ranked record
// is drawn on the same board, so presence, absence, and streaks read directly.
const LATTICE_MIN_BOX = 4;
const LATTICE_MAX_BOX = 22;
const LATTICE_BOX_GAP = 3;
// Room above the boxes for the Silver/Gold+ award marks, and below them for the
// year labels. The award scales DOWN with the box on a narrow chart — at full
// size an 8px star swallows a 7px box and collides with its neighbours — but
// never grows past the size the scatter draws it at.
const LATTICE_AWARD_BAND = 13;
const LATTICE_AWARD_BAND_MIN = 8;
const LATTICE_AWARD_REFERENCE_BOX = 16;
const LATTICE_AWARD_MIN_SCALE = 0.55;
// Breathing room between the award row and the boxes it sits over, so the
// glyphs read as marks ABOVE the season rather than crowding its top edge.
const LATTICE_AWARD_GAP = 6;
const LATTICE_AWARD_GAP_MIN = 3;
const LATTICE_LABEL_GAP = 4;
const LATTICE_LABEL_BAND = 14;
// The tab's shared left text inset (the seasons table's `pl-[15px]`).
const LATTICE_TEXT_INSET = 15;

export const drawSeasonLattice = (
    container: HTMLDivElement,
    slots: LatticeSlot[],
    svgWidth: number,
    svgHeight: number,
    theme: ChartTheme,
    emptyMessage: string,
): void => {
    const colors = chartColors[theme];

    d3.select(container).selectAll('*').remove();
    if (slots.length === 0) {
        drawSvgMessage(container, emptyMessage, { width: svgWidth, height: 80, color: colors.labelMuted });
        return;
    }

    const compact = svgWidth < 480;
    // The lattice has no y-axis, so instead of reserving the scatter's y-label
    // gutter it takes the tab's own 15px text inset — the first box lines up
    // with the seasons table below it. `right` still matches the scatter so both
    // plots END on the same line.
    const margin = compact
        ? { top: 14, right: 8, bottom: 24, left: LATTICE_TEXT_INSET }
        : { top: 16, right: 18, bottom: 26, left: LATTICE_TEXT_INSET };
    const labelFontSize = compact ? '9px' : '10px';
    const width = svgWidth - margin.left - margin.right;
    const height = svgHeight - margin.top - margin.bottom;

    const svgRoot = d3.select(container).append('svg')
        .attr('width', svgWidth)
        .attr('height', svgHeight);
    const svg = svgRoot.append('g')
        .attr('transform', `translate(${margin.left}, ${margin.top})`);

    // Even pitch across the full width; the box fills its slot less a gap, so a
    // long catalog shrinks the boxes rather than overflowing.
    const pitch = width / slots.length;
    const side = Math.max(LATTICE_MIN_BOX, Math.min(LATTICE_MAX_BOX, pitch - LATTICE_BOX_GAP));
    const slotCenter = (index: number) => pitch * (index + 0.5);

    // Vertical stack: a reserved award band, the boxes, then the year labels.
    // The band is held even when the player earned nothing, so the box row sits
    // at the same height on every player's chart.
    const awardScale = Math.max(LATTICE_AWARD_MIN_SCALE, Math.min(1, side / LATTICE_AWARD_REFERENCE_BOX));
    const awardBand = Math.max(LATTICE_AWARD_BAND_MIN, LATTICE_AWARD_BAND * awardScale);
    const awardGap = Math.max(LATTICE_AWARD_GAP_MIN, LATTICE_AWARD_GAP * awardScale);
    const contentHeight = awardBand + awardGap + side + LATTICE_LABEL_GAP + LATTICE_LABEL_BAND;
    const contentTop = Math.max(0, (height - contentHeight) / 2);
    const awardY = contentTop + awardBand / 2;
    const bandTop = contentTop + awardBand + awardGap;

    const slotTitle = (slot: LatticeSlot) => {
        const when = slot.year == null ? '' : ` (${slot.year})`;
        if (!slot.played) return `${slot.label}${when}: not played${slot.inProgress ? ' yet — season in progress' : ''}`;
        const award = slot.leagueOrder >= LEAGUE_AWARD_MIN_ORDER ? `${leagueAwardLabel(slot.leagueOrder)} · ` : '';
        return `${slot.label}${when}: ${award}${slot.battles.toLocaleString()} battles, ${slot.winRate.toFixed(1)}% WR${slot.inProgress ? ' — season in progress' : ''}`;
    };

    // Year dividers: a hairline between the last slot of one year and the first
    // of the next. Undated slots inherit no divider — they can't be placed.
    interface YearRun { x: number; year: number; from: number; to: number }
    const dividers: YearRun[] = [];
    let runStart = 0;
    slots.forEach((slot, index) => {
        const previousYear = index === 0 ? null : slots[index - 1].year;
        if (index > 0 && slot.year != null && previousYear != null && slot.year !== previousYear) {
            dividers.push({ x: pitch * index, year: previousYear, from: runStart, to: index - 1 });
            runStart = index;
        }
    });
    const lastYear = slots[slots.length - 1].year;
    if (lastYear != null) dividers.push({ x: width, year: lastYear, from: runStart, to: slots.length - 1 });

    const dividerTop = bandTop - 4;
    const dividerBottom = bandTop + side + 4;
    svg.append('g')
        .selectAll('line')
        .data(dividers.slice(0, -1))
        .enter()
        .append('line')
        .attr('x1', (divider: YearRun) => divider.x)
        .attr('x2', (divider: YearRun) => divider.x)
        .attr('y1', dividerTop)
        .attr('y2', dividerBottom)
        .attr('stroke', colors.gridLine)
        .attr('stroke-width', 1);

    // Year labels sit under the middle of their own run of seasons. A run too
    // narrow for its label is dropped rather than overprinted.
    // A four-digit year is ~22px at 10px type, so a single-season year still
    // gets its label on a full-width chart; narrower runs are dropped rather
    // than left to collide with the neighbouring year.
    const minLabelWidth = compact ? 20 : 23;
    svg.append('g')
        .selectAll('text')
        .data(dividers.filter((divider: YearRun) => pitch * (divider.to - divider.from + 1) >= minLabelWidth))
        .enter()
        .append('text')
        .attr('x', (divider: YearRun) => (slotCenter(divider.from) + slotCenter(divider.to)) / 2)
        .attr('y', dividerBottom + 14)
        .attr('text-anchor', 'middle')
        .attr('fill', colors.labelText)
        .style('font-size', labelFontSize)
        .text((divider: YearRun) => String(divider.year));

    const boxes = svg.append('g')
        .selectAll('rect')
        .data(slots)
        .enter()
        .append('rect')
        .attr('x', (slot: LatticeSlot, index: number) => slotCenter(index) - side / 2)
        .attr('y', bandTop)
        .attr('width', side)
        .attr('height', side)
        // Unplayed seasons are outline-only: a dark FILL would read as a bad
        // win rate on the wrColor scale, which bottoms out dark.
        .attr('fill', (slot: LatticeSlot) => (slot.played ? wrColor(slot.winRate) : 'none'))
        .attr('stroke', (slot: LatticeSlot) => (slot.played ? colors.barBg : colors.gridLine))
        .attr('stroke-width', 1)
        .style('cursor', 'pointer');

    boxes.append('title').text(slotTitle);

    // Award marks: Silver and Gold+ seasons carry the same metal glyph the
    // scatter puts under its x-axis, centered above the season's box. Bronze and
    // unplayed seasons carry none. Decorative — the box's own title already
    // names the league, so these stay out of the pointer path.
    interface AwardedSlot { slot: LatticeSlot; index: number }
    const symbolGen = d3.symbol();
    const awarded: AwardedSlot[] = slots
        .map((slot, index) => ({ slot, index }))
        .filter(({ slot }) => slot.played && slot.leagueOrder >= LEAGUE_AWARD_MIN_ORDER);

    svg.append('g')
        .selectAll('path')
        .data(awarded)
        .enter()
        .append('path')
        .attr('transform', ({ slot, index }: AwardedSlot) => {
            const award = leagueAwardSymbol(slot.leagueOrder, colors);
            return `translate(${slotCenter(index)}, ${awardY}) rotate(${award.rotate})`;
        })
        .attr('d', ({ slot }: AwardedSlot) => {
            const award = leagueAwardSymbol(slot.leagueOrder, colors);
            // d3 symbol size is an AREA, so the linear scale is squared.
            return symbolGen.type(award.type).size(award.size * awardScale ** 2)();
        })
        .attr('fill', ({ slot }: AwardedSlot) => leagueAwardSymbol(slot.leagueOrder, colors).color)
        .style('pointer-events', 'none');

    boxes
        .on('mouseover', function onOver(this: SVGRectElement) {
            d3.select(this).raise().attr('stroke', colors.labelText).attr('stroke-width', 2);
        })
        .on('mouseout', function onOut(this: SVGRectElement, _event: MouseEvent, slot: LatticeSlot) {
            d3.select(this)
                .attr('stroke', slot.played ? colors.barBg : colors.gridLine)
                .attr('stroke-width', 1);
        });
};
