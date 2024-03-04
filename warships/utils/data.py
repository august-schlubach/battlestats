from warships.utils.api import get_ship_by_id
import pandas as pd
from ..models import Player, Ship
from .api import get_ship_stats


def fetch_battle_data(player_id: str, battle_type: str = "all") -> pd.DataFrame:
    # fetch battle data for a given player and prepare it for display
    prepared_data = {}
    ship_data = {}

    attribs = ['ship_name', 'all_battles', 'distance', 'wins',
               'losses', 'ship_type', 'pve_battles', 'pvp_battles']
    for attrib in attribs:
        prepared_data[attrib] = []

    # prepare the ship data for display
    # TODO: get this from API

    player = Player.objects.get(player_id=player_id)
    if player.recent_games is None:
        ship_data = get_ship_stats(player_id)
        player.recent_games = ship_data
        player.save()
    else:
        ship_data = player.recent_games

    # flatten data and filter into dataframe
    for ship in ship_data['data'][str(player_id)]:
        ship_model = get_ship_by_id(ship['ship_id'])
        prepared_data['ship_name'].append(ship_model.name)
        prepared_data['all_battles'].append(ship['battles'])
        prepared_data['distance'].append(ship['distance'])
        prepared_data['wins'].append(ship['pvp']['wins'])
        prepared_data['losses'].append(ship['pvp']['losses'])
        prepared_data['ship_type'].append(ship_model.ship_type)
        prepared_data['pve_battles'].append(int(ship['battles']) -
                                            (ship['pvp']['wins'] + ship['pvp']['losses']))
        prepared_data['pvp_battles'].append(
            ship['pvp']['wins'] + ship['pvp']['losses'])

    sort_order = f'{battle_type}_battles'

    df = pd.DataFrame(prepared_data).sort_values(
        by=sort_order, ascending=False)

    plot_df = df.filter(
        ['ship_name', 'all_battles', 'pvp_battles', 'pve_battles', 'ship_type'], axis=1).head(25)

    breakpoint()
    return plot_df
