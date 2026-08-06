"""Mail the operator when unreviewed visitor feedback is waiting.

Nothing else reads the Feedback queue. The /feedback skill exists precisely
because no notification does, which means the operator has to remember to poll.
This command inverts that: it runs on a systemd timer on the droplet (always on,
unlike a laptop) and mails each submission exactly once.

Design rules, from agents/work-items/droplet-outbound-mail-spec.md:

  * Silence is success. An empty queue sends nothing and exits 0.
  * Any failure sends a FAILED-tagged mail and exits non-zero. A broken checker
    must never be indistinguishable from a clean queue.
  * Messages are never truncated. Volume is low and the visitor's exact words
    are the entire signal.
  * The state file holds a SET of notified ids, never a maximum. See
    warships/notify_state.py for why.
  * The low-credit warning sends on its own when there is no feedback, because
    the quiet stretches are exactly when a draining balance would go unseen.
"""
from __future__ import annotations

import html as html_lib
import os
import traceback
from datetime import date, timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError

from warships.models import Feedback
from warships.notify_state import (
    load_last_credit_warning,
    load_notified_ids,
    save_last_credit_warning,
    save_notified_ids,
)
from warships.opsmail import cfg, load_env_file, send_email
from warships.purelymail import account_credit

DEFAULT_STATE_DIR = "/opt/battlestats-server/shared/state"
WATERMARK_NAME = "feedback-notify-watermark"
CREDIT_WARNING_NAME = "feedback-credit-warning"
CREDIT_FLOOR = Decimal("5.00")
CREDIT_WARNING_INTERVAL_DAYS = 7


def _enabled() -> bool:
    """Env kill switch read at call time, mirroring cleanup_entity_visit_events."""
    return os.getenv("FEEDBACK_NOTIFY_ENABLED", "1").strip().lower() in (
        "1", "true", "yes", "on",
    )


def _render(rows, credit_note: str) -> tuple[str, str]:
    """Return (text, html). Never truncates a message."""
    text_parts, html_parts = [], []
    for f in rows:
        stamp = f.created_at.isoformat() if f.created_at else "?"
        header = f"#{f.id} | {f.category} | {f.locale or '-'} | {f.realm or '-'} | {stamp}"
        text_parts.append(f"{header}\n{f.path or '-'}\n\n{f.message}\n")
        html_parts.append(
            f"<h3>{html_lib.escape(header)}</h3>"
            f"<p><code>{html_lib.escape(f.path or '-')}</code></p>"
            f"<pre style='white-space:pre-wrap'>{html_lib.escape(f.message)}</pre>"
        )
    if credit_note:
        text_parts.append(f"\n{credit_note}\n")
        html_parts.append(f"<hr><p><strong>{html_lib.escape(credit_note)}</strong></p>")
    return "\n---\n".join(text_parts), "".join(html_parts)


class Command(BaseCommand):
    help = "Email any unreviewed Feedback submissions, each exactly once."

    def add_arguments(self, parser):
        parser.add_argument(
            "--state-dir",
            default=os.getenv("FEEDBACK_NOTIFY_STATE_DIR", DEFAULT_STATE_DIR),
            help="Directory holding the notified-id and credit-warning state files.",
        )
        parser.add_argument(
            "--dry-run", action="store_true",
            help="Report what would be sent without sending or recording anything.",
        )

    def handle(self, *args, **options):
        if not _enabled():
            self.stdout.write("FEEDBACK_NOTIFY_ENABLED is off; nothing to do.")
            return

        state_dir = options["state_dir"]
        dry_run = options["dry_run"]
        watermark = os.path.join(state_dir, WATERMARK_NAME)
        credit_file = os.path.join(state_dir, CREDIT_WARNING_NAME)

        try:
            load_env_file(cfg("OPS_EMAIL_ENV_FILE", "/etc/battlestats-ops-email.env"))

            pending = list(Feedback.objects.filter(
                status=Feedback.STATUS_PENDING).order_by("id"))
            notified = load_notified_ids(watermark)
            fresh = [f for f in pending if f.id not in notified]

            credit, credit_note = self._credit_state()

            if dry_run:
                self.stdout.write(
                    f"DRY RUN: {len(pending)} pending, {len(fresh)} unnotified, "
                    f"credit {credit if credit is not None else 'unknown'}"
                )
                return

            if fresh:
                subject = (f"battlestats: {len(fresh)} new feedback "
                           f"submission{'s' if len(fresh) != 1 else ''}")
                text, html = _render(fresh, credit_note)
                send_email(subject, html, text)
                # Only after a successful send, so a transient SMTP failure does
                # not silently consume the notification.
                save_notified_ids(watermark, notified | {f.id for f in fresh})
                if credit_note:
                    save_last_credit_warning(credit_file, date.today())
                self.stdout.write(f"Mailed {len(fresh)} submission(s).")
                return

            # No feedback. The credit warning still has to be able to travel:
            # a balance draining to zero during a quiet month would otherwise
            # produce no warning at all, and the first symptom would be the
            # silent loss of these notifications.
            if credit_note and self._credit_warning_due(credit_file):
                text, html = _render([], credit_note)
                send_email("battlestats: Purelymail credit is low", html, text)
                save_last_credit_warning(credit_file, date.today())
                self.stdout.write("Mailed low-credit warning.")
                return

            self.stdout.write(f"{len(pending)} pending, 0 unnotified; nothing sent.")

        except Exception as exc:  # noqa: BLE001 - fail loud, then re-raise
            self._send_failure(exc)
            raise CommandError(f"notify_pending_feedback failed: {exc}") from exc

    def _credit_state(self) -> tuple[Decimal | None, str]:
        token = cfg("PURELYMAIL_API_TOKEN")
        if not token:
            return None, ""
        credit = account_credit(token)
        if credit < CREDIT_FLOOR:
            return credit, (
                f"WARNING: Purelymail credit is ${credit:.2f}, below the "
                f"${CREDIT_FLOOR:.2f} floor. When it reaches zero, sending stops "
                f"and these notifications go silent."
            )
        return credit, ""

    def _credit_warning_due(self, credit_file: str) -> bool:
        last = load_last_credit_warning(credit_file)
        if last is None:
            return True
        return (date.today() - last) >= timedelta(days=CREDIT_WARNING_INTERVAL_DAYS)

    def _send_failure(self, exc: Exception) -> None:
        """Best-effort loud failure. If this also fails, the original still raises."""
        try:
            tb = traceback.format_exc()
            text = f"notify_pending_feedback failed.\n\n{exc}\n\n{tb}"
            send_email(
                "battlestats: feedback notifier FAILED",
                f"<pre style='white-space:pre-wrap'>{html_lib.escape(text)}</pre>",
                text,
            )
        except Exception:  # noqa: BLE001
            self.stderr.write("Could not send the failure notification.")
