import os
import sys
import django
from django.db.models import Count

sys.path.append(os.path.abspath('.'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'battlestats.settings')
django.setup()

if True:
    from warships.models import Ship

breakpoint()
