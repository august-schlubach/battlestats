import logging
import os
import requests
from typing import Optional, Dict
from warships.models import Ship


logging.basicConfig(level=logging.INFO)

BASE_URL = "https://api.worldofwarships.com/wows/"
APP_ID = os.environ.get('WG_APP_ID')


def _fetch_ship_stats_for_player(player_id: str) -> Dict:
    """Fetch all competitive data for all ships for a given player_id."""
    params = {
        "application_id": APP_ID,
        "account_id": player_id
    }
    logging.info(
        f' ---> EXPENSIVE: Remote fetching all battle stats for player_id: {player_id}')
    data = _make_api_request("ships/stats/", params)

    data_dict = {}
    try:
        data_dict = data[str(player_id)]
    except KeyError:
        keys_to_print = list(data.keys())[:10]
        logging.error(
            f'Unexpected response while loading ship data: {keys_to_print}')

    return data_dict


def _fetch_ship_info(ship_id: str) -> Optional[Ship]:
    """Get or create a specific ship model and populate with non-competitive data."""
    try:
        clean_ship_id = int(ship_id)
        if clean_ship_id < 1:
            return None
    except ValueError:
        logging.error(f"ERROR: Invalid ship_id: {ship_id}")
        return None

    ship, created = Ship.objects.get_or_create(ship_id=clean_ship_id)
    if created:
        params = {
            "application_id": APP_ID,
            "ship_id": ship_id
        }
        logging.info(f' ---> Remote fetching ship info for id: {ship_id}')
        data = _make_api_request("encyclopedia/ships/", params)

        if data and data.get(str(ship_id)):
            ship_data = data[str(ship_id)]
            ship.name = ship_data.get('name')
            ship.nation = ship_data.get('nation')
            ship.is_premium = ship_data.get('is_premium')
            ship.ship_type = ship_data.get('type')
            ship.tier = ship_data.get('tier')
            ship.save()
            logging.info(f'Created ship {ship.name}')
        else:
            logging.error(
                f"ERROR: Null or invalid response data for ship_id: {ship_id}")
            logging.error(f"Response data: {data}")
            return None

    return ship


def _make_api_request(endpoint: str, params: Dict) -> Optional[Dict]:
    """Helper function to make API requests and handle responses."""
    response = requests.get(BASE_URL + endpoint, params=params)
    data = response.json()

    if data.get('status') != 'ok':
        logging.error(f"Error in response: {data}")
        return None

    return data.get('data', {})
