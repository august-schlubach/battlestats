# utility functions to interact with the warships API
from warships.models import Player, Ship, Clan
from dateutil.relativedelta import relativedelta
import datetime
import random
import requests
import os
import logging

logging.basicConfig(level=logging.INFO)


def get_clan_members(clan_id: str):
    """
    Get clan members for a given clan_id
    """

    url = "https://api.worldofwarships.com/wows/clans/info/"
    params = {
        "application_id": os.environ.get('WG_APP_ID'),
        "clan_id": clan_id
    }
    logging.info(f'--> remote fetching clan members for clan_id: {clan_id}')
    response = requests.get(url, params=params)
    data = response.json()

    for player_id in data['data'][str(clan_id)]['members_ids']:
        logging.info(f' adding player_id: {player_id} to clan_id: {clan_id}')
        get_player_by_id(player_id)

    return data


def get_ship_by_id(ship_id: str):
    """
    Get ship data for a given ship_id
    """
    ship, created = Ship.objects.get_or_create(ship_id=int(ship_id))
    if created:
        url = "https://api.worldofwarships.com/wows/encyclopedia/ships/"
        params = {
            "application_id": os.environ.get('WG_APP_ID'),
            "ship_id": ship_id
        }
        logging.info(f'--> remote fetching ship info for id: {ship_id}')
        response = requests.get(url, params=params)
        data = response.json()
        try:
            if data['data'][str(ship_id)] is not None:
                ship.name = data['data'][str(ship_id)]['name']
                ship.nation = data['data'][str(ship_id)]['nation']
                ship.is_premium = data['data'][str(ship_id)]['is_premium']
                ship.ship_type = data['data'][str(ship_id)]['type']
                ship.tier = data['data'][str(ship_id)]['tier']
                ship.save()
                print(f'Created ship {ship.name}')
            else:
                print(f"Error in response for ship_id: {ship_id}")
                print(data)

        except KeyError:
            print(f"Error in response for ship_id: {ship_id}")
            print(data)

    return ship


def get_clan_info_by_player_id(player_id: str):
    print(f'fetching clan info for id: {player_id}')

    url = "https://api.worldofwarships.com/wows/clans/accountinfo/"
    params = {
        "application_id": os.environ.get('WG_APP_ID'),
        "account_id": player_id,
        "extra": "clan"
    }
    logging.info(f'--> remote fetching clan info for player_id: {player_id}')
    response = requests.get(url, params=params)
    data = response.json()
    clan_id = None
    try:
        clan_id = data['data'][str(player_id)]['clan_id']
    except TypeError:
        print('no clan found')
        return None
    else:
        clan, created = Clan.objects.get_or_create(
            clan_id=clan_id,
            name=data['data'][str(player_id)]['clan']['name'],
            tag=data['data'][str(player_id)]['clan']['tag'],
            members_count=data['data'][str(player_id)]['clan']['members_count'])
        clan.save()
        if created:
            get_clan_members(str(clan.clan_id))

        return clan


def get_player_by_id(player_id: str) -> Player:
    player, created = Player.objects.get_or_create(player_id=player_id)
    if created:
        player.player_id = player_id
        player.save()
        create_new_player(player)
    return player


def get_player_by_name(player_name: str) -> Player:

    player, created = Player.objects.get_or_create(name__iexact=player_name)
    if created:
        url = "https://api.worldofwarships.com/wows/account/list/"
        params = {
            "application_id": os.environ.get('WG_APP_ID'),
            "search": player_name
        }

        logging.info(
            f'--> remote fetching player info for: {player_name}')

        response = requests.get(url, params=params)
        if response.json()['status'] == "error":
            print('error in response')
            return None
        # TODO: handle failed lookups

        player.player_id = response.json()['data'][0]['account_id']
        player.save()
        create_new_player(player)

    return player


def create_new_player(player: Player):
    player_data = _get_player_data(player.player_id)
    player.name = player_data[str(player.player_id)]["nickname"]

    player.total_battles = player_data[str(
        player.player_id)]["statistics"]["battles"]
    player.pvp_battles = int(player_data[str(
        player.player_id)]["statistics"]["pvp"]["battles"])
    player.pvp_wins = int(
        player_data[str(player.player_id)]["statistics"]["pvp"]["wins"])
    player.pvp_losses = int(
        player_data[str(player.player_id)]["statistics"]["pvp"]["losses"])
    player.last_battle_date = datetime.datetime.fromtimestamp(
        int(player_data[str(player.player_id)]["last_battle_time"])).date()

    # calculate win/loss ratio
    if player.pvp_battles == 0:
        player.pvp_ratio = 0
    else:
        player.pvp_ratio = round(
            (int(player.pvp_wins) / player.pvp_battles * 100), 2)

    player.creation_date = datetime.datetime.fromtimestamp(
        int(player_data[str(player.player_id)]["created_at"]))

    # calculate the time since the last battle
    player.days_since_last_battle = int(
        (datetime.datetime.now().date() - player.last_battle_date).days)

    # calculate survival rates
    player.pvp_survival_rate = round((player_data[str(
        player.player_id)]["statistics"]["pvp"]["survived_battles"] / player.pvp_battles) * 100, 2)

    clan = get_clan_info_by_player_id(str(player.player_id))
    if clan is not None:
        player.clan = clan
        player.save()

    player.recent_games = get_ship_stats(player.player_id)
    player.save()


def get_ship_stats(player_id: str):
    url = "https://api.worldofwarships.com/wows/ships/stats/"
    params = {
        "application_id": os.environ.get('WG_APP_ID'),
        "account_id": player_id
    }
    logging.info(f'--> remote fetching ship stats for player_id: {player_id}')
    response = requests.get(url, params=params)
    data = response.json()
    if data is None:
        print("No data found")
        return []
    else:
        return data


def _get_player_data(player_id: int):
    """
    Get player data for a given player_id
    """
    url = "https://api.worldofwarships.com/wows/account/info/"
    params = {
        "application_id": os.environ.get('WG_APP_ID'),
        "account_id": player_id
    }
    logging.info(f'--> remote fetching player data for player_id: {player_id}')
    response = requests.get(url, params=params)
    data = response.json()
    if data is None:
        print("No data found")
        return []
    else:
        return data['data']


def _get_recent_statistics(player: Player) -> list:
    # get statics for last 28 days, which is the max that the API allows
    battle_data = {
        "dates": [],
        "games_played": []
    }

    for i in range(28):
        date = ((datetime.datetime.now() - datetime.timedelta(28)) +
                datetime.timedelta(days=i)).date().strftime("%m-%d")
        games_played = random.randint(0, 12)
        battle_data['dates'].append(date)
        battle_data['games_played'].append(games_played)

    return battle_data

    '''
    if int((datetime.datetime.now() - player.last_battle_date).days) <= 28:
        # start recursing from last played until 28 day data horizon
        start_horizon = (datetime.date.today() - relativedelta(days=+28))

        date_list = [start_horizon +
                     datetime.timedelta(days=x) for x in range(10)]
        for date in date_list:
            if date > player.last_battle_date:
                print("date is greater than last battle")
                break
            else:
                # dates.append(date.strftime("%Y%m%d"))
                print('date is less than last battle')

    url = "https://api.worldofwarships.com/wows/account/statsbydate/"
    params = {
        "application_id": os.environ.get('WG_APP_ID'),
        "account_id": player_id,
        "dates": []
    }
    response = requests.get(url, params=params)
    data = response.json()
    return data['data']
    '''
