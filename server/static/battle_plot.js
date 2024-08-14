
const margin = { top: 10, right: 20, bottom: 30, left: 140 },
    width = 600 - margin.left - margin.right,
    height = 500 - margin.top - margin.bottom;

// append the svg object to the body of the page
const g = d3.select("#pvp_stats_svg_container")
    .append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", `translate(${margin.left}, ${margin.top})`);

function drawBattlePlot() {
    var filter_type = document.querySelector('input[name="filter_type"]:checked').value;
    var filter_tier = document.querySelector('input[name="filter_tier"]:checked').value;
    var path = ["https://battlestats.io/warships/fetch/load_activity_data/" + player_id, filter_type, filter_tier].join(":");

    d3.csv(path).then(function (data) {
        var max = d3.max(data, function (d) { return + d.pvp_battles; });
        max = Math.max(max, 15);

        // remove the previous plot
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
            .call(d3.axisLeft(y));

        g.append("text")
            .attr("class", "f6 lh-copy bar1")
            .attr("text-anchor", "end")
            .attr("x", width)
            .attr("y", height - 6)
            .text("Random Battles");

        var nodes = g.selectAll(".rect")
            .data(data)
            .enter()
            .append("g")
            .classed('rect', true)

        nodes.append("rect")
            .attr("x", x(0))
            .attr("y", d => y(d.ship) + 3)
            .attr("width", d => x(d.pvp_battles))
            .attr("height", (y.bandwidth() * .7))
            .attr("fill", "#d9d9d9");

        nodes.append("rect")
            .attr("x", x(0))
            .attr("y", d => y(d.ship))
            .attr("width", d => x(d.wins))
            .attr("height", y.bandwidth())
            .style("stroke", "#444")
            .style("stroke-width", 0.75)
            .attr("fill", d => select_color_by_wr(d.win_ratio))
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
                    .attr("fill", d => select_color_by_wr(d.win_ratio))
            });
    })
}

function showDetails(d) {
    const start_x = 300, start_y = 320, x_offset = 10;
    var win_percentage = ((d.wins / d.pvp_battles) * 100).toFixed(2);

    detailGroup = g.append("g")
        .classed('details', true);
    detailGroup.append("text")
        .attr("x", start_x)
        .attr("y", start_y)
        .attr("font-weight", "700")
        .text(d.ship);

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
    detailGroup.append("text")
        .attr("x", start_x + x_offset + 45)
        .attr("y", start_y + 47)
        .style("font-size", "12px")
        .text("Battles");

    detailGroup.append("text")
        .attr("x", start_x + x_offset)
        .attr("y", start_y + 64)
        .style("font-size", "16px")
        .text(d.kdr);
    detailGroup.append("text")
        .attr("x", start_x + x_offset + 45)
        .attr("y", start_y + 64)
        .style("font-size", "12px")
        .text("  Kills per game");
}

function hideDetails() {
    detailGroup = g.select(".details");
    detailGroup.remove();
}

function select_color_by_wr(win_ratio) {
    // return a color based on the player's win ratio
    if (win_ratio > 0.65) {
        return "#810c9e"; // super unicum
    }
    else if (win_ratio >= 0.60) {
        return "#D042F3"; // regular ol unicorn
    }
    else if (win_ratio >= 0.56) {
        return "#3182bd"; // great
    }
    else if (win_ratio >= 0.54) {
        return "#74c476"; // very good
    }
    else if (win_ratio >= 0.52) {
        return "#a1d99b"; //  good
    }
    else if (win_ratio >= 0.50) {
        return "#fed976"; // average
    }
    else if (win_ratio >= 0.45) {
        return "#fd8d3c"; // below average
    }
    else if (win_ratio >= 0.40 && win_ratio < 0.35) {
        return "#e6550d"; // bad
    }
    else {
        return "#a50f15"; // super bad
    }
}

drawBattlePlot();
