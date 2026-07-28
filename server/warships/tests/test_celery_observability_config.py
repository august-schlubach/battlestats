"""Guards the Celery settings that Flower's task view depends on.

Flower lists workers off the control channel, so a worker that emits NO task
events still *looks* healthy there — while its task history silently freezes at
whatever it last saw. Flower runs `--persistent=True`, so it then keeps serving
those frozen rows as if they were current. That pairing hid a month-long
monitoring outage (2026-07-27); this keeps the emitting side switched on and the
kill switch honest.

Runbook: agents/runbooks/runbook-flower-observability-2026-04-02.md
"""
import importlib
import os

from django.test import SimpleTestCase

from battlestats.celery import app


class TestCeleryTaskEventsConfig(SimpleTestCase):
    def test_task_events_are_enabled_on_the_celery_app(self):
        # The app config — not just the Django setting — is what the worker
        # actually reads, so assert the value that reaches Celery.
        self.assertTrue(
            app.conf.worker_send_task_events,
            'Workers must emit task events or Flower reports stale history as live.',
        )

    def test_setting_is_env_driven_and_defaults_on(self):
        # Events cost one small broker message per task transition; the switch
        # exists so they can be shed under broker pressure without a code change
        # — but the default must stay ON, because the outage it masks is silent.
        from battlestats import settings as settings_module

        original = os.environ.get('CELERY_WORKER_SEND_TASK_EVENTS')
        try:
            os.environ['CELERY_WORKER_SEND_TASK_EVENTS'] = '0'
            reloaded = importlib.reload(settings_module)
            self.assertFalse(reloaded.CELERY_WORKER_SEND_TASK_EVENTS)

            os.environ.pop('CELERY_WORKER_SEND_TASK_EVENTS')
            reloaded = importlib.reload(settings_module)
            self.assertTrue(
                reloaded.CELERY_WORKER_SEND_TASK_EVENTS,
                'Task events must default ON — the outage they mask is invisible.',
            )
        finally:
            if original is None:
                os.environ.pop('CELERY_WORKER_SEND_TASK_EVENTS', None)
            else:
                os.environ['CELERY_WORKER_SEND_TASK_EVENTS'] = original
            importlib.reload(settings_module)
