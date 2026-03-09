import React, { useEffect } from 'react';
import * as d3 from 'd3';

interface TypeSVGProps {
    playerId: number;
}

const TypeSVG: React.FC<TypeSVGProps> = ({ playerId }) => {
    useEffect(() => {
        drawTypePlot(playerId);
    }, [playerId]);

    const drawTypePlot = (playerId: number) => {
        const container = document.getElementById("type_svg_container");
        if (container) {
            while (container.firstChild) {
                container.removeChild(container.firstChild);
            }

            const total_type_svg_width = 500;
            const total_type_svg_height = 210;
            const type_svg_margin = { top: 44, right: 20, bottom: 50, left: 96 },
                type_svg_width = total_type_svg_width - type_svg_margin.left - type_svg_margin.right,
                type_svg_height = total_type_svg_height - type_svg_margin.top - type_svg_margin.bottom;

            const type_svg = d3.select("#type_svg_container")
                .append("svg")
                .attr("width", total_type_svg_width)
                .attr("height", total_type_svg_height)
                .append("g")
                .attr("transform", `translate(${type_svg_margin.left}, ${type_svg_margin.top})`);

            const path = `http://localhost:8888/api/fetch/type_data/${playerId}`;

            fetch(path)
                .then(response => response.json())
                .then(data => {
                    const max = d3.max(data, (d: any) => +d.pvp_battles);

                    type_svg.selectAll("*").remove();

                    const x = d3.scaleLinear()
                        .domain([0, max])
                        .range([1, type_svg_width]);
                    type_svg.append("g")
                        .attr("transform", `translate(0, ${type_svg_height})`)
                        .call(d3.axisBottom(x))
                        .selectAll("text")
                        .attr("transform", "translate(-10,0)rotate(-45)")
                        .style("text-anchor", "end");

                    const y = d3.scaleBand()
                        .range([0, type_svg_height])
                        .domain(data.map((d: any) => d.ship_type))
                        .padding(.1);
                    type_svg.append("g")
                        .call(d3.axisLeft(y));

                    type_svg.append("text")
                        .attr("x", type_svg_width)
                        .attr("y", type_svg_height + 44)
                        .attr("text-anchor", "end")
                        .style("font-size", "10px")
                        .style("fill", "#6b7280")
                        .text("Random Battles");

                    type_svg.append("text")
                        .attr("transform", "rotate(-90)")
                        .attr("x", -2)
                        .attr("y", -76)
                        .attr("text-anchor", "end")
                        .style("font-size", "10px")
                        .style("fill", "#6b7280")
                        .text("Ship Type");

                    const rect_nodes = type_svg.selectAll(".rect")
                        .data(data)
                        .enter()
                        .append("g")
                        .classed('rect', true);

                    rect_nodes.append("rect")
                        .attr("x", x(0))
                        .attr("y", (d: any) => y(d.ship_type) + 3)
                        .attr("width", (d: any) => x(d.pvp_battles))
                        .attr("height", y.bandwidth() * .7)
                        .attr("fill", "#d9d9d9");

                    rect_nodes.append("rect")
                        .attr("x", x(0))
                        .attr("y", (d: any) => y(d.ship_type))
                        .attr("width", (d: any) => x(d.wins))
                        .attr("height", y.bandwidth())
                        .style("stroke", "#444")
                        .style("stroke-width", 0.75)
                        .attr("fill", (d: any) => select_color_by_wr(d.win_ratio))
                        .on('mouseover', (event: any, d: any) => {
                            showTypeDetails(d);
                            d3.select(this).transition()
                                .duration('50')
                                .attr('fill', '#bcbddc');
                        })
                        .on('mouseout', (event: any, d: any) => {
                            hideTypeDetails();
                            d3.select(this).transition()
                                .duration('50')
                                .attr("fill", (d: any) => select_color_by_wr(d.win_ratio));
                        });
                });
        }
    };

    const showTypeDetails = (d: any) => {
        const detail_x = 480, detail_y = 26;
        const win_percentage = ((d.wins / d.pvp_battles) * 100).toFixed(2);

        const detailGroup = d3.select("#type_svg_container").select("svg").append("g")
            .classed('details', true);

        detailGroup.append("text")
            .attr("x", detail_x)
            .attr("y", detail_y)
            .style("font-size", "12px")
            .attr("text-anchor", "end")
            .attr("font-weight", "700")
            .text(`${d.pvp_battles} Battles • ${win_percentage}% Win Rate`);
    };

    const hideTypeDetails = () => {
        const detailGroup = d3.select("#type_svg_container").select(".details");
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

    return <div id="type_svg_container"></div>;
};

export default TypeSVG;