import logging
import os
import requests
from typing import Dict, Optional
from warships.models import Ship

logging.basicConfig(level=logging.INFO)


def _fetch_ship_stats_for_player(player_id: str) -> Dict:
    """
    Fetch all of the competitive data for all of the ships for a given player_id.
    Returns a JSON object that can be parsed for display, keyed off of ship_id.
    """
    url = "https://api.worldofwarships.com/wows/ships/stats/"
    params = {
        "application_id": os.environ.get('WG_APP_ID'),
        "account_id": player_id
    }

    logging.info(f'--> Remote fetching ship stats for player_id: {player_id}')
    response = requests.get(url, params=params)
    data = response.json()

    if data.get('status') == 'ok':
        return data.get('data', {}).get(player_id, {})

    if not data:
        logging.error(f"ERROR: No ship data found for player: {player_id}")
        return {}

    return data.get('data', {}).get(player_id, {})


def _fetch_ship_info(ship_id: str) -> Optional[Ship]:
    """
    Get or create a specific ship model and populate with non-competitive
    data for a given ship_id.
    """
    try:
        clean_ship_id = int(ship_id)
        if clean_ship_id < 1:
            return None
    except ValueError:
        logging.error(f"ERROR: Invalid ship_id: {ship_id}")
        return None

    ship, created = Ship.objects.get_or_create(ship_id=clean_ship_id)
    if created:
        url = "https://api.worldofwarships.com/wows/encyclopedia/ships/"
        params = {
            "application_id": os.environ.get('WG_APP_ID'),
            "ship_id": ship_id
        }

        logging.info(f'--> Remote fetching ship info for id: {ship_id}')
        response = requests.get(url, params=params)
        data = response.json()

        if data and data.get('data') and data['data'].get(str(ship_id)):
            ship_data = data['data'][str(ship_id)]
            ship_name = ship_data.get('name')
            if not ship_name:
                logging.error(
                    f"ERROR: Ship name is empty for ship_id: {ship_id}")
                return None

            ship.name = ship_name
            ship.nation = ship_data.get('nation')
            ship.is_premium = ship_data.get('is_premium')
            ship.ship_type = ship_data.get('type')
            ship.tier = ship_data.get('tier')
            ship.save()
            logging.info(f'Created ship {ship.name}')
        else:
            logging.error(
                f"ERROR: Null or invalid response data for ship_id: {ship_id}")
            logging.error(data)
            return None

    return ship
