from warships.models import Player, Clan
from warships.utils.data import create_new_player
import requests
import os
import logging

logging.basicConfig(level=logging.INFO)


def _get_clan_info_by_player_id(player_id: str):
    """
    fetch clan info for a given player_id. if a player is part of 
    a naval clan, return the info for that clan. otherwise, return None
    """

    url = "https://api.worldofwarships.com/wows/clans/accountinfo/"
    params = {
        "application_id": os.environ.get('WG_APP_ID'),
        "account_id": player_id,
        "extra": "clan"
    }
    logging.info(f'--> remote fetching clan info for player_id: {player_id}')
    response = requests.get(url, params=params)
    data = response.json()
    clan_id = None
    try:
        clan_id = data['data'][str(player_id)]['clan_id']
    except TypeError:
        print('ERROR: typeerror accessing clan data by id')

    if clan_id is not None:
        clan, created = Clan.objects.get_or_create(
            clan_id=clan_id,
            name=data['data'][str(player_id)]['clan']['name'],
            tag=data['data'][str(player_id)]['clan']['tag'],
            members_count=data['data'][str(player_id)]['clan']['members_count'])
        clan.save()
        if created:
            # TODO: make this an async call
            _get_clan_members(str(clan.clan_id))
        return clan
    else:
        return None


def _get_clan_members(clan_id: str) -> None:
    """
    fetch all of the members of a given clan and get_or_create a new player object 
    for each member. this method is intended to be run asynchonously
    when a new clan is created so that all of the data is fetched and stored
    before it is needed.
    """

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
    member_list = ','.join([str(member) for member in members])

    url = "https://api.worldofwarships.com/wows/account/info/"
    params = {
        "application_id": os.environ.get('WG_APP_ID'),
        "account_id": member_list
    }
    logging.info(f'--> remote fetching player data for members: member_list')
    response = requests.get(url, params=params)
    data = response.json()
    if data is None:
        print("No data found")

    for player_id in members:
        player, created = Player.objects.get_or_create(player_id=player_id)
        if created:
            player.player_id = str(player_id)
            print(f'Creating new player with id: {player_id}')
            create_new_player(player, data['data'])
