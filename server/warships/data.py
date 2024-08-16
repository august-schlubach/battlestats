import pandas as pd
import logging
from django.http import JsonResponse
from datetime import datetime, timedelta
from warships.models import Player
from warships.api.ships import _fetch_ship_stats_for_player, _fetch_ship_info
import json


def update_battle_data(player_id: str) -> None:
    """
    Updates the battle data for a given player.

    This function fetches the latest battle data for a player from an external API if the cached data is older than 15 minutes.
    The fetched data is then processed and saved back to the player's record in the database.

    Args:
        player_id (str): The ID of the player whose battle data needs to be updated.

    Returns:
        None
    """
    player = Player.objects.get(player_id=player_id)

    # Check if the cached data is less than 15 minutes old
    if player.battles_json and player.battles_updated_at and datetime.now() - player.battles_updated_at < timedelta(minutes=15):
        logging.info(
            f'  --> Cache exists and is less than 15 minutes old: returning cached data')
        return player.battles_json

    logging.info(
        f'Battles data empty or outdated: fetching new data for {player.name}')

    # Fetch ship stats for the player
    ship_data = _fetch_ship_stats_for_player(player_id)
    prepared_data = []

    for ship in ship_data:
        ship_model = _fetch_ship_info(ship['ship_id'])

        if not ship_model or not ship_model.name:
            continue

        pvp_battles = ship['pvp']['battles']
        wins = ship['pvp']['wins']
        losses = ship['pvp']['losses']
        frags = ship['pvp']['frags']
        battles = ship['battles']
        distance = ship['distance']

        ship_info = {
            'ship_name': ship_model.name,
            'ship_tier': ship_model.tier,
            'all_battles': battles,
            'distance': distance,
            'wins': wins,
            'losses': losses,
            'ship_type': ship_model.ship_type,
            'pve_battles': battles - (wins + losses),
            'pvp_battles': pvp_battles,
            'win_ratio': round(wins / pvp_battles, 2) if pvp_battles > 0 else 0,
            'kdr': round(frags / pvp_battles, 2) if pvp_battles > 0 else 0
        }

        prepared_data.append(ship_info)

    # Sort the data by "pvp_battles" in descending order
    sorted_data = sorted(prepared_data, key=lambda x: x.get(
        'pvp_battles', 0), reverse=True)

    player.battles_updated_at = datetime.now()
    player.battles_json = sorted_data
    player.save()
    logging.info(f"Updated player data: {player.name}")


def fetch_tier_data(player_id: str) -> str:
    """
    Fetches and processes tier data for a given player.

    This function updates the battle data for a player and then processes it to calculate the number of battles,
    wins, and win ratio for each ship tier. The processed data is saved back to the player's record in the database.

    Args:
        player_id (str): The ID of the player whose tier data needs to be fetched.

    Returns:
        str: A JSON response containing the processed tier data.
    """
    update_battle_data(player_id)

    try:
        player = Player.objects.get(player_id=player_id)
    except Player.DoesNotExist:
        return JsonResponse({'error': 'Player not found'}, status=404)

    df = pd.DataFrame(player.battles_json)
    df = df.filter(['ship_tier', 'pvp_battles', 'wins'])

    data = []
    for i in range(1, 12):
        j = 12 - i  # reverse the tier order
        battles = int(df.loc[df['ship_tier'] == 12 - i, 'pvp_battles'].sum())
        wins = int(df.loc[df['ship_tier'] == 12 - i, 'wins'].sum())
        wr = round(wins / battles if battles > 0 else 0, 2)
        data.append({
            'ship_tier': int(12 - i),
            'pvp_battles': battles,
            'wins': wins,
            'win_ratio': wr
        })

    player.tiers_json = data
    player.save()

    return data
