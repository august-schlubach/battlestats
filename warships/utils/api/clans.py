from typing import Dict, List, Optional
import requests
import os
import logging

logging.basicConfig(level=logging.INFO)


def _fetch_clan_data(player_id: str) -> Dict:
    """
    fetch clan info for a given player_id. if a player is part of 
    a naval clan, return the info for that clan. otherwise, return 
    an empty dict
    """
    return_data = {}
    url = "https://api.worldofwarships.com/wows/clans/accountinfo/"
    params = {
        "application_id": os.environ.get('WG_APP_ID'),
        "account_id": player_id,
        "extra": "clan",
        "fields": "clan.members_count,clan.tag,clan.name,clan.clan_id"
    }
    logging.info(f'--> remote fetching clan info for player_id: {player_id}')
    response = requests.get(url, params=params)
    data = response.json()

    if data.get('status') == "ok":
        return data['data'].get(player_id, {})
    return {}


def _fetch_clan_member_ids(clan_id: str) -> List[str]:
    """
    fetch all of the members of a given clan and get_or_create a new player object 
    for each member. this method is intended to be run asynchonously
    when a new clan is created so that all of the data is fetched and stored
    before it is needed.
    """
    url = "https://api.worldofwarships.com/wows/clans/info/"
    params = {
        "application_id": os.environ.get('WG_APP_ID'),
        "clan_id": clan_id,
        "fields": "members_ids"
    }

    logging.info(f'--> Remote fetching clan members for clan_id: {clan_id}')
    response = requests.get(url, params=params)
    data = response.json()

    return data['data'].get(str(clan_id), {}).get('members_ids', [])


def _fetch_player_data_from_list(players: List[int]) -> Dict:
    """
    fetch all of the player data for a given list of player ids.
    this gets called from a list of clan ids to get all of the players.
    """
    member_list = ','.join([str(member) for member in players])

    url = "https://api.worldofwarships.com/wows/account/info/"
    params = {
        "application_id": os.environ.get('WG_APP_ID'),
        "account_id": member_list
    }
    logging.info(f'--> remote fetching player data for members: {member_list}')
    response = requests.get(url, params=params)
    data = response.json()

    if not data:
        logging.error("ERROR: No data found for list of players")
        return {}

    return data.get('data', {})
