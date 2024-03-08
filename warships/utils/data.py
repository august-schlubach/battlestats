from warships.utils.api import get_ship_by_id
import pandas as pd
from warships.models import Player, RecentLookup
from warships.utils.api import get_ship_stats


def fetch_battle_data(player_id: str) -> pd.DataFrame:
    # fetch battle data for a given player and prepare it for display
    player = Player.objects.get(player_id=player_id)

    # log player lookup
    lookup, created = RecentLookup.objects.get_or_create(player=player)
    lookup.last_updated = pd.Timestamp.now()
    lookup.save()

    ship_data = {}
    prepared_data = {}
    attribs = ['ship_name', 'all_battles', 'distance', 'wins',
               'losses', 'ship_type', 'pve_battles', 'pvp_battles',
               'win_ratio', 'kdr']
    for attrib in attribs:
        prepared_data[attrib] = []

    if player.recent_games is None:
        ship_data = get_ship_stats(player_id)
        player.recent_games = ship_data
        player.save()
    else:
        ship_data = player.recent_games

    # flatten data and filter into dataframe
    for ship in ship_data['data'][str(player_id)]:
        ship_model = get_ship_by_id(ship['ship_id'])

        if ship_model is not None:
            if ship_model.name is not None and ship_model.name != "":
                prepared_data['ship_name'].append(ship_model.name)
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
