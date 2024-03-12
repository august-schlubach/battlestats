from warships.models import Player
import logging
import os
import requests

logging.basicConfig(level=logging.INFO)


def _get_player_data(player_id: int) -> dict:
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


def _get_player_by_name(player_name: str) -> Player:

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
        player.name = response.json()['data'][0]['nickname']
        player.save()

    return player
