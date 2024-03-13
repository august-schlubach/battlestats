import logging
import os
import requests
from warships.models import Player

logging.basicConfig(level=logging.INFO)


def _fetch_player_battle_data(player_id: int) -> dict:
    """
    fetch json data for a given player_id. returns a dict of 
    either player data or empty if player id not found
    """
    return_data = {}
    url = "https://api.worldofwarships.com/wows/account/info/"
    params = {
        "application_id": os.environ.get('WG_APP_ID'),
        "account_id": player_id
    }
    logging.info(f'--> remote fetching player data for player_id: {player_id}')
    response = requests.get(url, params=params)
    data = response.json()

    if data is None:
        print(f"ERROR: No data found for player_id: {player_id}")
    else:
        return_data = data['data']

    return return_data


def _fetch_player_id_by_name(player_name: str) -> str:
    """
    get_or_create a Player object by player name and return it
    """
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

        try:
            player_id = response.json()['data'][0]['account_id']
        except KeyError:
            print(f'ERROR: accessing player data by name: {player_name}')
            player_id = ''

        return player_id
    else:
        return player.player_id
