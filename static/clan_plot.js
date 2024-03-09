
const margin = { top: 20, right: 30, bottom: 40, left: 40 },
    width = 600 - margin.left - margin.right,
    height = 500 - margin.top - margin.bottom;

// append the svg object to the body of the page
const svg = d3.select("#svg_container")
    .append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", `translate(${margin.left}, ${margin.top})`);

function drawClanPlot() {
    var path = "http://127.0.0.1:8000/warships/clan/plot/" + clan_id;
    d3.csv(path).then(function (data) {
        var max = d3.max(data, function (d) { return + d.pvp_battles; }) + 100;
        var ymax = d3.max(data, function (d) { return + d.pvp_ratio; }) + 5
        var ymin = d3.min(data, function (d) { return + d.pvp_ratio; }) - 5
        // Add X axis
        var x = d3.scaleLinear()
            .domain([0, max])
            .range([0, width]);
        svg.append("g")
            .attr("transform", "translate(0," + height + ")")
            .call(d3.axisBottom(x));

        // Add Y axis
        var y = d3.scaleLinear()
            .domain([ymin, ymax])
            .range([height, 0]);
        svg.append("g")
            .call(d3.axisLeft(y));

        svg.append('g')
            .selectAll("dot")
            .data(data)
            .enter()
            .append("a")
            .attr("xlink:href", function (d) { return "http://127.0.0.1:8000/warships/player/" + d.player_name })
            .append("circle")
            .attr("cx", function (d) { return x(d.pvp_battles); })
            .attr("cy", function (d) { return y(d.pvp_ratio); })
            .attr("r", 6)
            .attr("fill", d => select_color_by_wr(d.pvp_ratio))
            .on('mouseover', function (event, d) {
                showDetails(d);
                d3.select(this).transition()
                    .duration('50')
                    .attr('fill', '#bcbddc')
            })
            .on('mouseout', function (event, d) {
                hideDetails();
                d3.select(this).transition()
                    .duration('50')
                    .attr("fill", d => select_color_by_wr(d.pvp_ratio))
            });
    });
}

function showDetails(d) {
    const start_x = 20, start_y = 20, x_offset = 10;

    detailGroup = svg.append("g")
        .classed('details', true);
    detailGroup.append("text")
        .attr("x", start_x)
        .attr("y", start_y)
        .attr("font-weight", "700")
        .text(d.player_name);
    detailGroup.append("text")
        .attr("x", start_x)
        .attr("y", start_y + 20)
        .attr("font-weight", "400")
        .text(d.pvp_battles + " Battles");
    detailGroup.append("text")
        .attr("x", start_x + 100)
        .attr("y", start_y + 20)
        .attr("font-weight", "400")
        .text(d.pvp_ratio + "% Win Rate");
}

function hideDetails() {
    detailGroup = svg.select(".details");
    detailGroup.remove();
}

function select_color_by_wr(win_ratio) {
    // return a color based on the player's win ratio
    if (win_ratio > 65) {
        return "#810c9e"; // super unicum
    }
    else if (win_ratio >= 60) {
        return "#D042F3"; // regular ol unicorn
    }
    else if (win_ratio >= 56) {
        return "#3182bd"; // great
    }
    else if (win_ratio >= 54) {
        return "#74c476"; // very good
    }
    else if (win_ratio >= 52) {
        return "#a1d99b"; //  good
    }
    else if (win_ratio >= 50) {
        return "#fed976"; // average
    }
    else if (win_ratio >= 45) {
        return "#fd8d3c"; // below average
    }
    else if (win_ratio >= 40 && win_ratio < 35) {
        return "#e6550d"; // bad
    }
    else {
        return "#a50f15"; // super bad
    }
}

drawClanPlot();
