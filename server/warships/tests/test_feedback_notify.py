"""Behaviour tests for the notify_pending_feedback management command."""
import os
import tempfile
from datetime import date, timedelta
from decimal import Decimal
from io import StringIO
from unittest import mock

from django.core.management import CommandError, call_command
from django.test import TestCase

from warships import notify_state
from warships.models import Feedback

CMD = 'notify_pending_feedback'
TARGET = 'warships.management.commands.notify_pending_feedback'
ENV = {'FEEDBACK_NOTIFY_ENABLED': '1', 'PURELYMAIL_API_TOKEN': 'tok'}


class FeedbackNotifyTests(TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.watermark = os.path.join(self.dir, 'feedback-notify-watermark')
        self.credit_file = os.path.join(self.dir, 'feedback-credit-warning')

    def _run(self, env=None, credit='50.00', send=None, extra=None):
        env = dict(ENV, **(env or {}))
        send = send or mock.MagicMock()
        args = [CMD, '--state-dir', self.dir] + (extra or [])
        with mock.patch.dict(os.environ, env, clear=False), \
             mock.patch(f'{TARGET}.send_email', send), \
             mock.patch(f'{TARGET}.account_credit', return_value=Decimal(credit)), \
             mock.patch(f'{TARGET}.load_env_file'):
            call_command(*args, stdout=StringIO(), stderr=StringIO())
        return send

    def _feedback(self, **kw):
        kw.setdefault('category', 'bug_report')
        kw.setdefault('message', 'the win rate column sorts backwards on mobile')
        kw.setdefault('locale', 'en')
        kw.setdefault('status', Feedback.STATUS_PENDING)
        return Feedback.objects.create(**kw)

    # --- silence on empty -------------------------------------------------
    def test_empty_queue_sends_nothing_and_exits_zero(self):
        send = self._run()
        send.assert_not_called()

    # --- the happy path ---------------------------------------------------
    def test_one_pending_row_sends_exactly_one_mail(self):
        self._feedback()
        send = self._run()
        self.assertEqual(send.call_count, 1)

    def test_mail_contains_the_full_untruncated_message(self):
        # Feedback.message is capped at 2000 chars; stay inside it while still
        # being long enough that any truncation would drop the tail marker.
        long_message = 'x' * 1900 + ' TAIL-MARKER'
        self._feedback(message=long_message)
        send = self._run()
        _subject, html, text = send.call_args[0]
        self.assertIn('TAIL-MARKER', text)
        self.assertIn('TAIL-MARKER', html)

    def test_mail_carries_the_context_fields(self):
        self._feedback(category='language_issue', locale='ko', realm='asia',
                       path='/player/Yamato_Fan')
        send = self._run()
        _subject, _html, text = send.call_args[0]
        for token in ('language_issue', 'ko', 'asia', '/player/Yamato_Fan'):
            self.assertIn(token, text)

    # --- exactly-once semantics ------------------------------------------
    def test_second_run_with_unchanged_queue_sends_nothing(self):
        self._feedback()
        self._run()
        send2 = self._run()
        send2.assert_not_called()

    def test_only_the_new_row_appears_on_a_later_run(self):
        first = self._feedback(message='FIRST-ONE')
        self._run()
        self._feedback(message='SECOND-ONE')
        send = self._run()
        _subject, _html, text = send.call_args[0]
        self.assertIn('SECOND-ONE', text)
        self.assertNotIn('FIRST-ONE', text)
        self.assertIn(first.id, notify_state.load_notified_ids(self.watermark))

    def test_row_with_lower_id_than_one_already_notified_still_mails(self):
        """The out-of-order-commit case. A max-id watermark fails this test:
        Postgres assigns ids at INSERT but rows appear at COMMIT, so a lower id
        can become visible after a higher one has already been mailed."""
        self._feedback(message='LATE-COMMITTER')
        high = self._feedback(message='EARLY-COMMITTER')
        notify_state.save_notified_ids(self.watermark, {high.id})
        send = self._run()
        _subject, _html, text = send.call_args[0]
        self.assertIn('LATE-COMMITTER', text)
        self.assertNotIn('EARLY-COMMITTER', text)

    def test_send_failure_does_not_advance_the_watermark(self):
        """Otherwise a transient SMTP error silently eats the notification."""
        self._feedback()
        boom = mock.MagicMock(side_effect=OSError('smtp down'))
        with self.assertRaises(CommandError):
            self._run(send=boom)
        self.assertEqual(notify_state.load_notified_ids(self.watermark), set())

    def test_reviewed_rows_are_ignored(self):
        self._feedback(status=Feedback.STATUS_APPROVED)
        send = self._run()
        send.assert_not_called()

    # --- fail-loud --------------------------------------------------------
    def test_unexpected_error_sends_failed_mail_and_exits_nonzero(self):
        self._feedback()
        send = mock.MagicMock()
        with mock.patch.dict(os.environ, ENV, clear=False), \
             mock.patch(f'{TARGET}.send_email', send), \
             mock.patch(f'{TARGET}.load_env_file'), \
             mock.patch(f'{TARGET}.account_credit', side_effect=RuntimeError('kaboom')):
            with self.assertRaises(CommandError):
                call_command(CMD, '--state-dir', self.dir,
                             stdout=StringIO(), stderr=StringIO())
        self.assertEqual(send.call_count, 1)
        subject, _html, text = send.call_args[0]
        self.assertIn('FAILED', subject)
        self.assertIn('kaboom', text)

    # --- credit floor -----------------------------------------------------
    def test_low_credit_warns_even_with_an_empty_queue(self):
        """The load-bearing case: quiet stretches are when credit drains unseen."""
        send = self._run(credit='4.00')
        self.assertEqual(send.call_count, 1)
        subject, _html, _text = send.call_args[0]
        self.assertIn('credit', subject.lower())

    def test_low_credit_warning_is_rate_limited_to_weekly(self):
        self._run(credit='4.00')
        send2 = self._run(credit='4.00')
        send2.assert_not_called()

    def test_low_credit_warning_resends_after_seven_days(self):
        self._run(credit='4.00')
        stale = date.today() - timedelta(days=8)
        notify_state.save_last_credit_warning(self.credit_file, stale)
        send = self._run(credit='4.00')
        self.assertEqual(send.call_count, 1)

    def test_low_credit_folds_into_the_feedback_mail_when_one_is_sent(self):
        self._feedback()
        send = self._run(credit='4.00')
        self.assertEqual(send.call_count, 1)   # one mail, not two
        _subject, _html, text = send.call_args[0]
        self.assertIn('4.00', text)

    def test_healthy_credit_sends_no_warning(self):
        send = self._run(credit='50.00')
        send.assert_not_called()

    # --- gates ------------------------------------------------------------
    def test_kill_switch_disables_the_command(self):
        self._feedback()
        send = self._run(env={'FEEDBACK_NOTIFY_ENABLED': '0'})
        send.assert_not_called()

    def test_dry_run_sends_nothing_and_leaves_state_untouched(self):
        self._feedback()
        send = self._run(extra=['--dry-run'])
        send.assert_not_called()
        self.assertEqual(notify_state.load_notified_ids(self.watermark), set())
