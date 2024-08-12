from __future__ import absolute_import, unicode_literals

import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "battlestats.settings")

app = Celery("battlestats")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.conf.broker_connection_retry_on_startup = True
app.conf.broker_url = 'redis://localhost:6380/0'
app.conf.result_backend = 'redis://localhost:6380/0'
app.autodiscover_tasks()
