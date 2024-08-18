import React, { useEffect } from 'react';
import * as d3 from 'd3';

interface ActivityProps {
    playerId: number;
}

const ActivitySVG: React.FC<ActivityProps> = ({ playerId }) => {
    useEffect(() => {
        drawActivityPlot(playerId);
    }, [playerId]);

    const drawActivityPlot = (playerId: number) => {

        const container = document.getElementById("activity_svg_container");
        if (container) {
            // Clear the container before drawing a new SVG
            d3.select(container).selectAll("*").remove();
        }

        const margin = { top: 20, right: 20, bottom: 50, left: 70 };
        const width = 600 - margin.left - margin.right;
        const height = 230 - margin.top - margin.bottom;

        const svg = d3.select("#activity_svg_container")
            .append("svg")
            .attr("width", width + margin.left + margin.right)
            .attr("height", height + margin.top + margin.bottom)
            .append("g")
            .attr("transform", `translate(${margin.left}, ${margin.top})`);

        const path = `http://localhost:8888/api/fetch/activity_data/${playerId}`;
        const startDate = new Date(Date.now() - (28 * 24 * 60 * 60 * 1000));

        fetch(path)
            .then(response => response.json())
            .then(data => {
                svg.selectAll("*").remove();

                let maxBattles = d3.max(data, (d: any) => +d.battles);
                maxBattles = Math.max(maxBattles, 2) + 1;

                const x = d3.scaleTime()
                    .domain([startDate, new Date()])
                    .range([6, width]);

                svg.append("g")
                    .attr("transform", `translate(0, ${height})`)
                    .call(d3.axisBottom(x).ticks(8))
                    .selectAll("text")
                    .attr("transform", "translate(-10,0)rotate(-45)")
                    .style("text-anchor", "end");

                const y = d3.scaleLinear()
                    .domain([maxBattles, 0])
                    .range([1, height]);

                svg.append("g")
                    .call(d3.axisLeft(y).ticks(5));

                const nodes = svg.selectAll(".rect")
                    .data(data)
                    .enter()
                    .append("g")
                    .classed('rect', true);

                nodes.append("rect")
                    .attr("x", (d: any) => x(new Date(d.date)))
                    .attr("y", (d: any) => y(d.battles))
                    .attr("height", (d: any) => height - (y(d.battles) ?? 0))
                    .attr("width", "12")
                    .attr("fill", "#ccc")
                    .on('mouseover', function (event: any, d: any) {
                        showRecentDetails(d);
                    })
                    .on('mouseout', function (event: any, d: any) {
                        hideRecentDetails();
                    });

                nodes.append("rect")
                    .attr("x", (d: any) => x(new Date(d.date)) + 1)
                    .attr("y", (d: any) => y(d.wins))
                    .attr("height", (d: any) => height - (y(d.wins) ?? 0))
                    .attr("width", "10")
                    .style("stroke", "#444")
                    .style("stroke-width", 0.5)
                    .attr("fill", "#74c476")
                    .on('mouseover', function (this: any, event: any, d: any) {
                        showRecentDetails(d);
                        d3.select(this).transition()
                            .duration(50)
                            .attr('fill', '#bcbddc');
                    })
                    .on('mouseout', function (this: any, event: any, d: any) {
                        hideRecentDetails();
                        d3.select(this).transition()
                            .duration(50)
                            .attr("fill", "#74c476");
                    });
            });
    };

    const showRecentDetails = (d: any) => {
        const startX = 470, startY = 30;

        const detailGroup = d3.select("#activity_svg_container").select("svg").append("g")
            .classed('details', true);

        detailGroup.append("text")
            .attr("x", startX)
            .attr("y", startY)
            .style("font-size", "12px")
            .style("font-weight", "700")
            .attr("text-anchor", "end")
            .text(d.date);

        detailGroup.append("text")
            .attr("x", startX + 110)
            .attr("y", startY)
            .style("font-size", "12px")
            .attr("text-anchor", "end")
            .text(`${d.wins} W : ${d.battles} Games`);
    };

    const hideRecentDetails = () => {
        const detailGroup = d3.select("#activity_svg_container").select(".details");
        detailGroup.remove();
    };

    return <div id="activity_svg_container"></div>;
};

export default ActivitySVG;
