"""Tests for the feedback-notifier state files."""
import json
import os
import tempfile
from datetime import date

from django.test import SimpleTestCase

from warships import notify_state


class NotifiedIdsTests(SimpleTestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.path = os.path.join(self.dir, 'feedback-notify-watermark')

    def test_missing_file_reads_as_empty(self):
        self.assertEqual(notify_state.load_notified_ids(self.path), set())

    def test_roundtrip(self):
        notify_state.save_notified_ids(self.path, {3, 1, 2})
        self.assertEqual(notify_state.load_notified_ids(self.path), {1, 2, 3})

    def test_written_as_sorted_json_array(self):
        """Human-readable on the droplet; the recovery procedure is `rm` or hand-edit."""
        notify_state.save_notified_ids(self.path, {3, 1, 2})
        with open(self.path) as fh:
            self.assertEqual(json.loads(fh.read()), [1, 2, 3])

    def test_corrupt_file_reads_as_empty_not_crash(self):
        """A truncated write must re-arm, never wedge the notifier permanently."""
        with open(self.path, 'w') as fh:
            fh.write('[1, 2,')
        self.assertEqual(notify_state.load_notified_ids(self.path), set())

    def test_write_is_atomic_leaving_no_partial_file(self):
        notify_state.save_notified_ids(self.path, {1})
        notify_state.save_notified_ids(self.path, {1, 2})
        leftovers = [f for f in os.listdir(self.dir) if f.startswith('.tmp')]
        self.assertEqual(leftovers, [])

    def test_creates_parent_directory(self):
        nested = os.path.join(self.dir, 'state', 'watermark')
        notify_state.save_notified_ids(nested, {7})
        self.assertEqual(notify_state.load_notified_ids(nested), {7})


class CreditWarningTests(SimpleTestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.path = os.path.join(self.dir, 'credit-warning')

    def test_missing_file_reads_as_none(self):
        self.assertIsNone(notify_state.load_last_credit_warning(self.path))

    def test_roundtrip(self):
        notify_state.save_last_credit_warning(self.path, date(2026, 8, 6))
        self.assertEqual(notify_state.load_last_credit_warning(self.path), date(2026, 8, 6))

    def test_corrupt_file_reads_as_none(self):
        with open(self.path, 'w') as fh:
            fh.write('not-a-date')
        self.assertIsNone(notify_state.load_last_credit_warning(self.path))
