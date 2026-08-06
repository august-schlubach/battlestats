"""Durable state for the feedback notifier.

Two tiny files under /opt/battlestats-server/shared/state/:

  feedback-notify-watermark   JSON array of Feedback ids already mailed
  feedback-credit-warning     ISO date of the last low-credit warning

The watermark holds a SET, not a maximum. Postgres assigns a sequence value at
INSERT but a row only becomes visible at COMMIT, so two overlapping submissions
can commit out of order; a max-id watermark would step over the slower one
permanently and that row would never be mailed. Proven by experiment against
Postgres 15, see the spec's "Claims verified" section.

Reads are forgiving by design: a missing or corrupt file yields empty rather
than raising. The failure mode of forgetting is one duplicate email; the failure
mode of raising is a notifier that stays wedged and silent, which is the outcome
this whole feature exists to prevent.
"""
from __future__ import annotations

import json
import os
import tempfile
from datetime import date
from pathlib import Path


def _atomic_write(path: str, text: str) -> None:
    """Write via a temp file plus os.replace so a crash never leaves a partial
    state file that would read as corrupt on the next run."""
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(p.parent), prefix='.tmp-')
    try:
        with os.fdopen(fd, 'w') as fh:
            fh.write(text)
        os.replace(tmp, path)
    except Exception:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def load_notified_ids(path: str) -> set[int]:
    try:
        raw = Path(path).read_text()
    except (FileNotFoundError, NotADirectoryError):
        return set()
    try:
        return {int(x) for x in json.loads(raw)}
    except (ValueError, TypeError):
        return set()


def save_notified_ids(path: str, ids: set[int]) -> None:
    _atomic_write(path, json.dumps(sorted(int(i) for i in ids)))


def load_last_credit_warning(path: str) -> date | None:
    try:
        raw = Path(path).read_text().strip()
    except (FileNotFoundError, NotADirectoryError):
        return None
    try:
        return date.fromisoformat(raw)
    except ValueError:
        return None


def save_last_credit_warning(path: str, day: date) -> None:
    _atomic_write(path, day.isoformat())
