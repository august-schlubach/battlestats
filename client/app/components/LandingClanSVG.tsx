import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

interface ClanDatum {
    clan_id: number;
    name: string;
    tag: string;
    members_count: number;
    clan_wr: number | null;
    total_battles: number | null;
}

interface LandingClanSVGProps {
    clans: ClanDatum[];
    onSelectClan?: (clan: ClanDatum) => void;
    svgHeight?: number;
}

const LandingClanSVG: React.FC<LandingClanSVGProps> = ({
    clans,
    onSelectClan,
    svgHeight = 300,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState(320);

    useEffect(() => {
        if (!containerRef.current) return;
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setContainerWidth(entry.contentRect.width);
            }
        });
        observer.observe(containerRef.current);
        setContainerWidth(containerRef.current.clientWidth);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (!containerRef.current || containerWidth < 100) return;
        drawChart();
    }, [clans, containerWidth, svgHeight]);

    const selectColorByWR = (winRatio: number): string => {
        if (winRatio > 65) return '#810c9e';
        if (winRatio >= 60) return '#D042F3';
        if (winRatio >= 56) return '#3182bd';
        if (winRatio >= 54) return '#74c476';
        if (winRatio >= 52) return '#a1d99b';
        if (winRatio >= 50) return '#fed976';
        if (winRatio >= 45) return '#fd8d3c';
        if (winRatio >= 40) return '#e6550d';
        return '#a50f15';
    };

    const drawChart = () => {
        const margin = { top: 20, right: 16, bottom: 32, left: 48 };
        const width = containerWidth - margin.left - margin.right;
        const height = svgHeight - margin.top - margin.bottom;

        interface PlotDatum {
            clan_id: number;
            name: string;
            tag: string;
            members_count: number;
            clan_wr: number;
            total_battles: number;
        }

        const container = d3.select(containerRef.current);
        container.selectAll('*').remove();

        const plotData: PlotDatum[] = clans
            .filter((c) => c.clan_wr != null && c.total_battles != null && c.total_battles > 0)
            .map((c) => ({
                ...c,
                clan_wr: c.clan_wr as number,
                total_battles: c.total_battles as number,
            }));

        const svg = container
            .append('svg')
            .attr('width', width + margin.left + margin.right)
            .attr('height', height + margin.top + margin.bottom)
            .append('g')
            .attr('transform', `translate(${margin.left}, ${margin.top})`);

        if (plotData.length === 0) {
            svg.append('text')
                .attr('x', 0)
                .attr('y', 16)
                .style('font-size', '12px')
                .style('fill', '#6b7280')
                .text('No clan chart data available.');
            return;
        }

        const xMax = (d3.max(plotData, (d: PlotDatum) => d.total_battles) || 0) * 1.05;
        const yMax = (d3.max(plotData, (d: PlotDatum) => d.clan_wr) || 0) + 2;
        const yMin = (d3.min(plotData, (d: PlotDatum) => d.clan_wr) || 0) - 2;

        const x = d3.scaleLinear().domain([0, xMax]).range([0, width]);
        svg.append('g')
            .attr('transform', `translate(0, ${height})`)
            .call(d3.axisBottom(x))
            .selectAll('text')
            .attr('transform', 'translate(-10,0)rotate(-45)')
            .style('text-anchor', 'end');

        const y = d3.scaleLinear().domain([yMin, yMax]).range([height, 0]);
        svg.append('g').call(d3.axisLeft(y));

        svg.append('text')
            .attr('class', 'axisLabel')
            .style('font-size', '9px')
            .style('fill', '#6b7280')
            .attr('text-anchor', 'end')
            .attr('x', width)
            .attr('y', height - 6)
            .text('Total Battles');

        svg.append('text')
            .attr('class', 'axisLabel')
            .style('font-size', '9px')
            .style('fill', '#6b7280')
            .attr('text-anchor', 'end')
            .attr('transform', 'translate(-10,0)rotate(-90)')
            .attr('x', 0)
            .attr('y', 25)
            .text('Win %');

        const showDetails = (d: PlotDatum) => {
            const startX = 30, startY = 10;
            const detailGroup = svg.append('g').classed('details', true);
            detailGroup.append('text')
                .attr('x', startX)
                .attr('y', startY)
                .style('font-size', '11px')
                .attr('font-weight', '700')
                .text(`[${d.tag}] ${d.name}`);
            detailGroup.append('text')
                .attr('x', startX)
                .attr('y', startY + 16)
                .style('font-size', '10px')
                .attr('font-weight', '400')
                .text(`${d.total_battles.toLocaleString()} Battles`);
            detailGroup.append('text')
                .attr('x', startX + 100)
                .attr('y', startY + 16)
                .style('font-size', '10px')
                .attr('font-weight', '400')
                .text(`${d.clan_wr.toFixed(1)}% WR`);
            detailGroup.append('text')
                .attr('x', startX + 175)
                .attr('y', startY + 16)
                .style('font-size', '10px')
                .attr('font-weight', '400')
                .text(`${d.members_count} Members`);
        };

        const hideDetails = () => {
            svg.select('.details').remove();
        };

        svg.append('g')
            .selectAll('dot')
            .data(plotData)
            .enter()
            .append('circle')
            .attr('cx', (d: PlotDatum) => x(d.total_battles))
            .attr('cy', (d: PlotDatum) => y(d.clan_wr))
            .attr('r', 5)
            .style('stroke', '#444')
            .style('stroke-width', 1.25)
            .style('cursor', onSelectClan ? 'pointer' : 'default')
            .attr('fill', (d: PlotDatum) => selectColorByWR(d.clan_wr))
            .on('click', function (_event: MouseEvent, d: PlotDatum) {
                if (onSelectClan) {
                    onSelectClan(d);
                }
            })
            .on('mouseover', function (this: SVGCircleElement, _event: MouseEvent, d: PlotDatum) {
                showDetails(d);
                d3.select(this).transition().duration(50).attr('fill', '#bcbddc');
            })
            .on('mouseout', function (this: SVGCircleElement, _event: MouseEvent, d: PlotDatum) {
                hideDetails();
                d3.select(this).transition().duration(50).attr('fill', selectColorByWR(d.clan_wr));
            });
    };

    return <div ref={containerRef} className="pr-8 md:pr-16"></div>;
};

export default LandingClanSVG;
