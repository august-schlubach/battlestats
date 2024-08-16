import pandas as pd
import logging
from django.http import JsonResponse
from datetime import datetime, timedelta
from warships.models import Player, Snapshot
from warships.api.ships import _fetch_ship_stats_for_player, _fetch_ship_info
from warships.api.players import _fetch_snapshot_data
import math


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


def fetch_tier_data(player_id: str) -> list:
    """
    Fetches and processes tier data for a given player. Tier data is a subset of battle data.

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

# -----------------------------------------


def update_snapshot_data(player_id: int) -> None:
    player = Player.objects.get(player_id=player_id)

    try:
        last_snapshot = Snapshot.objects.filter(player=player).latest('date')
        last_fetch_date = last_snapshot.last_fetch
    except Snapshot.DoesNotExist:
        last_fetch_date = datetime.now() - timedelta(days=50)

    time_since_last_fetch = datetime.now() - last_fetch_date
    if time_since_last_fetch.days < 1:
        hours, remainder = divmod(time_since_last_fetch.seconds, 3600)
        minutes, _ = divmod(remainder, 60)
        logging.info(
            f'Fresh fetch {hours:02}h {minutes:02}m ago')
        return
    else:
        logging.info(
            f'Old snapshot data: Fetched {time_since_last_fetch.days} days ago')
        logging.info('Fetching new snapshot data')

    today = datetime.now()
    start_date = today - timedelta(days=28)
    dates = [(start_date + timedelta(days=i)).strftime("%Y%m%d")
             for i in range(29)]

    for n in range(4):
        week = [dates[x + n * 7] for x in range(1, 8)]
        week_str = ','.join(week)
        stats = _fetch_snapshot_data(player.player_id, week_str)

        if stats:
            # this means that the player has battles during this week
            logging.info(
                f' ---> Fetched {len(stats)} snapshots for {player.name}')
            for date_str, stat in stats.items():
                output_date = datetime.strptime(
                    date_str, '%Y%m%d').strftime('%Y-%m-%d')
                snapshot, created = Snapshot.objects.get_or_create(
                    player=player, date=output_date)
                snapshot.battles = stat['battles']
                snapshot.wins = stat['wins']
                snapshot.survived_battles = stat['survived_battles']
                snapshot.battle_type = stat['battle_type']
                snapshot.last_fetch = datetime.now()
                snapshot.save()
        else:
            # create a snapshot with 0 battles for this week
            logging.info(
                f' ---> No battles found for {player.name} in week {n+1}')
            # make an empty snapshot for the player
            snapshot, created = Snapshot.objects.get_or_create(
                player=player, date=(today - timedelta(days=7 * n)).date())
            snapshot.battles = 0
            snapshot.wins = 0
            snapshot.survived_battles = 0
            snapshot.battle_type = 'pvp'
            snapshot.last_fetch = datetime.now()
            snapshot.save()

    snapshots = Snapshot.objects.filter(
        player=player, date__gte=start_date).order_by('date')

    for i in range(1, len(snapshots)):
        snapshots[i].interval_battles = snapshots[i].battles - \
            snapshots[i-1].battles
        snapshots[i].interval_wins = snapshots[i].wins - snapshots[i-1].wins
        snapshots[i].save()


def fetch_activity_data(player_id: str) -> list:
    player = Player.objects.get(player_id=player_id)
    update_snapshot_data(player_id)

    month = []
    data = {
        "date": datetime.now().date().strftime("%Y-%m-%d"),
        "battles": 0,
        "wins": 0
    }
    for i in range(29):
        date = (datetime.now() - timedelta(28) +
                timedelta(days=i)).date().strftime("%Y-%m-%d")
        data["date"] = date

        snap = Snapshot.objects.filter(player=player, date=date).first()
        if snap:
            data["battles"] = snap.interval_battles or 0
            data["wins"] = snap.interval_wins or 0
        else:
            data["battles"] = 0
            data["wins"] = 0
        month.extend([data.copy()])

    return month
