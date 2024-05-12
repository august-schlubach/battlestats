from django.http import HttpResponse, JsonResponse
from django.shortcuts import render
from warships.utils.data import (
    fetch_battle_data,
    fetch_clan_data,
    get_player_by_name,
    fetch_snapshot_data
)
from warships.tasks import populate_clan
from warships.models import Clan, Player
import csv
import random
import pandas as pd
import os
import json
import math


def clan(request, clan_id: str = "1000057393") -> render:
    # fetch clan data and render for template
    clan = Clan.objects.get(clan_id=clan_id)
    members = clan.player_set.filter(clan=clan).order_by('-last_battle_date')
    all_members = members.count()
    active_members = members.filter(days_since_last_battle__lt=30).count()
    clan_list = Clan.objects.all()
    return render(request, 'clan.html', {"context": {"clan": clan,
                                                     "members": members,
                                                     "clan_list": clan_list,
                                                     "active_members": active_members,
                                                     "all_members": all_members}})


def splash(request) -> render:
    # render splash page, which gets recent lookups
    players = Player.objects.all().order_by('-last_battle_date')[:25]
    clans = Clan.objects.all().order_by('-last_fetch')[:50]
    return render(request, 'splash.html', {"context": {"players": players, "clans": clans}})


def player(request, name: str = "lil_boots") -> render:
    # fetch basic player data and render for template
    player = get_player_by_name(name)
    try:
        clan = Clan.objects.get(clan_id=player.clan.clan_id)
        logging.info(f'Player has clan: fetching data for {clan.clan_id}')
        populate_clan.delay(clan.clan_id)
    except Clan.DoesNotExist:
        print('player has no clan')

    recent = Player.objects.all().order_by(
        '-last_battle_date')[:25]
    return render(
        request, 'player.html',  {"context": {"player": player,
                                              "recent": recent}})


# -----
# utility views for fetching data for ajax calls
def load_player_names(request) -> JsonResponse:
    # fetch all player names and return as JSON
    module_dir = os.path.dirname(__file__)
    file_path = os.path.join(module_dir, 'data', 'player_names.json')
    with open(file_path, 'r') as f:
        player_names = json.load(f)

    return JsonResponse(player_names, safe=False)


def load_clan_plot_data(request, clan_id: str, filter_type: str = "all") -> HttpResponse:
    # Create the HttpResponse object with the appropriate CSV header.
    response = HttpResponse(content_type="text/csv")

    # fetch battle data for a given player and prepare it for display
    df = fetch_clan_data(clan_id)
    df = df.loc[df['pvp_battles'] > 15]

    if filter_type != "all":
        df = df.loc[df['days_since_last_battle'] < 30]

    writer = csv.writer(response)
    writer.writerow(["player_name", "pvp_battles", "pvp_ratio"])

    for index, row in df.iterrows():
        writer.writerow(
            [row['name'],
             int(row['pvp_battles']),
             row['pvp_ratio']])

    return response


def load_activity_data(request, player_id: str,
                       ship_type: str = "all",
                       ship_tier: str = "all") -> HttpResponse:

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


def load_tier_data(request, player_id: str) -> HttpResponse:
    # Create the HttpResponse object with the appropriate CSV header.
    response = HttpResponse(content_type="text/csv")

    # fetch battle data for a given player and prepare it for display
    df = fetch_battle_data(player_id)
    df = df.filter(['ship_tier', 'pvp_battles', 'wins'])

    data = {'ship_tier': [], 'pvp_battles': [], 'wins': [], 'win_ratio': []}
    for i in range(1, 12):
        j = 12-i  # reverse the tier order
        battles = int(df.loc[df['ship_tier'] == 12-i, 'pvp_battles'].sum())
        wins = int(df.loc[df['ship_tier'] == 12-i, 'wins'].sum())
        wr = round(wins/battles if battles > 0 else 0, 2)
        data["pvp_battles"].append(battles)
        data["ship_tier"].append(12-i)
        data["wins"].append(wins)
        data["win_ratio"].append(wr)

    df = pd.DataFrame(
        data, columns=["ship_tier", "pvp_battles", "wins", "win_ratio"])

    writer = csv.writer(response)
    writer.writerow(["ship_tier", "pvp_battles", "wins", "win_ratio"])

    for index, row in df.iterrows():
        pvp_battles = row['pvp_battles']
        if math.isnan(pvp_battles):
            pvp_battles = 0

        wins = row['wins']
        if math.isnan(wins):
            wins = 0

        writer.writerow(
            [int(row['ship_tier']),
             int(pvp_battles),
             int(wins),
             row['win_ratio']])

    return response


def load_type_data(request, player_id: str) -> HttpResponse:
    # Create the HttpResponse object with the appropriate CSV header.
    response = HttpResponse(content_type="text/csv")

    # fetch battle data for a given player and prepare it for display
    df = fetch_battle_data(player_id)
    df = df.filter(['ship_type', 'pvp_battles', 'wins', 'win_ratio'])

    data = {'ship_type': [], 'pvp_battles': [], 'wins': [], 'win_ratio': []}
    for ship_type in df['ship_type'].unique():
        battles = int(df.loc[df['ship_type'] ==
                      ship_type, 'pvp_battles'].sum())
        wins = int(df.loc[df['ship_type'] == ship_type, 'wins'].sum())
        wr = round(wins/battles if battles > 0 else 0, 2)
        data["pvp_battles"].append(battles)
        data["ship_type"].append(ship_type)
        data["wins"].append(wins)
        data["win_ratio"].append(wr)

    df = pd.DataFrame(
        data, columns=["ship_type", "pvp_battles", "wins", "win_ratio"]).sort_values(by='pvp_battles', ascending=False)

    writer = csv.writer(response)
    writer.writerow(["ship_type", "pvp_battles", "wins", "win_ratio"])

    for index, row in df.iterrows():
        writer.writerow(
            [row['ship_type'],
             row['pvp_battles'],
             row['wins'],
             row['win_ratio']])

    return response


def load_recent_data(request, player_id: str) -> HttpResponse:
    # Create the HttpResponse object with the appropriate CSV header.
    response = HttpResponse(content_type="text/csv")

    # fetch battle data for a given player and prepare it for display
    df = fetch_snapshot_data(player_id)
    writer = csv.writer(response)
    writer.writerow(["date", "battles", "wins"])

    for index, row in df.iterrows():
        battles = row['battles']
        if math.isnan(battles):
            battles = 0

        wins = row['wins']
        if math.isnan(wins):
            wins = 0

        writer.writerow(
            [row['date'],
             int(battles),
             int(wins)])

    return response
