from django.http import HttpResponse
from django.shortcuts import render
from warships.utils.data import (
    fetch_battle_data,
    fetch_clan_data,
    get_player_by_name,
    populate_clan
)
from warships.models import Clan, Player
import csv
import random


def clan(request, clan_id: str = "1000057393") -> render:
    # fetch clan data and render for template
    clan = Clan.objects.get(clan_id=clan_id)
    members = clan.player_set.filter(clan=clan).order_by('-last_battle_date')
    clan_list = Clan.objects.all()
    return render(request, 'clan.html', {"context": {"clan": clan,
                                                     "members": members,
                                                     "clan_list": clan_list}})


def splash(request) -> render:
    # render splash page, which gets recent lookups
    recent = Player.objects.all().order_by('-last_battle_date')[:25]
    return render(request, 'splash.html', {"context": {"recent": recent}})


def player(request, name: str = "lil_boots") -> render:
    # fetch basic player data and render for template
    player = get_player_by_name(name)
    try:
        clan = Clan.objects.get(clan_id=player.clan.clan_id)
        print(f'---> clan found: {clan.name} {clan.clan_id}')
        populate_clan(clan.clan_id)
    except Clan.DoesNotExist:
        print('player has no clan')

    recent = Player.objects.all().order_by(
        '-last_battle_date')[:25]
    return render(
        request, 'player.html',  {"context": {"player": player,
                                              "recent": recent}})


# -----
# utility views for fetching data for ajax calls

def load_clan_plot_data(request, clan_id: str) -> HttpResponse:
    # Create the HttpResponse object with the appropriate CSV header.
    response = HttpResponse(content_type="text/csv")

    # fetch battle data for a given player and prepare it for display
    df = fetch_clan_data(clan_id)
    df = df.loc[df['pvp_battles'] > 15]

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
