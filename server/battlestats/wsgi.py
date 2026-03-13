import os
from django.core.wsgi import get_wsgi_application
from battlestats.env import load_env_file


load_env_file(os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'battlestats.settings')

application = get_wsgi_application()
