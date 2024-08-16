import React, { useEffect, useState } from 'react';
import * as d3 from 'd3';

interface BattleActivityProps {
    playerId: number;
}

const ActivitySVG: React.FC<BattleActivityProps> = ({ playerId }) => {
    const [dataFetched, setDataFetched] = useState(false);

    useEffect(() => {
        if (!dataFetched) {
            drawActivityPlot(playerId);
            setDataFetched(true);
        }
    }, [playerId, dataFetched]);

    const drawActivityPlot = (playerId: number) => {
        const container = document.getElementById("activity_svg_container");
        if (container) {
            while (container.firstChild) {
                container.removeChild(container.firstChild);
            }

            const activity_svg_margin = { top: 20, right: 20, bottom: 50, left: 70 },
                activity_svg_width = 600 - activity_svg_margin.left - activity_svg_margin.right,
                activity_svg_height = 230 - activity_svg_margin.top - activity_svg_margin.bottom;

            const activity_svg = d3.select("#activity_svg_container")
                .append("svg")
                .attr("width", activity_svg_width + activity_svg_margin.left + activity_svg_margin.right)
                .attr("height", activity_svg_height + activity_svg_margin.top + activity_svg_margin.bottom)
                .append("g")
                .attr("transform", `translate(${activity_svg_margin.left}, ${activity_svg_margin.top})`);

            const path = `http://localhost:8888/api/fetch/activity_data/${playerId}`;
            const start_date = new Date(Date.now() - (28 * 24 * 60 * 60 * 1000));

            fetch(path)
                .then(response => response.json())
                .then(data => {
                    const loading_image = document.getElementById("activity_loading_image");
                    if (loading_image) loading_image.remove();

                    let max_battles = d3.max(data, d => +d.battles);
                    max_battles = Math.max(max_battles, 2) + 1;

                    const x = d3.scaleTime()
                        .domain([start_date, Date.now()])
                        .range([6, activity_svg_width]);

                    activity_svg.append("g")
                        .attr("transform", `translate(0, ${activity_svg_height})`)
                        .call(d3.axisBottom(x).ticks(8))
                        .selectAll("text")
                        .attr("transform", "translate(-10,0)rotate(-45)")
                        .style("text-anchor", "end");

                    const y = d3.scaleLinear()
                        .domain([max_battles, 0])
                        .range([1, activity_svg_height]);

                    activity_svg.append("g")
                        .call(d3.axisLeft(y).ticks(5));

                    const nodes = activity_svg.selectAll(".rect")
                        .data(data)
                        .enter()
                        .append("g")
                        .classed('rect', true);

                    nodes.append("rect")
                        .attr("x", d => x(new Date(d.date)))
                        .attr("y", d => y(d.battles))
                        .attr("height", d => activity_svg_height - (y(d.battles) ?? 0))
                        .attr("width", "12")
                        .attr("fill", "#ccc")
                        .on('mouseover', function (event, d) {
                            showRecentDetails(d);
                        })
                        .on('mouseout', function (event, d) {
                            hideRecentDetails();
                        });

                    nodes.append("rect")
                        .attr("x", d => x(new Date(d.date)) + 1)
                        .attr("y", d => y(d.wins))
                        .attr("height", d => activity_svg_height - (y(d.wins) ?? 0))
                        .attr("width", "10")
                        .style("stroke", "#444")
                        .style("stroke-width", 0.5)
                        .attr("fill", "#74c476")
                        .on('mouseover', function (event, d) {
                            showRecentDetails(d);
                            d3.select(this).transition()
                                .duration('50')
                                .attr('fill', '#bcbddc');
                        })
                        .on('mouseout', function (event, d) {
                            hideRecentDetails();
                            d3.select(this).transition()
                                .duration('50')
                                .attr("fill", "#74c476");
                        });
                });
        };

        const showRecentDetails = (d) => {
            const start_x = 470, start_y = 30;

            const detailGroup = d3.select("#activity_svg_container").select("svg").append("g")
                .classed('details', true);

            detailGroup.append("text")
                .attr("x", start_x)
                .attr("y", start_y)
                .style("font-size", "12px")
                .style("font-weight", "700")
                .attr("text-anchor", "end")
                .text(d.date);

            detailGroup.append("text")
                .attr("x", start_x + 110)
                .attr("y", start_y)
                .style("font-size", "12px")
                .attr("text-anchor", "end")
                .text(`${d.wins} W : ${d.battles} Games`);
        };

        const hideRecentDetails = () => {
            const detailGroup = d3.select("#activity_svg_container").select(".details");
            detailGroup.remove();
        };
    };

    return <div id="activity_svg_container"></div>;
};

export default ActivitySVG;