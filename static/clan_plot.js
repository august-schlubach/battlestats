
const margin = { top: 20, right: 30, bottom: 40, left: 40 },
    width = 650 - margin.left - margin.right,
    height = 500 - margin.top - margin.bottom;

// append the svg object to the body of the page
const svg = d3.select("#svg_container")
    .append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", `translate(${margin.left}, ${margin.top})`);

function drawClanPlot() {
    var filter_type = document.querySelector('input[name="filter_type"]:checked').value;
    var path = "http://159.89.242.69/warships/clan/plot/" + clan_id + ":" + filter_type;
    d3.csv(path).then(function (data) {
        var max = d3.max(data, function (d) { return + d.pvp_battles; }) + 100;
        var ymax = d3.max(data, function (d) { return + d.pvp_ratio; }) + 5
        var ymin = d3.min(data, function (d) { return + d.pvp_ratio; }) - 5

        svg.selectAll("*").remove();

        // Add X axis
        var x = d3.scaleLinear()
            .domain([0, max])
            .range([0, width]);
        svg.append("g")
            .attr("transform", "translate(0," + height + ")")
            .call(d3.axisBottom(x))
            .selectAll("text")
            .attr("transform", "translate(-10,0)rotate(-45)")
            .style("text-anchor", "end");



        // Add Y axis
        var y = d3.scaleLinear()
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
            .attr("x", function (d) { return x(d.pvp_battles) - 9; })
            .attr("y", function (d) { return y(d.pvp_ratio) + 4; })
            .text(d => d.player_name);

        svg.append('g')
            .selectAll("dot")
            .data(data)
            .enter()
            .append("a")
            .attr("xlink:href", function (d) { return "http://159.89.242.69/warships/player/" + d.player_name })
            .append("circle")
            .attr("cx", function (d) { return x(d.pvp_battles); })
            .attr("cy", function (d) { return y(d.pvp_ratio); })
            .attr("r", 6)
            .style("stroke", "#444")
            .style("stroke-width", 1.25)
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
    const start_x = 30, start_y = 10, x_offset = 10;

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
        .attr("x", start_x + 110)
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
