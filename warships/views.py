from .utils.api import get_player_by_name
from django.shortcuts import render
from .utils.data import fetch_battle_data
from django.http import HttpResponse
import csv


def player(request, name: str = "lil_boots") -> render:
    # fetch basic player data and render for template
    player = get_player_by_name(name)

    return render(
        request, 'player.html',  {"context": {"player": player}})


def load_activity_data(request, player_id: str, filter_type: str = "pvp_battles") -> HttpResponse:

    # Create the HttpResponse object with the appropriate CSV header.
    response = HttpResponse(content_type="text/csv")

    # fetch battle data for a given player and prepare it for display
    df = fetch_battle_data(player_id)
    if filter_type != "pvp_battles":
        df = df[df['ship_type'] == filter_type]

    df = df.head(30)
    writer = csv.writer(response)
    writer.writerow(["ship", "pvp_battles", "type", "wins", "win_ratio"])
    for index, row in df.iterrows():
        writer.writerow(
            [row['ship_name'],
             row['pvp_battles'],
             row['ship_type'],
             row['wins'],
             row['win_ratio']])

    # if filter_type != "pvp_battles":
    #     breakpoint()

    return response


def load_type_data(request, player_id: str) -> HttpResponse:

    # Create the HttpResponse object with the appropriate CSV header.
    response = HttpResponse(content_type="text/csv")

    # fetch battle data for a given player and prepare it for display
    df(player_id)

    writer = csv.writer(response)
    writer.writerow(["ship", "all_battles", "pvp_battles",
                    "pve_battles", "type", "wins", "losses", "win_ratio"])
    for index, row in df.iterrows():
        writer.writerow(
            [row['ship_name'],
             row['all_battles'],
             row['pvp_battles'],
             row['pve_battles'],
             row['ship_type'],
             row['wins'],
             row['losses'],
             row['win_ratio']])

    return response
