from django.utils import timezone
from typing import Dict, Any, Optional
from datetime import datetime
import pandas as pd
import logging
from django.http import JsonResponse
from datetime import datetime, timedelta
from warships.models import Player, Snapshot, Clan
from warships.api.ships import _fetch_ship_stats_for_player, _fetch_ship_info
from warships.api.players import _fetch_snapshot_data, _fetch_player_personal_data
from warships.api.clans import _fetch_clan_data, _fetch_clan_member_ids

logging.basicConfig(level=logging.INFO)


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
            f'Cache exists and is fresh: returning cached data')
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


def update_snapshot_data(player_id: int) -> None:
    """
    Updates the snapshot data for a given player.

    This function fetches the latest snapshot data for a player from an external API if the cached data is older than a day.
    The fetched data is then processed and saved back to the player's record in the database.

    Args:
        player_id (int): The ID of the player whose snapshot data needs to be updated.

    Returns:
        None
    """
    player = Player.objects.get(player_id=player_id)
    player.last_lookup = datetime.now()
    player.save()

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
            f'Fresh snapshot fetched {hours:02}h {minutes:02}m ago')
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
                f'Fetched {len(stats)} snapshots for {player.name}')
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
                f'No battles found for {player.name} in week {n+1}')
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
    """
    Fetches and processes activity data for a given player.

    This function updates the snapshot data for a player and then processes it to calculate the number of battles
    and wins for each day in the past 29 days. The processed data is returned as a list of dictionaries.

    Args:
        player_id (str): The ID of the player whose activity data needs to be fetched.

    Returns:
        list: A list of dictionaries containing the processed activity data for the past 29 days.
    """
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


def fetch_type_data(player_id: str) -> list:
    """
    Fetches and processes ship type data for a given player.

    This function updates the battle data for a player and then processes it to calculate the number of battles,
    wins, and win ratio for each ship type. The processed data is returned as a list of dictionaries.

    Args:
        player_id (str): The ID of the player whose ship type data needs to be fetched.

    Returns:
        list: A list of dictionaries containing the processed ship type data, sorted by the number of PvP battles in descending order.
              Each dictionary contains the following keys:
              - 'ship_type': The type of the ship.
              - 'pvp_battles': The total number of PvP battles for the ship type.
              - 'wins': The total number of wins for the ship type.
              - 'win_ratio': The win ratio for the ship type, rounded to two decimal places.

    Raises:
        JsonResponse: If the player with the given ID does not exist, a JSON response with an error message and a 404 status code is returned.
    """
    update_battle_data(player_id)

    try:
        player = Player.objects.get(player_id=player_id)
    except Player.DoesNotExist:
        return JsonResponse({'error': 'Player not found'}, status=404)

    # fetch battle data for a given player and prepare it for display
    df = pd.DataFrame(player.battles_json)
    df = df.filter(['ship_type', 'pvp_battles', 'wins', 'win_ratio'])

    data = {'ship_type': [], 'pvp_battles': [], 'wins': [], 'win_ratio': []}
    for ship_type in df['ship_type'].unique():
        battles = int(df.loc[df['ship_type'] ==
                      ship_type, 'pvp_battles'].sum())
        wins = int(df.loc[df['ship_type'] == ship_type, 'wins'].sum())
        wr = round(wins/battles if battles > 0 else 0, 2)
        data["pvp_battles"].append(battles)
        data["ship_type"].append(ship_type)
        data["wins"].append(wins)
        data["win_ratio"].append(wr)

    df = pd.DataFrame(data).sort_values(by='pvp_battles', ascending=False)

    return df.to_dict(orient='records')


def fetch_randoms_data(player_id: str) -> list:
    """
    Fetches and processes random battle data for a given player.

    This function updates the snapshot data for a player and then processes it to extract the top 20 ships
    based on the number of PvP battles. The processed data includes the ship name, number of PvP battles,
    win ratio, and wins for each ship.

    Args:
        player_id (str): The ID of the player whose random battle data needs to be fetched.

    Returns:
        list: A list of dictionaries containing the processed random battle data for the top 20 ships.
              Each dictionary contains the following keys:
              - 'pvp_battles': The total number of PvP battles for the ship.
              - 'ship_name': The name of the ship.
              - 'win_ratio': The win ratio for the ship, rounded to two decimal places.
              - 'wins': The total number of wins for the ship.
    """
    update_snapshot_data(player_id)
    player = Player.objects.get(player_id=player_id)

    df = pd.DataFrame(player.battles_json)
    df = df.filter(['pvp_battles', 'ship_name', 'win_ratio', 'wins'])
    df = df.sort_values(by='pvp_battles', ascending=False).head(20)
    return df.to_dict(orient='records')


# ----------------------------------------
def update_clan_data(clan_id: str) -> None:

    # return if no clan_id is provided
    if not clan_id:
        return
    data = _fetch_clan_data(clan_id)

    '''
    {'members_count': 46, 
    'description': "So, Have fun!", 
      'tag': '-N-', 
      'leader_name': 'Gerphan', 
      'members_ids': [1004174517, 1005576737, 1019829113, 1026634454, 1028456857, 1034755841, 1038946881, 1039126105, 1041334455, 1045441034], 
      'clan_id': 1000055908, 
      'leader_id': 1004174517, 
      'name': 'Naumachia'
      }
    '''
    clan = Clan.objects.get(clan_id=clan_id)
    clan.members_count = clan_data.get('members_count', 0)
    clan.tag = clan_data.get('tag', '')
    clan.name = clan_data.get('name', '')
    clan.save()
    logging.info(
        f"Updated clan data: {clan.name} [{clan.tag}]: {clan.members_count} members")
    # member_ids = _fetch_clan_members(clan_id)


def update_player_data(player: Player) -> Player:
    player_data = _fetch_player_personal_data(player.player_id)
    breakpoint()
    # Check if the player's profile is hidden
    if player_data.get('hidden_profile'):
        player.is_hidden = True

    # Map basic fields
    player.name = player_data.get("nickname", "")
    player.player_id = player_data.get("account_id", player.player_id)
    player.creation_date = datetime.fromtimestamp(
        player_data.get("created_at", 0), tz=timezone.utc)
    player.last_battle_date = datetime.fromtimestamp(
        player_data.get("last_battle_time", 0), tz=timezone.utc).date()

    # Calculate days since last battle
    if player.last_battle_date:
        player.days_since_last_battle = (datetime.now(
            timezone.utc).date() - player.last_battle_date).days

    # If the player is not hidden, map additional statistics
    if not player.is_hidden:
        player.battles_updated_at = datetime.fromtimestamp(
            player_data.get("stats_updated_at", 0), tz=timezone.utc)
        stats = player_data.get("statistics", {})
        player.total_battles = stats.get("battles", 0)
        pvp_stats = stats.get("pvp", {})
        player.pvp_battles = pvp_stats.get("battles", 0)
        player.pvp_wins = pvp_stats.get("wins", 0)
        player.pvp_losses = pvp_stats.get("losses", 0)

        # Calculate PvP ratios
        player.pvp_ratio = round(
            (player.pvp_wins / player.pvp_battles * 100), 2) if player.pvp_battles else 0
        player.pvp_survival_rate = round((pvp_stats.get(
            "survived_battles", 0) / player.pvp_battles) * 100, 2) if player.pvp_battles else 0
        player.wins_survival_rate = round((pvp_stats.get(
            "survived_wins", 0) / player.pvp_wins) * 100, 2) if player.pvp_wins else 0

    # Handle clan association
    clan_id = player_data.get("clan_id")

    # Save the player instance
    player.save()
    return player


def fetch_clan_data():
    pass
