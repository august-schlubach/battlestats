# utility functions to interact with the warships API
from warships.models import Player, Ship
from dateutil.relativedelta import relativedelta
import datetime
import random
import requests
import os


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
        response = requests.get(url, params=params)
        data = response.json()
        try:
            if data['data'][str(ship_id)] is not None:
                ship.name = data['data'][str(ship_id)]['name']
                ship.nation = data['data'][str(ship_id)]['nation']
                ship.is_premium = data['data'][str(ship_id)]['is_premium']
                ship.ship_type = data['data'][str(ship_id)]['type']
                ship.save()
                print(f'Created ship {ship.name}')

        except KeyError:
            print(f"Error in response for ship_id: {ship_id}")
            print(data)

    return ship


def get_player_by_name(player_name: str) -> Player:
    player_name = player_name.lower()

    # given a player name, get the player_id
    url = "https://api.worldofwarships.com/wows/account/list/"
    params = {
        "application_id": os.environ.get('WG_APP_ID'),
        "search": player_name
    }
    response = requests.get(url, params=params)
    if response.json()['status'] == "error":
        print('error in response')
        return None
    # TODO: handle failed lookups

    player, created = Player.objects.get_or_create(name=player_name)
    player.player_id = response.json()['data'][0]['account_id']

    player_data = _get_player_data(player.player_id)

    # battle counts
    player.total_battles = player_data[str(
        player.player_id)]["statistics"]["battles"]

    player.pvp_battles = int(player_data[str(
        player.player_id)]["statistics"]["pvp"]["battles"])

    # calculate win/loss ratio
    player.pvp_wins = int(
        player_data[str(player.player_id)]["statistics"]["pvp"]["wins"])
    player.pvp_losses = int(
        player_data[str(player.player_id)]["statistics"]["pvp"]["losses"])
    player.pvp_ratio = round(
        (int(player.pvp_wins) / player.pvp_battles * 100), 2)

    player.creation_date = datetime.datetime.fromtimestamp(
        int(player_data[str(player.player_id)]["created_at"]))

    # calculate the time since the last battle
    player.last_battle_date = datetime.datetime.fromtimestamp(
        int(player_data[str(player.player_id)]["last_battle_time"])).date()
    player.days_since_last_battle = int(
        (datetime.datetime.now().date() - player.last_battle_date).days)

    # calculate survival rates
    player.pvp_survival_rate = round((player_data[str(
        player.player_id)]["statistics"]["pvp"]["survived_battles"] / player.pvp_battles) * 100, 2)
    player.save()

    # calculate win survival rate
    player.wins_survival_rate = round((player_data[str(
        player.player_id)]["statistics"]["pvp"]["survived_wins"] / player.pvp_wins) * 100, 2)

    player.recent_games = _get_recent_statistics(player)
    return player


def get_ship_stats(player_id: int):
    url = "https://api.worldofwarships.com/wows/ships/stats/"
    params = {
        "application_id": os.environ.get('WG_APP_ID'),
        "account_id": player_id
    }
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
