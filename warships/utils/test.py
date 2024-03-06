# import Django and load User model

import sys
import os
import django

sys.path.append("/home/x/Documents/battlestats")
sys.path.append("/home/x/Documents/battlestats/warships/utils")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "battlestats.settings")
django.setup()

# foil autopep8; will move these to the top otherwise
if True:
    from data import fetch_battle_data

df = fetch_battle_data("1003892077")
breakpoint()
