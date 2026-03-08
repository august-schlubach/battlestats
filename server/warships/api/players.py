import logging
import os
import requests
from typing import Dict, Optional
from warships.models import Player

logging.basicConfig(level=logging.INFO)

BASE_URL = "https://api.worldofwarships.com/wows/"
APP_ID = os.environ.get('WG_APP_ID')
REQUEST_TIMEOUT_SECONDS = 20


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
    return data.get(str(player_id), {}) if data else {}


def _fetch_ranked_account_info(player_id: int) -> Dict:
    """Fetch ranked battles account info (rank_info) for a player."""
    params = {
        "application_id": APP_ID,
        "account_id": player_id,
        "fields": "rank_info"
    }
    logging.info(
        f' ---> Remote fetching ranked account info for player_id: {player_id}')
    data = _make_api_request("seasons/accountinfo/", params)
    return data.get(str(player_id), {}) if data else {}


def _fetch_ranked_seasons_info() -> Dict:
    """Fetch all ranked season metadata (names, dates)."""
    params = {
        "application_id": APP_ID,
        "fields": "season_id,season_name,start_at,close_at"
    }
    logging.info(' ---> Remote fetching ranked seasons metadata')
    data = _make_api_request("seasons/info/", params)
    return data if data else {}


def _fetch_player_id_by_name(player_name: str) -> Optional[str]:
    """Return a player_id from local cache first, then WoWS API exact lookup."""
    normalized_name = player_name.strip()
    if not normalized_name:
        return None

    local_player = Player.objects.filter(name__iexact=normalized_name).first()
    if local_player:
        return str(local_player.player_id)

    params = {
        "application_id": APP_ID,
        "search": normalized_name,
        "type": "exact",
        "limit": 1,
        "fields": "account_id,nickname"
    }
    logging.info(f' ---> Remote fetching player info for: {normalized_name}')
    data = _make_api_request("account/list/", params)

    if not data:
        return None

    try:
        return str(data[0]['account_id'])
    except (KeyError, IndexError, TypeError):
        logging.error(
            f"ERROR: Accessing player data by name: {normalized_name}")
        return None


def _make_api_request(endpoint: str, params: Dict) -> Optional[Dict]:
    """Helper function to make API requests and handle responses."""
    try:
        response = requests.get(
            BASE_URL + endpoint,
            params=params,
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        data = response.json()
    except requests.RequestException as error:
        logging.error(
            f"HTTP request failed for endpoint '{endpoint}': {error}")
        return None
    except ValueError as error:
        logging.error(f"Invalid JSON from endpoint '{endpoint}': {error}")
        return None

    if not data or data.get('status') == "error":
        logging.error(f"Error in response: {data}")
        return None

    return data.get('data', {})
