import React, { useEffect } from 'react';
import * as d3 from 'd3';

interface ClanProps {
    clanId: number;
}

const ClanSVG: React.FC<ClanProps> = ({ clanId }) => {
    useEffect(() => {
        drawClanPlot(clanId);
    }, [clanId]);

    const drawClanPlot = (clanId: number) => {
        const margin = { top: 20, right: 30, bottom: 40, left: 40 };
        const width = 650 - margin.left - margin.right;
        const height = 500 - margin.top - margin.bottom;

        const svg = d3.select("#clan_svg_container")
            .append("svg")
            .attr("width", width + margin.left + margin.right)
            .attr("height", height + margin.top + margin.bottom)
            .append("g")
            .attr("transform", `translate(${margin.left}, ${margin.top})`);

        // Define the interface for the data structure
        interface ClanData {
            player_name: string;
            pvp_battles: string;
            pvp_ratio: string;
        }

        // Declare max, ymax, and ymin outside of fetch
        let max = 0;
        let ymax = 0;
        let ymin = 0;

        // Cast the element to HTMLInputElement
        const filterType = (document.querySelector('input[name="filter_type"]:checked') as HTMLInputElement)?.value || 'default';
        const path = `http://localhost:8888/api/fetch/clan_data/${clanId}:${filterType}`;

        fetch(path)
            .then(response => response.json())
            .then((data: ClanData[]) => {
                max = d3.max(data, (d: ClanData) => +d.pvp_battles) + 100;
                ymax = d3.max(data, (d: ClanData) => +d.pvp_ratio) + 5;
                ymin = d3.min(data, (d: ClanData) => +d.pvp_ratio) - 5;

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
                    .attr("class", "f6 lh-copy axisLabel")
                    .attr("text-anchor", "end")
                    .attr("x", width)
                    .attr("y", height - 6)
                    .text("Random Battles");

                svg.append("text")
                    .attr("class", "f6 lh-copy axisLabel")
                    .attr("text-anchor", "end")
                    .attr("transform", "translate(-10,0)rotate(-90)")
                    .attr("x", 0)
                    .attr("y", 25)
                    .text("Win %");

                svg.append("g")
                    .selectAll("name")
                    .data(data)
                    .enter()
                    .append("text")
                    .attr("class", "f6 lh-copy axisLabel")
                    .style("font-size", "9px")
                    .attr("text-anchor", "end")
                    .attr("x", (d: ClanData) => x(+d.pvp_battles) - 9)
                    .attr("y", (d: ClanData) => y(+d.pvp_ratio) + 4)
                    .text((d: ClanData) => d.player_name);

                svg.append('g')
                    .selectAll("dot")
                    .data(data)
                    .enter()
                    .append("a")
                    .attr("xlink:href", (d: ClanData) => `https://battlestats.io/warships/player/${d.player_name}`)
                    .append("circle")
                    .attr("cx", (d: ClanData) => x(+d.pvp_battles))
                    .attr("cy", (d: ClanData) => y(+d.pvp_ratio))
                    .attr("r", 6)
                    .style("stroke", "#444")
                    .style("stroke-width", 1.25)
                    .attr("fill", (d: ClanData) => selectColorByWR(+d.pvp_ratio))
                    .on('mouseover', (event: MouseEvent, d: ClanData) => {
                        showDetails(d);
                        d3.select(this).transition()
                            .duration(50)
                            .attr('fill', '#bcbddc');
                    })
                    .on('mouseout', (event: MouseEvent, d: ClanData) => {
                        hideDetails();
                        d3.select(this).transition()
                            .duration(50)
                            .attr("fill", (d: ClanData) => selectColorByWR(+d.pvp_ratio));
                    });
            });

        const showDetails = (d: ClanData) => {
            const startX = 30, startY = 10;

            const detailGroup = svg.append("g")
                .classed('details', true);
            detailGroup.append("text")
                .attr("x", startX)
                .attr("y", startY)
                .attr("font-weight", "700")
                .text(d.player_name);
            detailGroup.append("text")
                .attr("x", startX)
                .attr("y", startY + 20)
                .attr("font-weight", "400")
                .text(d.pvp_battles + " Battles");
            detailGroup.append("text")
                .attr("x", startX + 110)
                .attr("y", startY + 20)
                .attr("font-weight", "400")
                .text(d.pvp_ratio + "% Win Rate");
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
            } else if (winRatio >= 40 && winRatio < 35) {
                return "#e6550d"; // bad
            } else {
                return "#a50f15"; // super bad
            }
        };
    };

    return <div id="clan_svg_container"></div>;
};

export default ClanSVG;
