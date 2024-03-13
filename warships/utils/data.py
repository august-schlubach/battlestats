from warships.models import Player, RecentLookup
from warships.utils.api.ships import (
    _fetch_ship_stats_for_player,
    _fetch_ship_info
)
from warships.utils.api.players import (
    _fetch_player_battle_data,
    _fetch_player_id_by_name
)
from warships.utils.api.clans import _fetch_clan_data
import pandas as pd
import datetime


def get_player_by_name(player_name: str) -> Player:
    player, created = Player.objects.get_or_create(name__iexact=player_name)
    if created:
        player.player_id = _fetch_player_id_by_name(player_name)
        player = populate_new_player(player)
    return player


def populate_new_player(player: Player, player_data: dict = None) -> Player:
    # player objects come in with a player_id but no other data

    # make sure we have the player data, passed in or fetched
    if player_data is None:
        player_data = _fetch_player_battle_data(player.player_id)

    # -------
    # populate the player object with data from the api response
    player.name = player_data[str(player.player_id)]["nickname"]

    try:
        player.total_battles = player_data[str(
            player.player_id)]["statistics"]["battles"]
        player.pvp_battles = int(player_data[str(
            player.player_id)]["statistics"]["pvp"]["battles"])
        player.pvp_wins = int(
            player_data[str(player.player_id)]["statistics"]["pvp"]["wins"])
        player.pvp_losses = int(
            player_data[str(player.player_id)]["statistics"]["pvp"]["losses"])
        player.last_battle_date = datetime.datetime.fromtimestamp(
            int(player_data[str(player.player_id)]["last_battle_time"])).date()
    except TypeError:
        print(f'Error in response for player_id: {player.player_id}')
        return player

    # calculate win/loss ratio
    if player.pvp_battles == 0:
        player.pvp_ratio = 0
    else:
        player.pvp_ratio = round(
            (int(player.pvp_wins) / player.pvp_battles * 100), 2)

    player.creation_date = datetime.datetime.fromtimestamp(
        int(player_data[str(player.player_id)]["created_at"]))

    # calculate the time since the last battle
    player.days_since_last_battle = int(
        (datetime.datetime.now().date() - player.last_battle_date).days)

    # calculate survival rates
    if player.pvp_battles == 0:
        player.pvp_survival_rate = 0
    else:
        player.pvp_survival_rate = round((player_data[str(
            player.player_id)]["statistics"]["pvp"]["survived_battles"] / player.pvp_battles) * 100, 2)

    # ------
    # fetch naval clan data

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
    #     if created:
    #         # TODO: make this an async call
    #         _fetch_clan_members(str(clan.clan_id))
    #     return clan
    # else:
    #     return None

    player.recent_games = _fetch_ship_stats_for_player(player.player_id)
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
    lookup, created = RecentLookup.objects.get_or_create(player=player)
    lookup.last_updated = pd.Timestamp.now()
    lookup.save()

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
