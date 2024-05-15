from warships.models import Player, Snapshot, Clan
from warships.utils.api.ships import (
    _fetch_ship_stats_for_player,
    _fetch_ship_info
)
from warships.utils.api.players import (
    _fetch_player_battle_data,
    _fetch_player_id_by_name,
    _fetch_snapshot_data
)
from warships.utils.api.clans import (
    _fetch_clan_data,
    _fetch_clan_member_ids,
    _fetch_player_data_from_list
)
import pandas as pd
import datetime
import logging

logging.basicConfig(level=logging.INFO)


def get_player_by_name(player_name: str) -> Player:
    player, created = Player.objects.get_or_create(name__iexact=player_name)
    if created:
        player.player_id = _fetch_player_id_by_name(player_name)
        player = populate_new_player(player)

    if player.last_fetch is None or (datetime.datetime.now() - player.last_fetch).days > 1:
        logging.info(f'old timestamp: fetching new data for {player.name}')
        player.recent_games = _fetch_ship_stats_for_player(player.player_id)

    player.last_fetch = datetime.datetime.now()
    player.save()

    return player


def populate_clan(clan_id: str) -> None:
    clan = Clan.objects.get(clan_id=clan_id)
    if clan.last_fetch is None or (datetime.datetime.now() - clan.last_fetch).days > 1:
        clan_members = _fetch_clan_member_ids(str(clan_id))
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

        clan.last_fetch = datetime.datetime.now()
        clan.save()


def populate_new_player(player: Player,
                        player_data: dict = None,
                        clan_id: int = None) -> Player:
    # player objects come in with a player_id but no other data

    # make sure we have the player data, passed in or fetched
    if player_data is None:
        player_data = _fetch_player_battle_data(player.player_id)
        player.last_fetch = datetime.datetime.now()

    if player_data['hidden_profile'] is True:
        player.is_hidden = True

    # -------
    # populate the player object with data from the api response

    ''' Response Format
    "account_id":
    "last_battle_time":
    "nickname":
    "stats_updated_at":
    "updated_at":
    "statistics":
        "distance":
        "battles":
        "pvp":
            "battles":
            "draws":
            "frags":
            "losses":
            "survived_battles":
            "survived_wins":
            "wins":
            "main_battery":
                "max_frags_battle":
                "frags":
                "hits":
                "max_frags_ship_id":
                "shots":
            },
            "ramming":
                "max_frags_battle":
                "frags":
                "max_frags_ship_id":
            },
            "torpedoes":
                "max_frags_battle":
                "frags":
                "hits":
                "max_frags_ship_id":
                "shots":
            },
            "second_battery":
                "max_frags_battle":
                "frags":
                "hits":
                "max_frags_ship_id":
                "shots":
            },
        }
    }
    '''
    # populate fields accessible to both hidden and open accounts
    player.name = player_data["nickname"]
    player.creation_date = datetime.datetime.fromtimestamp(
        int(player_data["created_at"]))

    player.last_battle_date = datetime.datetime.fromtimestamp(
        int(player_data["last_battle_time"])).date()

    # calculate the time since the last battle
    if player.last_battle_date is not None:
        player.days_since_last_battle = int(
            (datetime.datetime.now().date() - player.last_battle_date).days)

    if player.is_hidden is not True:
        player.stats_updated_at = datetime.datetime.fromtimestamp(
            int(player_data["stats_updated_at"]))
        stats = player_data["statistics"]
        player.total_battles = stats["battles"]
        player.pvp_battles = int(stats["pvp"]["battles"])
        player.pvp_wins = int(stats["pvp"]["wins"])
        player.pvp_losses = int(stats["pvp"]["losses"])

        # calculate win/loss ratio
        if player.pvp_battles == 0:
            player.pvp_ratio = 0
        elif player.pvp_battles is not None and player.pvp_wins is not None:
            player.pvp_ratio = round(
                (int(player.pvp_wins) / player.pvp_battles * 100), 2)

        # calculate survival rates
        if player.pvp_battles == 0:
            player.pvp_survival_rate = 0
        elif stats["pvp"]["survived_battles"] is not None and player.pvp_battles is not None:
            player.pvp_survival_rate = round(
                (stats["pvp"]["survived_battles"] / player.pvp_battles) * 100, 2)

        player.recent_games = _fetch_ship_stats_for_player(player.player_id)

    # ------
    # fetch naval clan data
    if clan_id is not None:
        player.clan = Clan.objects.get(clan_id=clan_id)
    else:
        clan_data = _fetch_clan_data(str(player.player_id))
        ''' Response Format
            {
                "clan": {
                    "members_count":
                    "created_at":
                    "clan_id":
                    "tag":
                    "name":
                },
                "account_id":
                "joined_at":
                "clan_id":
                "role":
                "account_name":
            }
        '''
        if clan_data is not None:
            clan, created = Clan.objects.get_or_create(
                clan_id=clan_data['clan']['clan_id'],
                name=clan_data['clan']['name'],
                tag=clan_data['clan']['tag'],
                members_count=clan_data['clan']['members_count'])
            clan.save()
            player.clan = clan

    player.save()
    return player


def fetch_clan_data(clan_id: str) -> pd.DataFrame:
    players = Player.objects.filter(clan__clan_id=clan_id)
    prepared_data = {}
    attribs = ['name', 'pvp_battles', 'pvp_ratio', 'days_since_last_battle']
    for attrib in attribs:
        prepared_data[attrib] = []

    for player in players:
        prepared_data["name"].append(player.name)
        prepared_data["pvp_battles"].append(player.pvp_battles)
        prepared_data["pvp_ratio"].append(player.pvp_ratio)
        prepared_data["days_since_last_battle"].append(
            player.days_since_last_battle)

    return pd.DataFrame(prepared_data)


def update_snapshot_data(player: Player) -> None:
    # dont update if we've already updated today
    try:
        last_snapshot = Snapshot.objects.filter(player=player).latest('date')
        last_fetch_date = last_snapshot.last_fetch
    except Snapshot.DoesNotExist:
        last_fetch_date = datetime.datetime.now() - datetime.timedelta(days=50)
    if (datetime.datetime.now() - last_fetch_date).days < 1:
        return

    dates = []
    for i in range(29):
        date = ((datetime.datetime.now() - datetime.timedelta(28)) +
                datetime.timedelta(days=i)).date().strftime("%Y%m%d")

        dates.append(date)

    for n in range(0, 4):
        week = []
        # this gives us our 28 day distribution in 4 parts of 7 days
        for x in range(1, 8):
            day = x + (n * 7)
            week.append(dates[day])
        week_str = ','.join(week)
        stats = _fetch_snapshot_data(player.player_id, week_str)

        if stats is not None:
            for date in stats:
                outputDate = datetime.datetime.strptime(
                    date, '%Y%m%d').date().strftime('%Y-%m-%d')
                snapshot, created = Snapshot.objects.get_or_create(
                    player=player, date=outputDate)
                snapshot.battles = stats[date]['battles']
                snapshot.wins = stats[date]['wins']
                snapshot.survived_battles = stats[date]['survived_battles']
                snapshot.battle_type = stats[date]['battle_type']
                snapshot.date = outputDate
                snapshot.last_fetch = datetime.datetime.now()
                snapshot.save()

    # update the interval battles and wins
    start_date = datetime.datetime.now() - datetime.timedelta(28)
    snapshots = Snapshot.objects.filter(
        player=player, date__gte=start_date).order_by('date')

    for i, snap in enumerate(snapshots):
        if i == 0:
            continue
        else:
            snap.interval_battles = int(snap.battles - snapshots[i-1].battles)
            snap.interval_wins = int(snap.wins - snapshots[i-1].wins)

        snap.save()


def fetch_snapshot_data(player_id: str) -> pd.DataFrame:
    player = Player.objects.get(player_id=player_id)
    update_snapshot_data(player)

    # iterate through 28 days of snapshots and prepare df for display
    data = {'date': [], 'battles': [], 'wins': []}
    for i in range(29):
        date = ((datetime.datetime.now() - datetime.timedelta(28)) +
                datetime.timedelta(days=i)).date().strftime("%Y-%m-%d")
        data["date"].append(date)

        if Snapshot.objects.filter(player=player, date=date).exists():
            interval_battles = 0
            wins = 0
            snap = Snapshot.objects.get(player=player, date=date)
            try:
                interval_battles = snap.interval_battles
                wins = snap.interval_wins
            except TypeError:
                logging.info(f'Snapshot error: {player.name} - {date}')
                snap.interval_battles = 0
                snap.wins = 0
                snap.save()

            data["battles"].append(interval_battles)
            data["wins"].append(wins)
        else:
            data["battles"].append(0)
            data["wins"].append(0)

    df = pd.DataFrame(data, columns=["date", "battles", "wins"])

    return df


def fetch_battle_data(player_id: str) -> pd.DataFrame:
    player = Player.objects.get(player_id=player_id)
    ship_data = {}
    prepared_data = {}
    attribs = ['ship_name', 'ship_tier', 'all_battles', 'distance', 'wins',
               'losses', 'ship_type', 'pve_battles', 'pvp_battles',
               'win_ratio', 'kdr']
    for attrib in attribs:

        prepared_data[attrib] = []

    if player.recent_games is None:
        ship_data = _fetch_ship_stats_for_player(player_id)
        player.recent_games = ship_data
        player.save()
    else:
        ship_data = player.recent_games

    # flatten data and filter into dataframe
    for ship in ship_data['data'][player_id]:
        ship_model = _fetch_ship_info(ship['ship_id'])

        if ship_model is not None:
            if ship_model.name is not None and ship_model.name != "":
                prepared_data['ship_name'].append(ship_model.name)
                prepared_data['ship_tier'].append(ship_model.tier)
                prepared_data['all_battles'].append(ship['battles'])
                prepared_data['distance'].append(ship['distance'])
                prepared_data['wins'].append(ship['pvp']['wins'])
                prepared_data['losses'].append(ship['pvp']['losses'])
                prepared_data['ship_type'].append(ship_model.ship_type)
                prepared_data['pve_battles'].append(int(ship['battles']) -
                                                    (ship['pvp']['wins'] + ship['pvp']['losses']))
                prepared_data['pvp_battles'].append(
                    ship['pvp']['battles'])

                if int(ship['pvp']['battles']) == 0:
                    prepared_data['win_ratio'].append(0)
                    prepared_data['kdr'].append(0)
                else:
                    prepared_data['win_ratio'].append(
                        round(int(ship['pvp']['wins']) / int(ship['pvp']['battles']), 2))
                    prepared_data['kdr'].append(
                        round(int(ship['pvp']['frags']) / int(ship['pvp']['battles']), 2))

    df = pd.DataFrame(prepared_data).sort_values(
        by="pvp_battles", ascending=False)

    return df
