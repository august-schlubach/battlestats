
const activity_svg_margin = { top: 10, right: 20, bottom: 50, left: 70 },
    activity_svg_width = 600 - activity_svg_margin.left - activity_svg_margin.right,
    activity_svg_height = 170 - activity_svg_margin.top - activity_svg_margin.bottom;

// append the svg object to the body of the page
const activity_svg = d3.select("#activity_svg_container")
    .append("svg")
    .attr("width", activity_svg_width + activity_svg_margin.left + activity_svg_margin.right)
    .attr("height", activity_svg_height + activity_svg_margin.top + activity_svg_margin.bottom)
    .append("g")
    .attr("transform", `translate(${activity_svg_margin.left}, ${activity_svg_margin.top})`);

function drawActivityPlot() {
    var path = "http://127.0.0.1:8000/warships/player/load_recent_data/" + player_id;
    var start_date = new Date(Date.now() - (28 * 24 * 60 * 60 * 1000));

    d3.csv(path).then(function (data) {

        console.log(data);
        var max_battles = d3.max(data, function (d) { return + d.battles; });
        max_battles = Math.max(max_battles, 5);
        console.log("max_battles: ", max_battles);
        const x = d3.scaleTime()
            .domain([start_date, Date.now()])
            .range([6, activity_svg_width]);


        activity_svg.append("g")
            .attr("transform", `translate(0, ${activity_svg_height})`)
            .call(d3.axisBottom(x).ticks(8))
            .selectAll("text")
            .attr("transform", "translate(-10,0)rotate(-45)")
            .style("text-anchor", "end");

        // Y axis
        const y = d3.scaleLinear()
            .domain([max_battles, 0])
            .range([1, activity_svg_height]);

        activity_svg.append("g")
            .call(d3.axisLeft(y).ticks(5));

        var nodes = activity_svg.selectAll(".rect")
            .data(data)
            .enter()
            .append("g")
            .classed('rect', true)

        nodes.append("rect")
            .attr("x", d => x(new Date(d.date)))
            .attr("y", d => y(d.battles))
            .attr("height", function (d) { return activity_svg_height - y(d.battles); })
            .attr("width", "12")
            .style("stroke", "#444")
            .style("stroke-width", 0.75)
            .attr("fill", "#ddd");
    });
}

drawActivityPlot();