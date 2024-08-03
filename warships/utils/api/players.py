import logging
import os
import requests
from typing import Dict, Optional
from warships.models import Player

logging.basicConfig(level=logging.INFO)


def _fetch_snapshot_data(player_id: int, dates: str = '') -> Dict:
    """
    Fetch JSON data containing recent battle stats for a given player_id.
    Returns a dict of either player data or an empty dict if player id not found.
    """
    url = "https://api.worldofwarships.com/wows/account/statsbydate/"
    params = {
        "application_id": os.environ.get('WG_APP_ID'),
        "account_id": player_id,
        "dates": dates,
        "fields": "pvp.account_id,pvp.battles,pvp.wins,pvp.survived_battles,pvp.battle_type,pvp.date"
    }

    logging.info(f'--> Remote fetching snapshot for player_id: {player_id}')
    response = requests.get(url, params=params)
    data = response.json()

    if not data:
        logging.error(
            f"ERROR: No snapshot data found for player_id: {player_id}")
        return {}

    return data.get('data', {}).get(str(player_id), {}).get('pvp', {})


def _fetch_player_battle_data(player_id: int) -> Dict:
    """
    Fetch JSON data for a given player_id. Returns a dict of
    either player data or an empty dict if player id not found.
    """
    url = "https://api.worldofwarships.com/wows/account/info/"
    params = {
        "application_id": os.environ.get('WG_APP_ID'),
        "account_id": player_id
    }

    logging.info(f'--> Remote fetching player data for player_id: {player_id}')
    response = requests.get(url, params=params)
    data = response.json()

    if not data:
        logging.error(f"ERROR: No data found for player_id: {player_id}")
        return {}

    return data.get('data', {}).get(str(player_id), {})


def _fetch_player_id_by_name(player_name: str) -> Optional[str]:
    """
    Get or create a Player object by player name and return the player_id.
    """
    player, created = Player.objects.get_or_create(name__iexact=player_name)
    if created:
        url = "https://api.worldofwarships.com/wows/account/list/"
        params = {
            "application_id": os.environ.get('WG_APP_ID'),
            "search": player_name
        }

        logging.info(f'--> Remote fetching player info for: {player_name}')
        response = requests.get(url, params=params)
        response_data = response.json()

        if response_data.get('status') == "error":
            logging.error(f"Error in response: {response_data}")
            return None

        try:
            player_id = response_data['data'][0]['account_id']
            return player_id
        except (KeyError, IndexError):
            logging.error(
                f"ERROR: Accessing player data by name: {player_name}")
            return None
    else:
        return player.player_id
