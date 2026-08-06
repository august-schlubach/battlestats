"""Stdlib-only outbound mail helpers.

Shared by `server/scripts/daily_ops_email.py` (the ops digest) and the
`notify_pending_feedback` management command, so an SMTP fix is made once.

IMPORTANT: this module must import ONLY the Python standard library. No Django,
no third-party packages. `daily_ops_email.py` is deliberately runnable without
the virtualenv, and it imports this file via a sys.path insert; a Django import
here would break that guarantee. `test_opsmail.test_module_imports_no_django`
enforces it.

Config comes from the environment, seeded by `load_env_file` from
/etc/battlestats-ops-email.env (chmod 600). Never hard-code secrets here: this
file lives in a public repo.
"""
from __future__ import annotations

import os
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr
from pathlib import Path

DEFAULT_ENV_FILE = "/etc/battlestats-ops-email.env"
DEFAULT_MAIL_FROM_NAME = "Zeta Region CloudOps"


def load_env_file(path: str = DEFAULT_ENV_FILE) -> None:
    """Merge KEY=VALUE lines from an env file into os.environ (env wins if set).

    Unreadable is not an error. Under systemd the env file is mode 600 and
    root-owned: systemd reads it as root via EnvironmentFile= and injects the
    values before dropping to the app user, so by the time this runs the
    variables are already in os.environ and the file itself is deliberately
    out of reach. Raising here would break every timer-driven run.

    Swallowing the error is safe because it cannot hide a real misconfiguration:
    if the variables are genuinely absent, send_email raises a named RuntimeError
    listing exactly which ones are missing.
    """
    p = Path(path)
    try:
        if not p.exists():
            return
        content = p.read_text()
    except (PermissionError, OSError):
        return
    for raw in content.splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = val


def cfg(key: str, default: str = "") -> str:
    return os.environ.get(key, default)


def send_email(subject: str, html_body: str, text_body: str) -> None:
    host = cfg("SMTP_HOST", "smtp.purelymail.com")
    port = int(cfg("SMTP_PORT", "465"))
    user = cfg("SMTP_USER")
    pw = cfg("SMTP_PASS")
    mail_from = cfg("MAIL_FROM", user)
    mail_to = cfg("MAIL_TO", "august.schlubach@gmail.com")
    if not (user and pw and mail_from and mail_to):
        raise RuntimeError("SMTP_USER/SMTP_PASS/MAIL_FROM/MAIL_TO must all be set")

    # Display name on the From header. formataddr rather than an f-string so a
    # name containing a comma, a quote or a non-ASCII character is encoded
    # correctly instead of producing a malformed header.
    from_name = cfg("MAIL_FROM_NAME", DEFAULT_MAIL_FROM_NAME)

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = formataddr((from_name, mail_from)) if from_name else mail_from
    msg["To"] = mail_to
    msg.set_content(text_body or "See the HTML version of this message.")
    msg.add_alternative(html_body, subtype="html")

    ctx = ssl.create_default_context()
    if port == 465:
        with smtplib.SMTP_SSL(host, port, timeout=30, context=ctx) as s:
            s.login(user, pw)
            s.send_message(msg)
    else:
        with smtplib.SMTP(host, port, timeout=30) as s:
            s.starttls(context=ctx)
            s.login(user, pw)
            s.send_message(msg)
