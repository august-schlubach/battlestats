from typing import Dict, List, Optional
import requests
import os
import logging

logging.basicConfig(level=logging.INFO)

BASE_URL = "https://api.worldofwarships.com/wows/"
APP_ID = os.environ.get('WG_APP_ID')


def _fetch_clan_data(player_id: str) -> Dict:
    """Fetch clan info for a given player_id."""
    params = {
        "application_id": APP_ID,
        "account_id": player_id,
        "extra": "clan",
        "fields": "clan.members_count,clan.tag,clan.name,clan.clan_id"
    }
    logging.info(f'--> Remote fetching clan info for player_id: {player_id}')
    data = _make_api_request("clans/accountinfo/", params)
    return data.get(player_id, {}) if data else {}


def _fetch_clan_member_ids(clan_id: str) -> List[str]:
    """Fetch all members of a given clan."""
    params = {
        "application_id": APP_ID,
        "clan_id": clan_id,
        "fields": "members_ids"
    }
    logging.info(f'--> Remote fetching clan members for clan_id: {clan_id}')
    data = _make_api_request("clans/info/", params)
    return data.get(str(clan_id), {}).get('members_ids', []) if data else []


def _fetch_player_data_from_list(players: List[int]) -> Dict:
    """Fetch all player data for a given list of player ids."""
    member_list = ','.join(map(str, players))
    params = {
        "application_id": APP_ID,
        "account_id": member_list
    }
    logging.info(f'--> Remote fetching player data for members: {member_list}')
    data = _make_api_request("account/info/", params)
    return data if data else {}


def _make_api_request(endpoint: str, params: Dict) -> Optional[Dict]:
    """Helper function to make API requests and handle responses."""
    response = requests.get(BASE_URL + endpoint, params=params)
    data = response.json()

    if data.get('status') != "ok":
        logging.error(f"Error in response: {data}")
        return None

    return data.get('data', {})
