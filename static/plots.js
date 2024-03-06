
const margin = { top: 20, right: 30, bottom: 40, left: 120 },
    width = 700 - margin.left - margin.right,
    height = 700 - margin.top - margin.bottom;

// append the svg object to the body of the page
const g = d3.select("#container")
    .append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", `translate(${margin.left}, ${margin.top})`);

// Parse the Data

function select_color(win_ratio) {
    // return a color based on the player's win ratio
    if (win_ratio < 0.40) {
        return "#FE0E00"; //bad
    }
    else if (win_ratio < 0.45) {
        return "#FE7903"; // below average
    }
    else if (win_ratio < 0.50) {
        return "#FFC71F"; // average
    }
    else if (win_ratio < 0.52) {
        return "#44B300"; // very good
    }
    else if (win_ratio < 0.56) {
        return "#318000"; // great
    }
    else if (win_ratio < 0.62) {
        return "#02C9B3"; // unicum
    }
    else {
        return "#D042F3"; // unicum
    }
}

function drawPlot(filter_type = "pvp_battles") {
    var path = "http://127.0.0.1:8000/warships/player/load_activity_data/" + player_id + ":" + filter_type;
    d3.csv(path).then(function (data) {
        var max = d3.max(data, function (d) { return + d.pvp_battles; });

        // remove the previous plot on re-render
        g.selectAll("*").remove();

        // X axis
        const x = d3.scaleLinear()
            .domain([0, max])
            .range([1, width]);
        g.append("g")
            .attr("transform", `translate(0, ${height})`)
            .call(d3.axisBottom(x))
            .selectAll("text")
            .attr("transform", "translate(-10,0)rotate(-45)")
            .style("text-anchor", "end");

        // Y axis
        const y = d3.scaleBand()
            .range([0, height])
            .domain(data.map(d => d.ship))
            .padding(.1);
        g.append("g")
            .call(d3.axisLeft(y))


        var nodes = g.selectAll(".rect")
            .data(data)
            .enter()
            .append("g")
            .classed('rect', true)

        nodes.append("rect")
            .attr("x", x(0))
            .attr("y", d => y(d.ship) + 4)
            .attr("width", d => x(d.pvp_battles))
            .attr("height", (y.bandwidth() / 2))
            .attr("class", "bar1");

        nodes.append("rect")
            .attr("x", x(0))
            .attr("y", d => y(d.ship))
            .attr("width", d => x(d.wins))
            .attr("height", y.bandwidth())
            .attr("fill", d => select_color(d.win_ratio))
            .on('mouseover', function (d, i) {
                d3.select(this).transition()
                    .duration('50')
                    .attr('fill', 'black')
            })
            .on('mouseout', function (d, i) {
                d3.select(this).transition()
                    .duration('50')
                    .attr("fill", d => select_color(d.win_ratio))
            });


    })
}

drawPlot();

function changeType(filter_type) {
    drawPlot(filter_type);
}
