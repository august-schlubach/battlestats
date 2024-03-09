from django.http import HttpResponse
from django.shortcuts import render
from warships.models import RecentLookup
from warships.utils.api import get_player_by_name
from warships.utils.data import fetch_battle_data, fetch_clan_data
from warships.models import Clan
import csv
import random


def clan(request, clan_id: str = "1000057393") -> render:
    # fetch basic clan data and render for template
    clan = Clan.objects.get(clan_id=clan_id)
    members = clan.player_set.filter(clan=clan)
    # call api to get clan members
    return render(request, 'clan.html', {"context": {"clan": clan,
                                                     "members": members}})


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


def load_clan_plot_data(request, clan_id: str) -> HttpResponse:
    # Create the HttpResponse object with the appropriate CSV header.
    response = HttpResponse(content_type="text/csv")

    # fetch battle data for a given player and prepare it for display
    df = fetch_clan_data(clan_id)
    writer = csv.writer(response)
    writer.writerow(["player_name", "pvp_battles", "pvp_ratio"])

    for index, row in df.iterrows():
        writer.writerow(
            [row['name'],
             row['pvp_battles'],
             row['pvp_ratio']])

    return response


def load_activity_data(request, player_id: str,
                       ship_type: str = "all",
                       ship_tier: str = "all") -> HttpResponse:

    print(f"loading battle activity data for player_id: {player_id}")
    # Create the HttpResponse object with the appropriate CSV header.
    response = HttpResponse(content_type="text/csv")

    # fetch battle data for a given player and prepare it for display
    df = fetch_battle_data(player_id)
    if ship_type != "all":
        df = df[df['ship_type'] == ship_type]

    if ship_tier != "all":
        df = df[df['ship_tier'] == int(ship_tier)]

    df = df.head(20)
    writer = csv.writer(response)
    writer.writerow(["ship", "ship_tier", "pvp_battles", "type",
                    "wins", "kdr", "win_ratio"])

    count = 0
    for index, row in df.iterrows():
        writer.writerow(
            [row['ship_name'],
             row['ship_tier'],
             row['pvp_battles'],
             row['ship_type'],
             row['wins'],
             row['kdr'],
             row['win_ratio']])
        count += 1
    while (count < 20):
        r = str(random.randint(0, 1000000))
        writer.writerow([r, "1",
                        "0", "Battleship", "0", "0", "0"])
        count += 1

    return response
