import React, { useEffect, useState } from 'react';
import * as d3 from 'd3';

interface RandomsSVGProps {
    playerId: number;
}

const RandomsSVG: React.FC<RandomsSVGProps> = ({ playerId }) => {
    const [data, setData] = useState([]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const response = await fetch(`http://localhost:8888/api/fetch/randoms_data/${playerId}`);
                const result = await response.json();
                setData(result);
            } catch (error) {
                console.error('Error fetching data:', error);
            }
        };

        fetchData();
    }, [playerId]);

    useEffect(() => {
        if (data.length > 0) {
            d3.select("#randoms_svg_container").selectAll("*").remove();
            drawBattlePlot(data);
        }
    }, [data]);

    const drawBattlePlot = (data: any) => {
        const margin = { top: 10, right: 20, bottom: 30, left: 140 };
        const width = 600 - margin.left - margin.right;
        const height = 500 - margin.top - margin.bottom;

        const svg = d3.select("#randoms_svg_container")
            .append("svg")
            .attr("width", width + margin.left + margin.right)
            .attr("height", height + margin.top + margin.bottom)
            .append("g")
            .attr("transform", `translate(${margin.left}, ${margin.top})`);

        const max = Math.max(d3.max(data, (d: any) => +d.pvp_battles), 15);

        // X axis
        const x = d3.scaleLinear()
            .domain([0, max])
            .range([1, width]);
        svg.append("g")
            .attr("transform", `translate(0, ${height})`)
            .call(d3.axisBottom(x))
            .selectAll("text")
            .attr("transform", "translate(-10,0)rotate(-45)")
            .style("text-anchor", "end");

        // Y axis
        const y = d3.scaleBand()
            .range([0, height])
            .domain(data.map((d: any) => d.ship_name))
            .padding(.1);
        svg.append("g")
            .call(d3.axisLeft(y));

        svg.append("text")
            .attr("class", "f6 lh-copy bar1")
            .attr("text-anchor", "end")
            .attr("x", width)
            .attr("y", height - 6)
            .text("Random Battles");

        const nodes = svg.selectAll(".rect")
            .data(data)
            .enter()
            .append("g")
            .classed('rect', true);

        nodes.append("rect")
            .attr("x", x(0))
            .attr("y", (d: any) => y(d.ship_name) + 3)
            .attr("width", (d: any) => x(d.pvp_battles))
            .attr("height", (y.bandwidth() * .7))
            .attr("fill", "#d9d9d9");

        nodes.append("rect")
            .attr("x", x(0))
            .attr("y", (d: { ship_name: string }) => y(d.ship_name))
            .attr("width", (d: { wins: number }) => x(d.wins))
            .attr("height", y.bandwidth())
            .style("stroke", "#444")
            .style("stroke-width", 0.75)
            .attr("fill", (d: { win_ratio: number }) => selectColorByWr(d.win_ratio))
            .on('mouseover', (event: MouseEvent, d: { win_ratio: number }) => {
                showDetails(d, svg);
                d3.select(this).transition()
                    .duration(50)
                    .attr('fill', '#bcbddc');
            })
            .on('mouseout', (event: MouseEvent, d: { win_ratio: number }) => {
                hideDetails(svg);
                d3.select(this).transition()
                    .duration(50)
                    .attr("fill", (d: { win_ratio: number }) => selectColorByWr(d.win_ratio));
            });
    };

    const showDetails = (d: any, svg: any) => {
        const start_x = 300, start_y = 320, x_offset = 10;
        const win_percentage = ((d.wins / d.pvp_battles) * 100).toFixed(2);

        const detailGroup = svg.append("g")
            .classed('details', true);
        detailGroup.append("text")
            .attr("x", start_x)
            .attr("y", start_y)
            .attr("font-weight", "700")
            .text(d.ship_name);

        detailGroup.append("text")
            .attr("x", start_x + x_offset)
            .attr("y", start_y + 25)
            .style("font-size", "16px")
            .text(win_percentage);
        detailGroup.append("text")
            .attr("x", start_x + x_offset + 45)
            .attr("y", start_y + 25)
            .style("font-size", "12px")
            .text("% Win Rate");

        detailGroup.append("text")
            .attr("x", start_x + x_offset)
            .attr("y", start_y + 47)
            .style("font-size", "16px")
            .text(d.pvp_battles);
    };

    const hideDetails = (svg: any) => {
        svg.selectAll('.details').remove();
    };

    const selectColorByWr = (win_ratio: number): string => {
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

    return <div id="randoms_svg_container"></div>;
};

export default RandomsSVG;
