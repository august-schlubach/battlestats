from warships.models import Player, Clan
import requests
import os
import logging

logging.basicConfig(level=logging.INFO)


def get_clan_info_by_player_id(player_id: str):
    print(f'fetching clan info for id: {player_id}')

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
        print('no clan found')
        return None
    else:
        clan, created = Clan.objects.get_or_create(
            clan_id=clan_id,
            name=data['data'][str(player_id)]['clan']['name'],
            tag=data['data'][str(player_id)]['clan']['tag'],
            members_count=data['data'][str(player_id)]['clan']['members_count'])
        clan.save()
        if created:
            get_clan_members(str(clan.clan_id))

        return clan


def get_clan_members(clan_id: str) -> None:
    """
    Get clan members for a given clan_id
    """

    url = "https://api.worldofwarships.com/wows/clans/info/"
    params = {
        "application_id": os.environ.get('WG_APP_ID'),
        "clan_id": clan_id
    }
    logging.info(f'--> remote fetching clan members for clan_id: {clan_id}')
    response = requests.get(url, params=params)
    data = response.json()

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
