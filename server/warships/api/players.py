import logging
import os
import requests
from typing import Dict, Optional
from warships.models import Player

logging.basicConfig(level=logging.INFO)

BASE_URL = "https://api.worldofwarships.com/wows/"
APP_ID = os.environ.get('WG_APP_ID')


def _fetch_snapshot_data(player_id: int, dates: str = '') -> Dict:
    """Fetch JSON data containing recent battle stats for a given player_id."""
    params = {
        "application_id": APP_ID,
        "account_id": player_id,
        "dates": dates,
        "fields": "pvp.account_id,pvp.battles,pvp.wins,pvp.survived_battles,pvp.battle_type,pvp.date"
    }
    logging.info(f' ---> Remote fetching snapshot for player_id: {player_id}')
    data = _make_api_request("account/statsbydate/", params)

    return data.get(str(player_id), {}).get('pvp', {}) if data else {}


def _fetch_player_personal_data(player_id: int) -> Dict:
    """Fetch JSON data for a given player_id."""
    params = {
        "application_id": APP_ID,
        "account_id": player_id
    }
    logging.info(
        f' ---> Remote fetching player personal (account) data for player_id: {player_id}')
    data = _make_api_request("account/info/", params)
    breakpoint()
    return data.get(str(player_id), {}) if data else {}


def _fetch_player_id_by_name(player_name: str) -> Optional[str]:
    """Get or create a Player object by player name and return the player_id."""
    player, created = Player.objects.get_or_create(name__iexact=player_name)
    if created:
        params = {
            "application_id": APP_ID,
            "search": player_name
        }
        logging.info(f' ---> Remote fetching player info for: {player_name}')
        data = _make_api_request("account/list/", params)

        if data:
            try:
                return data[0]['account_id']
            except (KeyError, IndexError):
                logging.error(
                    f"ERROR: Accessing player data by name: {player_name}")
                return None
    return player.player_id


def _make_api_request(endpoint: str, params: Dict) -> Optional[Dict]:
    """Helper function to make API requests and handle responses."""
    response = requests.get(BASE_URL + endpoint, params=params)
    data = response.json()

    if not data or data.get('status') == "error":
        logging.error(f"Error in response: {data}")
        return None

    return data.get('data', {})
