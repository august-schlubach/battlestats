from typing import Dict, List, Optional
import requests
import os
import logging

logging.basicConfig(level=logging.INFO)

BASE_URL = "https://api.worldofwarships.com/wows/"
APP_ID = os.environ.get('WG_APP_ID')
REQUEST_TIMEOUT_SECONDS = 20


def _fetch_clan_data(clan_id: str) -> Dict:
    """Fetch clan info for a given player_id."""
    params = {
        "application_id": APP_ID,
        "clan_id": clan_id,
        "fields": "members_count,tag,name,clan_id,description,leader_id,leader_name"
    }
    logging.info(f' ---> Remote fetching clan info for clan_id: {clan_id}')
    data = _make_api_request("clans/info/", params)
    return data.get(str(clan_id), {}) if data else {}


def _fetch_clan_member_ids(clan_id: str) -> List[str]:
    """Fetch all members of a given clan."""
    params = {
        "application_id": APP_ID,
        "clan_id": clan_id,
        "fields": "members_ids"
    }
    logging.info(f' ---> Remote fetching clan members for clan_id: {clan_id}')
    data = _make_api_request("clans/info/", params)
    return data.get(str(clan_id), {}).get('members_ids', []) if data else []


def _fetch_clan_battle_seasons_info() -> Dict:
    """Fetch clan battle season metadata."""
    params = {
        "application_id": APP_ID,
    }
    logging.info(' ---> Remote fetching clan battle seasons metadata')
    data = _make_api_request("clans/season/", params)
    return data if data else {}


def _fetch_clan_battle_season_stats(account_id: int) -> Dict:
    """Fetch clan battle season stats for a single player account."""
    params = {
        "application_id": APP_ID,
        "account_id": account_id,
    }
    logging.info(
        f' ---> Remote fetching clan battle season stats for account_id: {account_id}')
    data = _make_api_request("clans/seasonstats/", params)
    return data.get(str(account_id), {}) if data else {}


def _fetch_player_data_from_list(players: List[int]) -> Dict:
    """Fetch all player data for a given list of player ids."""
    member_list = ','.join(map(str, players))
    params = {
        "application_id": APP_ID,
        "account_id": member_list
    }
    logging.info(
        f' ---> Remote fetching player data for members: {member_list}')
    data = _make_api_request("account/info/", params)
    return data if data else {}


def _fetch_clan_membership_for_player(player_id: int) -> Dict:
    """Fetch clan membership data for a given player account id."""
    params = {
        "application_id": APP_ID,
        "account_id": player_id,
        "extra": "clan",
        "fields": "account_id,account_name,clan_id,clan"
    }
    logging.info(
        f' ---> Remote fetching clan membership for player_id: {player_id}')
    data = _make_api_request("clans/accountinfo/", params)
    return data.get(str(player_id), {}) if data else {}


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

    if data.get('status') != "ok":
        logging.error(f"Error in response: {data}")
        return None

    return data.get('data', {})
