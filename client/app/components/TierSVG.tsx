import React, { useEffect } from 'react';
import * as d3 from 'd3';

interface TierSVGProps {
    playerId: number;
}

const TierSVG: React.FC<TierSVGProps> = ({ playerId }) => {
    useEffect(() => {
        drawTierPlot(playerId);
    }, [playerId]);

    const drawTierPlot = (playerId: number) => {
        const container = document.getElementById("tier_svg_container");
        if (container) {
            // Clear the container before drawing a new SVG
            d3.select(container).selectAll("*").remove();

            const tier_svg_margin = { top: 10, right: 20, bottom: 50, left: 70 },
                svg_width = 600 - tier_svg_margin.left - tier_svg_margin.right,
                svg_height = 300 - tier_svg_margin.top - tier_svg_margin.bottom;

            const svg = d3.select("#tier_svg_container")
                .append("svg")
                .attr("width", svg_width + tier_svg_margin.left + tier_svg_margin.right)
                .attr("height", svg_height + tier_svg_margin.top + tier_svg_margin.bottom)
                .append("g")
                .attr("transform", `translate(${tier_svg_margin.left}, ${tier_svg_margin.top})`);

            const path = `http://localhost:8888/api/fetch/tier_data/${playerId}`;

            fetch(path)
                .then(response => response.json())
                .then(data => {
                    const max = d3.max(data, (d: any) => +d.pvp_battles);

                    svg.selectAll("*").remove();

                    const x = d3.scaleLinear()
                        .domain([0, max])
                        .range([1, svg_width]);
                    svg.append("g")
                        .attr("transform", `translate(0, ${svg_height})`)
                        .call(d3.axisBottom(x))
                        .selectAll("text")
                        .attr("transform", "translate(-10,0)rotate(-45)")
                        .style("text-anchor", "end");

                    const y = d3.scaleBand()
                        .range([0, svg_height])
                        .domain(data.map((d: any) => d.ship_tier))
                        .padding(.1);
                    svg.append("g")
                        .call(d3.axisLeft(y));

                    const rect_nodes = svg.selectAll(".rect")
                        .data(data)
                        .enter()
                        .append("g")
                        .classed('rect', true);

                    rect_nodes.append("rect")
                        .attr("x", x(0))
                        .attr("y", (d: any) => y(d.ship_tier) + 3)
                        .attr("width", (d: any) => x(d.pvp_battles))
                        .attr("height", y.bandwidth() * .7)
                        .attr("fill", "#d9d9d9");

                    rect_nodes.append("rect")
                        .attr("x", x(0))
                        .attr("y", (d: any) => y(d.ship_tier))
                        .attr("width", (d: any) => x(d.wins))
                        .attr("height", y.bandwidth())
                        .style("stroke", "#444")
                        .style("stroke-width", 0.75)
                        .attr("fill", (d: any) => select_color_by_wr(d.win_ratio))
                        .on('mouseover', (event: any, d: any) => {
                            showTierDetails(d);
                            d3.select(this).transition()
                                .duration('50')
                                .attr('fill', '#bcbddc');
                        })
                        .on('mouseout', (event: any, d: any) => {
                            hideTierDetails();
                            d3.select(this).transition()
                                .duration('50')
                                .attr("fill", (d: any) => select_color_by_wr(d.win_ratio));
                        });
                });
        }
    };

    const showTierDetails = (d: any) => {
        const start_x = 400, start_y = 240;
        const win_percentage = ((d.wins / d.pvp_battles) * 100).toFixed(2);

        const detailGroup = d3.select("#tier_svg_container").select("svg").append("g")
            .classed('details', true);

        detailGroup.append("text")
            .attr("x", start_x)
            .attr("y", start_y)
            .style("font-size", "14px")
            .attr("text-anchor", "end")
            .attr("font-weight", "700")
            .text(d.pvp_battles);
        detailGroup.append("text")
            .attr("x", start_x + 40)
            .attr("y", start_y)
            .style("font-size", "12px")
            .attr("text-anchor", "end")
            .text("Battles");

        detailGroup.append("text")
            .attr("x", start_x + 95)
            .attr("y", start_y)
            .style("font-size", "14px")
            .attr("text-anchor", "end")
            .attr("font-weight", "700")
            .text(win_percentage);
        detailGroup.append("text")
            .attr("x", start_x + 160)
            .attr("y", start_y)
            .style("font-size", "12px")
            .attr("text-anchor", "end")
            .text("% Win Rate");
    };

    const hideTierDetails = () => {
        const detailGroup = d3.select("#tier_svg_container").select(".details");
        detailGroup.remove();
    };

    const select_color_by_wr = (win_ratio: number): string => {
        if (win_ratio > 0.65) return "#810c9e"; // super unicum
        if (win_ratio >= 0.60) return "#D042F3"; // regular ol unicorn
        if (win_ratio >= 0.56) return "#3182bd"; // great
        if (win_ratio >= 0.54) return "#74c476"; // very good
        if (win_ratio >= 0.52) return "#a1d99b"; // good
        if (win_ratio >= 0.50) return "#fed976"; // average
        if (win_ratio >= 0.45) return "#fd8d3c"; // below average
        if (win_ratio >= 0.40 && win_ratio < 0.35) return "#e6550d"; // bad
        return "#a50f15"; // super bad
    };

    return <div id="tier_svg_container"></div>;
};

export default TierSVG;