$(function () {
    $.getJSON("/warships/fetch/load_player_names", function (data) {
        player_names = data;
        console.log("player names from the source:", player_names);
        $("#player_query").autocomplete({
            source: player_names
        });
    });
    $("#player_query").keyup(function (event) {
        if (event.keyCode == 13) {
            var element = document.getElementById("player_query");
            window.location.href = "/warships/player/" + element.value;
        }
    });
});