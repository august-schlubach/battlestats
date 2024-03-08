from .utils.api import get_player_by_name
from django.shortcuts import render
from .utils.data import fetch_battle_data
from django.http import HttpResponse
from warships.models import RecentLookup
import csv


def splash(request) -> render:
    # render splash page
    recent_players = RecentLookup.objects.all().order_by('-last_updated')
    return render(request, 'splash.html', {"context": {"recent_players": recent_players}})


def player(request, name: str = "lil_boots") -> render:
    # fetch basic player data and render for template
    player = get_player_by_name(name)
    recent_players = RecentLookup.objects.all().order_by('-last_updated')
    return render(
        request, 'player.html',  {"context": {"player": player,
                                              "recent_players": recent_players}})


def load_activity_data(request, player_id: str, filter_type: str = "pvp_battles") -> HttpResponse:

    # Create the HttpResponse object with the appropriate CSV header.
    response = HttpResponse(content_type="text/csv")

    # fetch battle data for a given player and prepare it for display
    df = fetch_battle_data(player_id)
    if filter_type != "pvp_battles":
        df = df[df['ship_type'] == filter_type]

    df = df.head(30)
    writer = csv.writer(response)
    writer.writerow(["ship", "pvp_battles", "type",
                    "wins", "kdr", "win_ratio"])
    for index, row in df.iterrows():
        writer.writerow(
            [row['ship_name'],
             row['pvp_battles'],
             row['ship_type'],
             row['wins'],
             row['kdr'],
             row['win_ratio']])

    return response
