from .utils.api import get_player_by_name
from django.shortcuts import render
import matplotlib.ticker as ticker
import pandas as pd
import seaborn as sns
from .utils.data import get_encoded_fig, prepare_battles_data


def player(request, name="lil_boots"):
    player = get_player_by_name(name)

    custom_params = {
        "figure.figsize": (5, 3),
        "axes.spines.right": False,
        "axes.spines.top": False,
        "axes.spines.left": False,
        "axes.spines.bottom": False,
        "axes.xmargin": 0,
        "axes.ymargin": 0,
    }
    sns.set_theme(style="white", rc=custom_params)

    # build a bar plot of recent games
    player_df = pd.DataFrame(data=player.recent_games)
    bar = sns.barplot(data=player_df, x="dates",
                      y="games_played", palette="deep")
    bar.set(xlabel=None)
    bar.set(ylabel=None)
    bar.set(xticklabels=[])
    bar.yaxis.set_major_locator(ticker.MultipleLocator(5))
    recent_encoded = get_encoded_fig(bar)

    # build a bar plot of ship data by # battles
    ship_df = prepare_battles_data(player.player_id)
    g = sns.barplot(data=ship_df.head(10), x="ship_name",
                    y="pvp_battles", palette="deep", orient="h")
    ship_encoded = get_encoded_fig(g)

    return render(
        request, 'player.html',  {"context":
                                  {
                                      "player": player,
                                      "recent_plot": recent_encoded,
                                      "ship_plot": ship_encoded
                                  }})
