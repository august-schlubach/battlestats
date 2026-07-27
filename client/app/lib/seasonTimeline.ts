import * as d3 from 'd3';
import { chartColors, drawSvgMessage, type ChartTheme } from './chartTheme';
import wrColor from './wrColor';

// One dated season on the activity timeline. winRate is a PERCENT (0..100);
// frac is the season's fractional year (2020-07-01 → ~2020.5) so same-year
// seasons resolve to distinct x positions.
export interface TimelineMark {
    label: string;
    battles: number;
    winRate: number;
    frac: number;
}

// Parse a start date to a fractional year. Accepts "YYYY", "YYYY-MM",
// "YYYY-MM-DD"; returns null when there's no 4-digit year.
export const fractionalYear = (startDate?: string | null): number | null => {
    const match = /(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?/.exec(startDate ?? '');
    if (!match) return null;
    const year = Number(match[1]);
    const month = match[2] ? Number(match[2]) - 1 : 0;
    const day = match[3] ? Number(match[3]) : 1;
    const at = Date.UTC(year, month, day);
    const yearStart = Date.UTC(year, 0, 1);
    const yearEnd = Date.UTC(year + 1, 0, 1);
    return year + (at - yearStart) / (yearEnd - yearStart);
};

// A single-row year timeline: horizontal axis over the season span ±1 year
// (year markers only), with one WR-colored marker per played season at its
// fractional-year x. Overlapping markers in a busy year read as a cluster,
// giving a sense of where activity concentrates.
//
// Clan battles only. The ranked tab used to share this with a league-glyph
// variant; it moved to the notional season lattice (`seasonLattice.ts`), which
// draws every season WG has run rather than only the dated, played ones.
export const drawSeasonTimeline = (
    container: HTMLDivElement,
    marks: TimelineMark[],
    svgWidth: number,
    svgHeight: number,
    theme: ChartTheme,
    emptyMessage: string,
): void => {
    const colors = chartColors[theme];

    d3.select(container).selectAll('*').remove();
    if (marks.length === 0) {
        drawSvgMessage(container, emptyMessage, { width: svgWidth, height: 80, color: colors.labelMuted });
        return;
    }

    const compact = svgWidth < 480;
    // left/right match the scatter above so the two plots share edges.
    const margin = compact
        ? { top: 14, right: 8, bottom: 24, left: 38 }
        : { top: 16, right: 18, bottom: 26, left: 52 };
    const axisFontSize = compact ? '9px' : '10px';
    const width = svgWidth - margin.left - margin.right;
    const height = svgHeight - margin.top - margin.bottom;

    const svgRoot = d3.select(container).append('svg')
        .attr('width', svgWidth)
        .attr('height', svgHeight);
    const svg = svgRoot.append('g')
        .attr('transform', `translate(${margin.left}, ${margin.top})`);

    // Domain = season span ±1 year: [firstYear-1, lastYear+1].
    const minYear = Math.floor(Math.min(...marks.map((mark) => mark.frac)));
    const maxYear = Math.floor(Math.max(...marks.map((mark) => mark.frac)));
    const x = d3.scaleLinear().domain([minYear - 1, maxYear + 1]).range([0, width]);
    const years = d3.range(minYear - 1, maxYear + 2);

    const baselineY = height / 2;

    // Year axis doubles as the timeline baseline (softened domain line); ticks +
    // year labels drop below it.
    const axisG = svg.append('g')
        .attr('transform', `translate(0, ${baselineY})`)
        .style('color', colors.labelText)
        // tickPadding drops the year labels below the largest (4×) marker so they
        // never collide.
        .call(d3.axisBottom(x).tickValues(years).tickFormat((year: number) => String(year)).tickSize(6).tickSizeOuter(0).tickPadding(28));
    axisG.selectAll('text').style('font-size', axisFontSize);
    axisG.select('.domain').attr('stroke', colors.gridLine);

    const markTitle = (mark: TimelineMark) => `${mark.label} ${Math.floor(mark.frac)}: ${mark.battles.toLocaleString()} battles, ${mark.winRate.toFixed(1)}% WR`;

    // Circle radius encodes battles played, relative to the player's OWN record:
    // fewest battles → 1× base, most → 4× (linear); a flat/single record sits at
    // the midpoint.
    const battlesValues = marks.map((mark) => mark.battles);
    const minBattles = Math.min(...battlesValues);
    const maxBattles = Math.max(...battlesValues);
    const circleSizeScale = (battles: number): number => (
        maxBattles > minBattles
            ? 1 + 3 * (battles - minBattles) / (maxBattles - minBattles)
            : 2.5
    );

    const dots = svg.append('g')
        .selectAll('circle')
        .data(marks)
        .enter()
        .append('circle')
        .attr('cx', (mark: TimelineMark) => x(mark.frac))
        .attr('cy', baselineY)
        .attr('r', (mark: TimelineMark) => 5 * circleSizeScale(mark.battles))
        .attr('fill', (mark: TimelineMark) => wrColor(mark.winRate))
        .attr('stroke', colors.barBg)
        .attr('stroke-width', 1.5)
        .style('cursor', 'pointer');

    dots.append('title').text(markTitle);

    dots
        .on('mouseover', function onOver(this: SVGCircleElement, _event: MouseEvent, mark: TimelineMark) {
            d3.select(this).attr('r', 5 * circleSizeScale(mark.battles) * 1.4).attr('stroke', colors.labelText);
        })
        .on('mouseout', function onOut(this: SVGCircleElement, _event: MouseEvent, mark: TimelineMark) {
            d3.select(this).attr('r', 5 * circleSizeScale(mark.battles)).attr('stroke', colors.barBg);
        });
};
