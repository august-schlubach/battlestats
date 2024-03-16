
const type_svg_margin = { top: 10, right: 20, bottom: 50, left: 70 },
    type_svg_width = 600 - type_svg_margin.left - type_svg_margin.right,
    type_svg_height = 170 - type_svg_margin.top - type_svg_margin.bottom;

// append the svg object to the body of the page
const type_svg = d3.select("#type_svg_container")
    .append("svg")
    .attr("width", type_svg_width + type_svg_margin.left + type_svg_margin.right)
    .attr("height", type_svg_height + type_svg_margin.top + type_svg_margin.bottom)
    .append("g")
    .attr("transform", `translate(${type_svg_margin.left}, ${type_svg_margin.top})`);

function drawTierPlot() {
    var path = "http://127.0.0.1:8000/warships/player/load_type_data/" + player_id;
    d3.csv(path).then(function (data) {
        var max = d3.max(data, function (d) { return + d.pvp_battles; });

        // remove the previous plot
        type_svg.selectAll("*").remove();

        // X axis
        const x = d3.scaleLinear()
            .domain([0, max])
            .range([1, type_svg_width]);
        type_svg.append("g")
            .attr("transform", `translate(0, ${type_svg_height})`)
            .call(d3.axisBottom(x))
            .selectAll("text")
            .attr("transform", "translate(-10,0)rotate(-45)")
            .style("text-anchor", "end");

        // Y axis
        const y = d3.scaleBand()
            .range([0, type_svg_height])
            .domain(data.map(d => d.ship_type))
            .padding(.1);
        type_svg.append("g")
            .call(d3.axisLeft(y));

        var rect_nodes = type_svg.selectAll(".rect")
            .data(data)
            .enter()
            .append("g")
            .classed('rect', true)

        rect_nodes.append("rect")
            .attr("x", x(0))
            .attr("y", d => y(d.ship_type) + 3)
            .attr("width", d => x(d.pvp_battles))
            .attr("height", (y.bandwidth() * .7))
            .attr("fill", "#d9d9d9");

        rect_nodes.append("rect")
            .attr("x", x(0))
            .attr("y", d => y(d.ship_type))
            .attr("width", d => x(d.wins))
            .attr("height", y.bandwidth())
            .style("stroke", "#444")
            .style("stroke-width", 0.75)
            .attr("fill", d => select_color_by_wr(d.win_ratio))
            .on('mouseover', function (event, d) {
                d3.select(this).transition()
                    .duration('50')
                    .attr('fill', '#bcbddc')
            })
            .on('mouseout', function (event, d) {
                d3.select(this).transition()
                    .duration('50')
                    .attr("fill", d => select_color_by_wr(d.win_ratio))
            });
    })
}


drawTierPlot();
