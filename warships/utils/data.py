from io import BytesIO
from warships.models import Ship
from warships.utils.api import get_ship_by_id
import base64
import json
import os
import pandas as pd


def get_encoded_fig(plot) -> str:
    # perform an in-memory save of a plot and prepare it for display as
    # inline base64
    fig_file = BytesIO()
    plot.get_figure().savefig(fig_file, format='png')
    return base64.b64encode(fig_file.getvalue()).decode('utf-8')


def prepare_battles_data(player_id: str) -> pd.DataFrame:
    prepared_data = {}

    attribs = ['ship_name', 'all_battles', 'distance', 'wins',
               'losses', 'ship_type', 'pve_battles', 'pvp_battles']
    for attrib in attribs:
        prepared_data[attrib] = []

    # prepare the ship data for display
    # TODO: get this from API

    # add sample data to path
    module_dir = os.path.dirname(__file__)
    parent_dir = os.path.abspath(os.path.join(module_dir, os.pardir))
    file_path = os.path.join(parent_dir, 'data', 'all_battles_by_ship.json')
    with open(file_path, 'r') as f:
        ship_data = json.load(f)

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

    df = pd.DataFrame(prepared_data).sort_values(
        by="all_battles", ascending=False)

    plot_df = df.filter(
        ['ship_name', 'pvp_battles'], axis=1)

    return plot_df
