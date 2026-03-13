import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

type D3Selection = ReturnType<typeof d3.select>;

interface TierTypeHeatmapSVGProps {
    playerId: number;
    svgWidth?: number;
    svgHeight?: number;
}

interface TierTypeTile {
    ship_type: string;
    ship_tier: number;
    count: number;
}

interface TierTypeTrendPoint {
    ship_type: string;
    avg_tier: number;
    count: number;
}

interface TierTypePlayerCell {
    ship_type: string;
    ship_tier: number;
    pvp_battles: number;
    wins: number;
    win_ratio: number;
}

interface TierTypePayload {
    metric: 'tier_type';
    label: string;
    x_label: string;
    y_label: string;
    tracked_population: number;
    tiles: TierTypeTile[];
    trend: TierTypeTrendPoint[];
    player_cells: TierTypePlayerCell[];
}

const SHIP_TYPE_ORDER = ['Destroyer', 'Cruiser', 'Battleship', 'Aircraft Carrier', 'Submarine'];

const selectColorByWR = (winRatio: number): string => {
    if (winRatio > 0.65) return '#810c9e';
    if (winRatio >= 0.60) return '#D042F3';
    if (winRatio >= 0.56) return '#3182bd';
    if (winRatio >= 0.54) return '#74c476';
    if (winRatio >= 0.52) return '#a1d99b';
    if (winRatio >= 0.50) return '#fed976';
    if (winRatio >= 0.45) return '#fd8d3c';
    if (winRatio >= 0.40) return '#e6550d';
    return '#a50f15';
};

const buildShipTypeOrderMap = (): Map<string, number> => {
    return new Map(SHIP_TYPE_ORDER.map((label, index) => [label, index]));
};

const formatTrendDelta = (delta: number | null): string => {
    if (delta == null) {
        return 'Type trend unavailable';
    }

    if (Math.abs(delta) < 0.15) {
        return 'Aligned with type trend';
    }

    const direction = delta > 0 ? 'above' : 'below';
    return `${Math.abs(delta).toFixed(1)} tiers ${direction} type trend`;
};

const renderTextCard = (group: D3Selection, lines: Array<{ text: string; fill: string; weight?: string; size?: string }>) => {
    const text = group.append('text')
        .attr('x', 0)
        .attr('y', 0)
        .attr('text-anchor', 'end')
        .attr('dominant-baseline', 'hanging');

    lines.forEach((line, index) => {
        text.append('tspan')
            .attr('x', 0)
            .attr('dy', index === 0 ? 0 : 14)
            .style('font-size', line.size ?? '10px')
            .style('font-weight', line.weight ?? '400')
            .style('fill', line.fill)
            .text(line.text);
    });

    const node = text.node();
    if (!node) {
        return;
    }

    const box = node.getBBox();
    group.insert('rect', 'text')
        .attr('x', box.x - 8)
        .attr('y', box.y - 5)
        .attr('width', box.width + 16)
        .attr('height', box.height + 10)
        .attr('rx', 5)
        .attr('fill', 'rgba(255, 255, 255, 0.95)')
        .attr('stroke', '#cbd5e1');
};

const drawMessage = (containerElement: HTMLDivElement, message: string, svgWidth: number, svgHeight: number) => {
    const container = d3.select(containerElement);
    container.selectAll('*').remove();

    const svg = container.append('svg')
        .attr('width', svgWidth)
        .attr('height', svgHeight);

    svg.append('text')
        .attr('x', 16)
        .attr('y', 24)
        .style('fill', '#6b7280')
        .style('font-size', '12px')
        .text(message);
};

const normalizeShipTypes = (payload: TierTypePayload): string[] => {
    const orderMap = buildShipTypeOrderMap();
    const labels = new Set<string>();

    payload.tiles.forEach((row: TierTypeTile) => labels.add(row.ship_type));
    payload.trend.forEach((row: TierTypeTrendPoint) => labels.add(row.ship_type));
    payload.player_cells.forEach((row: TierTypePlayerCell) => labels.add(row.ship_type));

    return [...labels].sort((left, right) => {
        const leftOrder = orderMap.get(left) ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = orderMap.get(right) ?? Number.MAX_SAFE_INTEGER;
        if (leftOrder !== rightOrder) {
            return leftOrder - rightOrder;
        }

        return left.localeCompare(right);
    });
};

const normalizeTiers = (payload: TierTypePayload): number[] => {
    const tiers = new Set<number>();

    payload.tiles.forEach((row: TierTypeTile) => tiers.add(row.ship_tier));
    payload.player_cells.forEach((row: TierTypePlayerCell) => tiers.add(row.ship_tier));

    return [...tiers].sort((left, right) => right - left);
};

const drawChart = (
    containerElement: HTMLDivElement,
    payload: TierTypePayload,
    svgWidth: number,
    svgHeight: number,
) => {
    if (!payload.tiles.length) {
        drawMessage(containerElement, 'No tier and ship-type population data available.', svgWidth, 112);
        return;
    }

    if (payload.player_cells.length < 2) {
        drawMessage(containerElement, 'This captain does not have enough tier and ship-type variety yet to draw a useful heatmap.', svgWidth, 112);
        return;
    }

    const shipTypes = normalizeShipTypes(payload);
    const tiers = normalizeTiers(payload);
    if (!shipTypes.length || !tiers.length) {
        drawMessage(containerElement, 'Unable to build tier and ship-type chart axes.', svgWidth, 112);
        return;
    }

    const margin = { top: 56, right: 84, bottom: 42, left: 64 };
    const width = svgWidth - margin.left - margin.right;
    const height = svgHeight - margin.top - margin.bottom;
    const container = d3.select(containerElement);
    container.selectAll('*').remove();

    const svgRoot = container.append('svg')
        .attr('width', svgWidth)
        .attr('height', svgHeight);

    const svg = svgRoot.append('g')
        .attr('transform', `translate(${margin.left}, ${margin.top})`);

    const x = d3.scaleBand()
        .domain(shipTypes)
        .range([0, width])
        .padding(0.12);

    const y = d3.scaleBand()
        .domain(tiers.map((value) => String(value)))
        .range([0, height])
        .padding(0.12);

    const minTier = Math.min(...tiers);
    const maxTier = Math.max(...tiers);
    const yCenterOffset = y.bandwidth() / 2;
    const yTrend = d3.scaleLinear()
        .domain([minTier, maxTier])
        .range([height - yCenterOffset, yCenterOffset]);

    const tileByKey = new Map(payload.tiles.map((row: TierTypeTile) => [`${row.ship_type}:${row.ship_tier}`, row]));
    const playerCellByKey = new Map(payload.player_cells.map((row: TierTypePlayerCell) => [`${row.ship_type}:${row.ship_tier}`, row]));
    const trendByType = new Map(payload.trend.map((row: TierTypeTrendPoint) => [row.ship_type, row]));
    const maxTileCount = d3.max(payload.tiles, (row: TierTypeTile) => row.count) || 1;
    const maxPlayerBattles = d3.max(payload.player_cells, (row: TierTypePlayerCell) => row.pvp_battles) || 1;
    const tileColor = d3.scaleSequential(d3.interpolateBlues)
        .domain([0, maxTileCount]);
    const playerRadius = d3.scaleSqrt()
        .domain([0, maxPlayerBattles])
        .range([0, 14]);

    svg.append('g')
        .attr('class', 'tier-type-grid')
        .selectAll('rect')
        .data(payload.tiles)
        .enter()
        .append('rect')
        .attr('x', (row: TierTypeTile) => x(row.ship_type) ?? 0)
        .attr('y', (row: TierTypeTile) => y(String(row.ship_tier)) ?? 0)
        .attr('width', x.bandwidth())
        .attr('height', y.bandwidth())
        .attr('rx', 4)
        .attr('fill', (row: TierTypeTile) => tileColor(row.count))
        .attr('stroke', '#dbe9f6')
        .attr('stroke-width', 0.8);

    svg.append('g')
        .attr('transform', `translate(0, ${height})`)
        .style('color', '#64748b')
        .call(d3.axisBottom(x).tickSize(0))
        .selectAll('text')
        .style('font-size', '10px')
        .style('font-weight', '500');

    svg.append('g')
        .style('color', '#475569')
        .call(d3.axisLeft(y).tickSize(0).tickPadding(6))
        .selectAll('text')
        .style('font-size', '10px')
        .style('font-weight', '500');

    svg.selectAll('.domain').style('stroke', '#cbd5e1');

    svg.append('text')
        .attr('x', width / 2)
        .attr('y', height + 34)
        .attr('text-anchor', 'middle')
        .style('fill', '#64748b')
        .style('font-size', '10px')
        .text(payload.x_label);

    const summaryGroup = svgRoot.append('g')
        .attr('transform', `translate(${margin.left + width - 16}, 12)`);

    const legendGroup = svgRoot.append('g')
        .attr('transform', `translate(${margin.left}, 12)`);

    legendGroup.append('circle')
        .attr('cx', 5)
        .attr('cy', 10)
        .attr('r', 5)
        .attr('fill', '#084594')
        .attr('stroke', '#ffffff')
        .attr('stroke-width', 1.4);

    legendGroup.append('text')
        .attr('x', 17)
        .attr('y', 14)
        .style('font-size', '10px')
        .style('fill', '#475569')
        .text('Circle size = player battles');

    const renderSummary = (tile: TierTypeTile) => {
        summaryGroup.selectAll('*').remove();

        const playerCell = playerCellByKey.get(`${tile.ship_type}:${tile.ship_tier}`);
        const trendPoint = trendByType.get(tile.ship_type);
        const trendDelta = trendPoint ? tile.ship_tier - trendPoint.avg_tier : null;

        renderTextCard(summaryGroup, [
            { text: `${tile.ship_type} • Tier ${tile.ship_tier}`, fill: '#084594', weight: '700', size: '11px' },
            { text: `${tile.count.toLocaleString()} tracked battles`, fill: '#475569' },
            {
                text: playerCell
                    ? `Player: ${playerCell.pvp_battles.toLocaleString()} battles • ${(playerCell.win_ratio * 100).toFixed(1)}% WR`
                    : 'Player: no battles in this cell',
                fill: playerCell ? selectColorByWR(playerCell.win_ratio) : '#64748b',
                weight: playerCell ? '700' : '400',
            },
            { text: formatTrendDelta(trendDelta), fill: trendDelta == null ? '#64748b' : (trendDelta >= 0 ? '#166534' : '#991b1b') },
        ]);
    };

    const tileNodes = svg.selectAll('.tier-type-tile')
        .data(payload.tiles)
        .enter()
        .append('rect')
        .attr('class', 'tier-type-tile')
        .attr('x', (row: TierTypeTile) => x(row.ship_type) ?? 0)
        .attr('y', (row: TierTypeTile) => y(String(row.ship_tier)) ?? 0)
        .attr('width', x.bandwidth())
        .attr('height', y.bandwidth())
        .attr('rx', 4)
        .attr('fill', 'transparent')
        .attr('stroke', 'transparent')
        .on('mouseover', function (this: SVGRectElement, _event: MouseEvent, row: TierTypeTile) {
            renderSummary(row);
            d3.select(this)
                .attr('stroke', '#1e293b')
                .attr('stroke-width', 1.2);
        })
        .on('mouseout', function (this: SVGRectElement) {
            d3.select(this)
                .attr('stroke', 'transparent')
                .attr('stroke-width', 0);
        });

    const trendLine = d3.line()
        .x((row: TierTypeTrendPoint) => (x(row.ship_type) ?? 0) + (x.bandwidth() / 2))
        .y((row: TierTypeTrendPoint) => yTrend(row.avg_tier))
        .curve(d3.curveMonotoneX);

    svg.append('path')
        .datum(payload.trend)
        .attr('fill', 'none')
        .attr('stroke', '#1e293b')
        .attr('stroke-width', 1.6)
        .attr('d', trendLine);

    svg.selectAll('.trend-marker')
        .data(payload.trend)
        .enter()
        .append('circle')
        .attr('class', 'trend-marker')
        .attr('cx', (row: TierTypeTrendPoint) => (x(row.ship_type) ?? 0) + (x.bandwidth() / 2))
        .attr('cy', (row: TierTypeTrendPoint) => yTrend(row.avg_tier))
        .attr('r', 2.8)
        .attr('fill', '#1e293b');

    svg.selectAll('.player-cell')
        .data(payload.player_cells)
        .enter()
        .append('circle')
        .attr('class', 'player-cell')
        .attr('cx', (row: TierTypePlayerCell) => (x(row.ship_type) ?? 0) + (x.bandwidth() / 2))
        .attr('cy', (row: TierTypePlayerCell) => (y(String(row.ship_tier)) ?? 0) + (y.bandwidth() / 2))
        .attr('r', (row: TierTypePlayerCell) => Math.max(4, playerRadius(row.pvp_battles)))
        .attr('fill', (row: TierTypePlayerCell) => selectColorByWR(row.win_ratio))
        .attr('fill-opacity', 0.92)
        .attr('stroke', '#ffffff')
        .attr('stroke-width', 1.6);

    const defaultTile = payload.player_cells.length
        ? tileByKey.get(`${payload.player_cells[0].ship_type}:${payload.player_cells[0].ship_tier}`)
        : payload.tiles[0];

    if (defaultTile) {
        renderSummary(defaultTile);
    }

    tileNodes.raise();
};

const TierTypeHeatmapSVG: React.FC<TierTypeHeatmapSVGProps> = ({
    playerId,
    svgWidth = 680,
    svgHeight = 332,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const containerElement = containerRef.current;
        if (!containerElement) {
            return;
        }

        const abortController = new AbortController();

        const load = async () => {
            try {
                const response = await fetch(`http://localhost:8888/api/fetch/player_correlation/tier_type/${playerId}/`, {
                    signal: abortController.signal,
                });
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const payload: TierTypePayload = await response.json();
                if (abortController.signal.aborted) {
                    return;
                }

                const resolvedSvgWidth = containerElement.clientWidth || svgWidth;
                drawChart(containerElement, payload, resolvedSvgWidth, svgHeight);
            } catch {
                if (!abortController.signal.aborted) {
                    const resolvedSvgWidth = containerElement.clientWidth || svgWidth;
                    drawMessage(containerElement, 'Unable to load tier and ship-type heatmap.', resolvedSvgWidth, 112);
                }
            }
        };

        load();
        return () => abortController.abort();
    }, [playerId, svgHeight, svgWidth]);

    return <div ref={containerRef} className="w-full"></div>;
};

export default TierTypeHeatmapSVG;