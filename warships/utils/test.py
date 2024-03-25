# import Django and load User model

import sys
import os
import django

# beau 1003892077
# lil_boots 1000057393

sys.path.append("/home/django/battlestats")
sys.path.append("/home/django/battlestats/warships/utils")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "battlestats.settings")
django.setup()

# foil autopep8; will move these to the top otherwise
if True:
    from data import fetch_snapshot_data, get_player_by_name



print(get_player_by_name('lil_boots'))
