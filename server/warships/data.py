import pandas as pd
import logging
from django.http import JsonResponse
from datetime import datetime, timedelta
from celery.exceptions import CeleryError
from warships.models import Player
from warships.api.ships import _fetch_ship_stats_for_player, _fetch_ship_info
import json


def fetch_battle_data(player_id: str) -> pd.DataFrame:
    player = Player.objects.get(player_id=player_id)

    if not player.battles_json or not player.battles_updated_at or datetime.now() - player.battles_updated_at > timedelta(minutes=15):
        logging.info(
            f'No battles data found for {player.name}: fetching new data')
        player.battles_json = _fetch_ship_stats_for_player(player_id)
        player.battles_updated_at = datetime.now()
        player.save()
    else:
        logging.info(
            f'  --> Cache is less than 15 minutes old: returning cached data')

    ship_data = player.battles_json
    prepared_data = {
        'ship_name': [],
        'ship_tier': [],
        'all_battles': [],
        'distance': [],
        'wins': [],
        'losses': [],
        'ship_type': [],
        'pve_battles': [],
        'pvp_battles': [],
        'win_ratio': [],
        'kdr': []
    }

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

        prepared_data['ship_name'].append(ship_model.name)
        prepared_data['ship_tier'].append(ship_model.tier)
        prepared_data['all_battles'].append(battles)
        prepared_data['distance'].append(distance)
        prepared_data['wins'].append(wins)
        prepared_data['losses'].append(losses)
        prepared_data['ship_type'].append(ship_model.ship_type)
        prepared_data['pve_battles'].append(battles - (wins + losses))
        prepared_data['pvp_battles'].append(pvp_battles)
        prepared_data['win_ratio'].append(
            round(wins / pvp_battles, 2) if pvp_battles > 0 else 0)
        prepared_data['kdr'].append(
            round(frags / pvp_battles, 2) if pvp_battles > 0 else 0)

    return pd.DataFrame(prepared_data).sort_values(by="pvp_battles", ascending=False)


def fetch_tier_data(player_id: str) -> pd.DataFrame:
    data = []
    try:
        # Ensure the player exists
        player = Player.objects.get(player_id=player_id)
    except Player.DoesNotExist:
        return JsonResponse({'error': 'Player not found'}, status=404)

    df = fetch_battle_data(player_id)
    logging.info(
        f'fetch_battle_data returned df: {df.shape[1]}, {df.shape[0]} : {df.shape}\n{df.head()}')
    df = df.filter(['ship_tier', 'pvp_battles', 'wins'])
    logging.info(
        f'fetch_battle_data filtered df: {df.shape[1]}, {df.shape[0]} : {df.shape}\n{df.head()}')

    for i in range(1, 12):
        j = 12 - i  # reverse the tier order
        logging.info(f'Processing tier {j}')
        battles = int(df.loc[df['ship_tier'] == 12 - i, 'pvp_battles'].sum())
        wins = int(df.loc[df['ship_tier'] == 12 - i, 'wins'].sum())
        wr = round(wins / battles if battles > 0 else 0, 2)
        data.append({
            'ship_tier': 12 - i,
            'pvp_battles': battles,
            'wins': wins,
            'win_ratio': wr
        })

    player.tiers_json = json.dumps(data)
    player.save()

    return pd.DataFrame(data)

# Ensure the data returned from fetch_tier_data is correctly serialized


def tier_data(request, player_id):
    data = fetch_tier_data(player_id)
    if isinstance(data, JsonResponse):
        return data  # Return the error response if fetch_tier_data returned one

    # Convert DataFrame to list of dictionaries
    data_list = data.to_dict(orient='records')
    return JsonResponse(data_list, safe=False)
