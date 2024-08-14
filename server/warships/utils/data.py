from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from warships.models import Player, Snapshot, Clan
from warships.utils.api.ships import _fetch_ship_stats_for_player, _fetch_ship_info
from warships.utils.api.players import _fetch_player_battle_data, _fetch_player_id_by_name, _fetch_snapshot_data
from warships.utils.api.clans import _fetch_clan_data, _fetch_clan_member_ids, _fetch_player_data_from_list
import pandas as pd
import logging

logging.basicConfig(level=logging.INFO)


def get_player_by_name(player_name: str) -> Player:
    player, created = Player.objects.get_or_create(name__iexact=player_name)
    if created:
        player.player_id = _fetch_player_id_by_name(player_name)
        player = populate_new_player(player)

    if player.last_fetch is None or (datetime.now() - player.last_fetch).days > 1:
        logging.info(f'old timestamp: fetching new data for {player.name}')
        player.recent_games = _fetch_ship_stats_for_player(player.player_id)

    player.last_fetch = datetime.now()
    player.save()

    return player


def populate_clan(clan_id: str) -> None:
    clan = Clan.objects.get(clan_id=clan_id)
    if clan.last_fetch is None or (datetime.now() - clan.last_fetch).days > 1:
        clan_members = _fetch_clan_member_ids(clan_id)
        local_members = Player.objects.filter(clan__clan_id=clan_id).count()
        if local_members < len(clan_members):
            logging.info(
                'Clan contains more members than database: fetching new data')
            player_data = _fetch_player_data_from_list(clan_members)
            for p in player_data:
                player, created = Player.objects.get_or_create(
                    player_id=int(p))
                if created:
                    player.player_id = p
                    player = populate_new_player(
                        player, player_data[p], clan_id)
        else:
            logging.info('Clan data updated: no changes needed')

        clan.last_fetch = datetime.now()
        clan.save()


def populate_new_player(player: Player, player_data: Optional[Dict[str, Any]] = None, clan_id: Optional[int] = None) -> Player:
    if player_data is None:
        player_data = _fetch_player_battle_data(player.player_id)
        player.last_fetch = datetime.now()

    if player_data.get('hidden_profile'):
        player.is_hidden = True

    player.name = player_data["nickname"]
    player.creation_date = datetime.fromtimestamp(
        int(player_data["created_at"]))
    player.last_battle_date = datetime.fromtimestamp(
        int(player_data["last_battle_time"])).date()

    if player.last_battle_date:
        player.days_since_last_battle = (
            datetime.now().date() - player.last_battle_date).days

    if not player.is_hidden:
        player.stats_updated_at = datetime.fromtimestamp(
            int(player_data["stats_updated_at"]))
        stats = player_data["statistics"]
        player.total_battles = stats["battles"]
        player.pvp_battles = stats["pvp"]["battles"]
        player.pvp_wins = stats["pvp"]["wins"]
        player.pvp_losses = stats["pvp"]["losses"]

        player.pvp_ratio = round(
            (player.pvp_wins / player.pvp_battles * 100), 2) if player.pvp_battles else 0
        player.pvp_survival_rate = round(
            (stats["pvp"]["survived_battles"] / player.pvp_battles) * 100, 2) if player.pvp_battles else 0

        player.recent_games = _fetch_ship_stats_for_player(player.player_id)

    if clan_id:
        player.clan = Clan.objects.get(clan_id=clan_id)
    else:
        clan_data = _fetch_clan_data(str(player.player_id))
        if clan_data:
            clan, created = Clan.objects.get_or_create(
                clan_id=clan_data['clan']['clan_id'],
                defaults={
                    'name': clan_data['clan']['name'],
                    'tag': clan_data['clan']['tag'],
                    'members_count': clan_data['clan']['members_count']
                }
            )
            player.clan = clan

    player.save()
    return player


def fetch_clan_data(clan_id: str) -> pd.DataFrame:
    players = Player.objects.filter(clan__clan_id=clan_id)
    prepared_data = {attrib: [] for attrib in [
        'name', 'pvp_battles', 'pvp_ratio', 'days_since_last_battle']}

    for player in players:
        prepared_data["name"].append(player.name)
        prepared_data["pvp_battles"].append(player.pvp_battles)
        prepared_data["pvp_ratio"].append(player.pvp_ratio)
        prepared_data["days_since_last_battle"].append(
            player.days_since_last_battle)

    return pd.DataFrame(prepared_data)


def update_snapshot_data(player_id: int) -> None:
    player = Player.objects.get(player_id=player_id)

    try:
        last_snapshot = Snapshot.objects.filter(player=player).latest('date')
        last_fetch_date = last_snapshot.last_fetch
    except Snapshot.DoesNotExist:
        last_fetch_date = datetime.now() - timedelta(days=50)

    if (datetime.now() - last_fetch_date).days < 1:
        return

    today = datetime.now()
    start_date = today - timedelta(days=28)
    dates = [(start_date + timedelta(days=i)).strftime("%Y%m%d")
             for i in range(29)]

    for n in range(4):
        week = [dates[x + n * 7] for x in range(1, 8)]
        week_str = ','.join(week)
        stats = _fetch_snapshot_data(player.player_id, week_str)

        if stats:
            for date_str, stat in stats.items():
                output_date = datetime.strptime(
                    date_str, '%Y%m%d').strftime('%Y-%m-%d')
                snapshot, created = Snapshot.objects.get_or_create(
                    player=player, date=output_date)
                snapshot.battles = stat['battles']
                snapshot.wins = stat['wins']
                snapshot.survived_battles = stat['survived_battles']
                snapshot.battle_type = stat['battle_type']
                snapshot.last_fetch = today
                snapshot.save()

    snapshots = Snapshot.objects.filter(
        player=player, date__gte=start_date).order_by('date')

    for i in range(1, len(snapshots)):
        snapshots[i].interval_battles = snapshots[i].battles - \
            snapshots[i-1].battles
        snapshots[i].interval_wins = snapshots[i].wins - snapshots[i-1].wins
        snapshots[i].save()


def fetch_snapshot_data(player_id: str) -> pd.DataFrame:
    player = Player.objects.get(player_id=player_id)
    update_snapshot_data(player_id)

    data = {'date': [], 'battles': [], 'wins': []}
    for i in range(29):
        date = (datetime.now() - timedelta(28) +
                timedelta(days=i)).date().strftime("%Y-%m-%d")
        data["date"].append(date)

        snap = Snapshot.objects.filter(player=player, date=date).first()
        if snap:
            data["battles"].append(snap.interval_battles or 0)
            data["wins"].append(snap.interval_wins or 0)
        else:
            data["battles"].append(0)
            data["wins"].append(0)

    return pd.DataFrame(data, columns=["date", "battles", "wins"])


def fetch_battle_data(player_id: str) -> pd.DataFrame:
    player = Player.objects.get(player_id=player_id)

    if not player.recent_games:
        player.recent_games = _fetch_ship_stats_for_player(player_id)
        player.save()
    else:
        try:
            ship_id = player.recent_games[0]['ship_id']
        except IndexError:
            player.recent_games = {}
            player.save()

    ship_data = player.recent_games

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
