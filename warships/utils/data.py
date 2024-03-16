from warships.models import Player, RecentLookup, Clan
from warships.utils.api.ships import (
    _fetch_ship_stats_for_player,
    _fetch_ship_info
)
from warships.utils.api.players import (
    _fetch_player_battle_data,
    _fetch_player_id_by_name
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

    if player_data['hidden_profile'] is True:
        player.is_hidden = True

    # -------
    # populate the player object with data from the api response

    '''
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
    attribs = ['name', 'pvp_battles', 'pvp_ratio',]
    for attrib in attribs:
        prepared_data[attrib] = []

    for player in players:
        prepared_data["name"].append(player.name)
        prepared_data["pvp_battles"].append(player.pvp_battles)
        prepared_data["pvp_ratio"].append(player.pvp_ratio)

    return pd.DataFrame(prepared_data)


def fetch_battle_data(player_id: str) -> pd.DataFrame:

    # fetch battle data for a given player and prepare it for display
    player = Player.objects.get(player_id=player_id)

    # log player lookup
    # lookup, created = RecentLookup.objects.get_or_create(player=player)
    # lookup.last_updated = pd.Timestamp.now()
    # lookup.save()

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
