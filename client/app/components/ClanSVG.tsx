import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

interface ClanProps {
    clanId: number;
    onSelectMember?: (memberName: string) => void;
    svgWidth?: number;
    svgHeight?: number;
}

const ClanSVG: React.FC<ClanProps> = ({ clanId, onSelectMember, svgWidth = 320, svgHeight = 240 }) => {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (containerRef.current) {
            drawClanPlot(clanId);
        }
    }, [clanId, svgWidth, svgHeight]);

    const drawClanPlot = (clanId: number) => {
        const margin = { top: 20, right: 16, bottom: 32, left: 38 };
        const width = svgWidth - margin.left - margin.right;
        const height = svgHeight - margin.top - margin.bottom;

        const container = d3.select(containerRef.current);
        container.selectAll("*").remove();

        const svg = container
            .append("svg")
            .attr("width", width + margin.left + margin.right)
            .attr("height", height + margin.top + margin.bottom)
            .append("g")
            .attr("transform", `translate(${margin.left}, ${margin.top})`);

        // Define the interface for the data structure
        interface ClanData {
            player_name: string;
            pvp_battles: number;
            pvp_ratio: number;
        }

        // Declare max, ymax, and ymin outside of fetch
        let max = 0;
        let ymax = 0;
        let ymin = 0;

        const filterType = 'active';
        const path = `http://localhost:8888/api/fetch/clan_data/${clanId}:${filterType}`;

        fetch(path)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Failed to fetch clan data: ${response.status}`);
                }
                return response.json();
            })
            .then((data: ClanData[]) => {
                if (!Array.isArray(data) || data.length === 0) {
                    svg.append("text")
                        .attr("x", 0)
                        .attr("y", 16)
                        .attr("class", "text-sm")
                        .style("fill", "#6b7280")
                        .text("No clan chart data available.");
                    return;
                }

                max = (d3.max(data, (d: ClanData) => d.pvp_battles) || 0) + 50;
                ymax = (d3.max(data, (d: ClanData) => d.pvp_ratio) || 0) + 2;
                ymin = (d3.min(data, (d: ClanData) => d.pvp_ratio) || 0) - 2;

                // Remove any existing elements
                svg.selectAll("*").remove();

                const x = d3.scaleLinear()
                    .domain([0, max])
                    .range([0, width]);
                svg.append("g")
                    .attr("transform", `translate(0, ${height})`)
                    .call(d3.axisBottom(x))
                    .selectAll("text")
                    .attr("transform", "translate(-10,0)rotate(-45)")
                    .style("text-anchor", "end");

                const y = d3.scaleLinear()
                    .domain([ymin, ymax])
                    .range([height, 0]);
                svg.append("g")
                    .call(d3.axisLeft(y));

                svg.append("text")
                    .attr("class", "axisLabel")
                    .style("font-size", "9px")
                    .style("fill", "#6b7280")
                    .attr("text-anchor", "end")
                    .attr("x", width)
                    .attr("y", height - 6)
                    .text("Battles");

                svg.append("text")
                    .attr("class", "axisLabel")
                    .style("font-size", "9px")
                    .style("fill", "#6b7280")
                    .attr("text-anchor", "end")
                    .attr("transform", "translate(-10,0)rotate(-90)")
                    .attr("x", 0)
                    .attr("y", 25)
                    .text("Win %");

                svg.append('g')
                    .selectAll("dot")
                    .data(data)
                    .enter()
                    .append("circle")
                    .attr("cx", (d: ClanData) => x(d.pvp_battles))
                    .attr("cy", (d: ClanData) => y(d.pvp_ratio))
                    .attr("r", 4)
                    .style("stroke", "#444")
                    .style("stroke-width", 1.25)
                    .style("cursor", onSelectMember ? "pointer" : "default")
                    .attr("fill", (d: ClanData) => selectColorByWR(d.pvp_ratio))
                    .on('click', function (this: SVGCircleElement, event: MouseEvent, d: ClanData) {
                        if (onSelectMember) {
                            onSelectMember(d.player_name);
                        }
                    })
                    .on('mouseover', function (this: SVGCircleElement, event: MouseEvent, d: ClanData) {
                        showDetails(d);
                        d3.select(this).transition()
                            .duration(50)
                            .attr('fill', '#bcbddc');
                    })
                    .on('mouseout', function (this: SVGCircleElement, event: MouseEvent, d: ClanData) {
                        hideDetails();
                        d3.select(this).transition()
                            .duration(50)
                            .attr("fill", selectColorByWR(d.pvp_ratio));
                    });
            })
            .catch(() => {
                svg.selectAll("*").remove();
                svg.append("text")
                    .attr("x", 0)
                    .attr("y", 16)
                    .attr("class", "text-sm")
                    .style("fill", "#6b7280")
                    .text("Unable to load clan chart.");
            });

        const showDetails = (d: ClanData) => {
            const startX = 30, startY = 10;

            const detailGroup = svg.append("g")
                .classed('details', true);
            detailGroup.append("text")
                .attr("x", startX)
                .attr("y", startY)
                .style("font-size", "11px")
                .attr("font-weight", "700")
                .text(d.player_name);
            detailGroup.append("text")
                .attr("x", startX)
                .attr("y", startY + 16)
                .style("font-size", "10px")
                .attr("font-weight", "400")
                .text(d.pvp_battles + " Battles");
            detailGroup.append("text")
                .attr("x", startX + 90)
                .attr("y", startY + 16)
                .style("font-size", "10px")
                .attr("font-weight", "400")
                .text(d.pvp_ratio + "% WR");
        };

        const hideDetails = () => {
            const detailGroup = svg.select(".details");
            detailGroup.remove();
        };

        const selectColorByWR = (winRatio: number) => {
            if (winRatio > 65) {
                return "#810c9e"; // super unicum
            } else if (winRatio >= 60) {
                return "#D042F3"; // regular ol unicorn
            } else if (winRatio >= 56) {
                return "#3182bd"; // great
            } else if (winRatio >= 54) {
                return "#74c476"; // very good
            } else if (winRatio >= 52) {
                return "#a1d99b"; // good
            } else if (winRatio >= 50) {
                return "#fed976"; // average
            } else if (winRatio >= 45) {
                return "#fd8d3c"; // below average
            } else if (winRatio >= 40) {
                return "#e6550d"; // bad
            } else {
                return "#a50f15"; // super bad
            }
        };
    };

    return <div ref={containerRef}></div>;
};

export default ClanSVG;
