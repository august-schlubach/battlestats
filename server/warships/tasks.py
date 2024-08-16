from __future__ import absolute_import, unicode_literals
from battlestats.celery import app


@app.task
def hello_world():
    print('Hello World!')
