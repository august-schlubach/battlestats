"""Root pytest configuration.

Sets test-only environment defaults BEFORE Django settings are imported. This
file sits at the pytest rootdir so it is imported during startup, ahead of
pytest-django configuring settings — which is the whole point, since
`settings.py` reads these at import time.

Every value uses `setdefault`, so an explicit environment always wins: CI sets
these itself, and anyone who genuinely wants to exercise a real broker can.

## Why the Celery broker default matters

Without it, `settings.py` falls back to `amqp://localhost:5672`. No RabbitMQ
runs during tests, so every task-dispatching test pays a full broker
connection-retry timeout. That is not a small tax:

    850 tests, sqlite + --nomigrations, no override   1020s  (17m)
    850 tests, sqlite + --nomigrations, memory://        5.1s

A 200x difference, and none of it surfaces as a failure — the suite passes
either way, just glacially. CI already set `CELERY_BROKER_URL=memory://` in its
workflow (with a comment recording that its absence "inflated the test step to
~20 min"), but the local harness documented in CLAUDE.md did not, so every
local full-suite run paid the toll. Defaulting it here makes the fast path the
one you get by not thinking about it.

`run_release_gate.sh` still exports these explicitly. That is deliberate
belt-and-braces: it documents intent at the call site and keeps the gate fast
if this file is ever changed.

This does NOT default the database. sqlite needs `--nomigrations` alongside it
(migrations error out on sqlite), and a silent DB default would turn that into
a confusing 805-error run rather than an obvious "you forgot the flag".
"""

import os

# No RabbitMQ in tests — see the module docstring for the 200x.
os.environ.setdefault("CELERY_BROKER_URL", "memory://")
os.environ.setdefault("CELERY_RESULT_BACKEND", "cache+memory://")

# NOTE: DJANGO_SECRET_KEY canNOT be defaulted here. pytest-django imports
# settings before this module runs, so a setdefault for anything settings.py
# reads at IMPORT time arrives too late — verified empirically (174 failures,
# "SECRET_KEY must not be empty"). The Celery values above work precisely
# because the app reads them LAZILY, after conftest import. Pass the key on the
# command line instead; CLAUDE.md carries the harness invocation.
