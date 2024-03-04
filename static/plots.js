
// set the dimensions and margins of the graph
const margin = { top: 20, right: 30, bottom: 40, left: 110 },
    width = 460 - margin.left - margin.right,
    height = 500 - margin.top - margin.bottom;

// append the svg object to the body of the page
const svg = d3.select("#container")
    .append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", `translate(${margin.left}, ${margin.top})`);

// Parse the Data


function drawPlot(battle_type) {
    var path = "http://127.0.0.1:8000/warships/player/load_activity_data/" + player_id + ":" + battle_type;
    d3.csv(path).then(function (data) {
        console.log(data)
        console.log('battle_type: ' + battle_type)
        var max = d3.max(data, function (d) { return + d[battle_type]; });

        function select_color(d) {
            if (d.type == "Cruiser") return ("blue");
            else if (d.type == "Destroyer") return ("#1b9e77");
            else if (d.type == "Battleship") return ("#d95f02");
            else if (d.type == "Aircraft Carrier") return ("#7570b3");
            else
                return ("#e7298a");
        }
        svg.selectAll("*").remove();

        // X axis
        const x = d3.scaleLinear()
            .domain([0, max])
            .range([0, width]);
        svg.append("g")
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
        svg.append("g")
            .call(d3.axisLeft(y))

        //Bars
        svg.selectAll("myRect")
            .data(data)
            .join("rect")
            .attr("x", x(0))
            .attr("y", d => y(d.ship))
            .attr("width", d => x(d[battle_type]))
            .attr("height", y.bandwidth())
            .attr("fill", select_color)(d => d.type);
    })
}

drawPlot("all");

function changeType(battle_type) {
    drawPlot(battle_type);
}
