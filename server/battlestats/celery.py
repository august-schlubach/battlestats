from __future__ import absolute_import, unicode_literals

import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "battlestats.settings")

app = Celery("battlestats")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.conf.broker_connection_retry_on_startup = True
app.conf.broker_url = 'amqp://guest:guest@rabbitmq:5672//'  # Use RabbitMQ
app.conf.result_backend = 'rpc://'  # Use RPC backend for results
app.autodiscover_tasks()
