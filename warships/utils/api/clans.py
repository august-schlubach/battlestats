from warships.models import Player, Clan
import requests
import os
import logging

logging.basicConfig(level=logging.INFO)


def _fetch_clan_data(player_id: str) -> dict:
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
        "extra": "clan"
    }
    logging.info(f'--> remote fetching clan info for player_id: {player_id}')
    response = requests.get(url, params=params)
    data = response.json()

    if data['status'] == "ok":
        return_data = data['data'][player_id]

    return return_data


def _fetch_clan_member_ids(clan_id: str) -> list:
    """
    fetch all of the members of a given clan and get_or_create a new player object 
    for each member. this method is intended to be run asynchonously
    when a new clan is created so that all of the data is fetched and stored
    before it is needed.
    """
    members = []
    url = "https://api.worldofwarships.com/wows/clans/info/"
    params = {
        "application_id": os.environ.get('WG_APP_ID'),
        "clan_id": clan_id
    }
    logging.info(f'--> remote fetching clan members for clan_id: {clan_id}')
    response = requests.get(url, params=params)
    data = response.json()

    # extract list of player ids from clan data and join into a string
    # for batch loading from api
    members = data['data'][str(clan_id)]['members_ids']
    return members


def _fetch_player_data_from_list(players: list) -> dict:
    """
    fetch all of the player data for a given list of player ids
    """
    return_data = {}
    member_list = ','.join([str(member) for member in players])

    url = "https://api.worldofwarships.com/wows/account/info/"
    params = {
        "application_id": os.environ.get('WG_APP_ID'),
        "account_id": member_list
    }
    logging.info(f'--> remote fetching player data for members: {member_list}')
    response = requests.get(url, params=params)
    data = response.json()

    if data is None:
        print("ERROR: No data found for list of players")
    else:
        return_data = data['data']

    return return_data
