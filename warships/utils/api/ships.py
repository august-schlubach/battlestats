from warships.models import Ship
import requests
import os
import logging

logging.basicConfig(level=logging.INFO)


def _fetch_ship_stats_for_player(player_id: str) -> dict:
    """
    fetch all of the competitive data for all of the ships for a given player_id.
    returns a json object that can be parsed for display keyed off of ship_id
    """
    data = {}
    url = "https://api.worldofwarships.com/wows/ships/stats/"
    params = {
        "application_id": os.environ.get('WG_APP_ID'),
        "account_id": player_id
    }

    logging.info(f'--> remote fetching ship stats for player_id: {player_id}')
    response = requests.get(url, params=params)
    data = response.json()

    if data is None:
        print(f"ERROR: No ship data found for player: {player_id}")

    return data


def _fetch_ship_info(ship_id: str) -> Ship:
    """
    Get or create a specific ship model and populate with non-competitive
    data for a given ship_id
    """
    ship, created = Ship.objects.get_or_create(ship_id=int(ship_id))
    if created:
        url = "https://api.worldofwarships.com/wows/encyclopedia/ships/"
        params = {
            "application_id": os.environ.get('WG_APP_ID'),
            "ship_id": ship_id
        }
        logging.info(f'--> remote fetching ship info for id: {ship_id}')
        response = requests.get(url, params=params)
        data = response.json()
    
        try:
            if data['data'][str(ship_id)] is not None:
                ship.name = data['data'][str(ship_id)]['name']
                ship.nation = data['data'][str(ship_id)]['nation']
                ship.is_premium = data['data'][str(ship_id)]['is_premium']
                ship.ship_type = data['data'][str(ship_id)]['type']
                ship.tier = data['data'][str(ship_id)]['tier']
                ship.save()
                print(f'Created ship {ship.name}')
            else:
                print(f"ERROR: null response data for ship_id: {ship_id}")
                print(data)

        except KeyError:
            print(f"ERROR: keyerror in response for ship_id: {ship_id}")
            print(data)

    return ship
