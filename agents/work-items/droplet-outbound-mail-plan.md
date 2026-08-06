# Droplet Outbound Mail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mail the operator when visitor feedback arrives, from the always-on droplet, and re-arm the ops digest that has never been scheduled.

**Architecture:** A stdlib-only mail module shared by the existing `daily_ops_email.py` script and a new `notify_pending_feedback` Django management command. The command mails each pending `Feedback` row exactly once, tracked by a JSON id-set state file; it is silent on an empty queue and loud on any error. Two systemd timers, written by the backend deploy script alongside the six already there, schedule both consumers.

**Tech Stack:** Python 3.12, Django 5, stdlib `smtplib`/`ssl`/`urllib`, Purelymail SMTP + JSON API, systemd timers, pytest.

**Source spec:** `agents/work-items/droplet-outbound-mail-spec.md`. Read it before starting. Every "why" lives there; this document is the "how".

## Global Constraints

- **`server/warships/opsmail.py` must import only the Python standard library.** No Django, no third-party packages. `daily_ops_email.py` runs under a bare `python3` with no virtualenv, and importing it from there must not break that.
- **Never truncate a visitor's message.** Full verbatim text in every email body.
- **The state file stores a set of ids, never a maximum.** See spec section 3; a max-id watermark permanently loses rows that commit out of order.
- **Silence is the success case.** An empty queue sends no mail and exits 0.
- **Any failure sends mail and exits non-zero.** A broken checker must never look like a clean queue.
- Kill switch env var: `FEEDBACK_NOTIFY_ENABLED`, default `"1"`, truthy set `("1", "true", "yes", "on")`, read at call time.
- Credit floor: `$5.00`. Credit parses as `Decimal`, never `float`.
- Credit warning re-send interval: 7 days.
- SMTP env file: `/etc/battlestats-ops-email.env`. State directory: `/opt/battlestats-server/shared/state/`.
- Test command: `cd server && DJANGO_SECRET_KEY=k DB_ENGINE=sqlite3 python -m pytest warships/tests/<file> --nomigrations --tb=short`
- Commit prefixes: `feat:` for new behaviour, `refactor:` for the extraction, `docs:` for documentation, `chore:` for deploy plumbing.

## File Structure

| File | Responsibility |
|---|---|
| `server/warships/opsmail.py` | **Create.** Stdlib-only `cfg`, `load_env_file`, `send_email`. The single send path. |
| `server/warships/purelymail.py` | **Create.** Stdlib-only `account_credit()` against the Purelymail JSON API. |
| `server/warships/notify_state.py` | **Create.** Atomic read/write of the notified-id set and the last-credit-warning date. |
| `server/warships/management/commands/notify_pending_feedback.py` | **Create.** The command. Orchestration only; all primitives come from the three modules above. |
| `server/scripts/daily_ops_email.py` | **Modify.** Delete its local `cfg`/`load_env_file`/`send_email`; import them from `opsmail`. |
| `server/warships/tests/test_opsmail.py` | **Create.** Send-path tests. |
| `server/warships/tests/test_notify_state.py` | **Create.** State-file tests. |
| `server/warships/tests/test_feedback_notify.py` | **Create.** Command behaviour tests. |
| `server/deploy/deploy_to_droplet.sh` | **Modify.** Two timer/service pairs, state directory, enable calls. |
| `agents/runbooks/ops-env-reference.md` | **Modify.** New env vars. |
| `agents/runbooks/runbook-droplet-outbound-mail-2026-08-06.md` | **Create.** Operating and recovery procedures. |

---

### Task 1: Shared stdlib-only mail module

**Files:**
- Create: `server/warships/opsmail.py`
- Create: `server/warships/tests/test_opsmail.py`
- Modify: `server/scripts/daily_ops_email.py` (remove lines 48-65 `load_env_file`/`cfg` and 393-419 `send_email`; import instead)

**Interfaces:**
- Consumes: nothing.
- Produces: `cfg(key: str, default: str = "") -> str`; `load_env_file(path: str) -> None`; `send_email(subject: str, html_body: str, text_body: str) -> None`. `send_email` raises `RuntimeError` when any of `SMTP_USER`/`SMTP_PASS`/`MAIL_FROM`/`MAIL_TO` is missing.

- [ ] **Step 1: Write the failing tests**

Create `server/warships/tests/test_opsmail.py`:

```python
"""Tests for the shared stdlib-only outbound mail module."""
import os
from unittest import mock

from django.test import SimpleTestCase

from warships import opsmail


class LoadEnvFileTests(SimpleTestCase):
    def test_parses_keys_and_strips_quotes(self):
        import tempfile
        with tempfile.NamedTemporaryFile('w', suffix='.env', delete=False) as fh:
            fh.write('# comment\n\nSMTP_HOST="smtp.example.com"\nSMTP_PORT=465\n')
            path = fh.name
        with mock.patch.dict(os.environ, {}, clear=True):
            opsmail.load_env_file(path)
            self.assertEqual(os.environ['SMTP_HOST'], 'smtp.example.com')
            self.assertEqual(os.environ['SMTP_PORT'], '465')
        os.unlink(path)

    def test_existing_env_wins(self):
        import tempfile
        with tempfile.NamedTemporaryFile('w', suffix='.env', delete=False) as fh:
            fh.write('SMTP_HOST=from-file\n')
            path = fh.name
        with mock.patch.dict(os.environ, {'SMTP_HOST': 'from-env'}, clear=True):
            opsmail.load_env_file(path)
            self.assertEqual(os.environ['SMTP_HOST'], 'from-env')
        os.unlink(path)

    def test_missing_file_is_not_an_error(self):
        opsmail.load_env_file('/nonexistent/path/to.env')  # must not raise


class SendEmailTests(SimpleTestCase):
    ENV = {
        'SMTP_HOST': 'smtp.example.com', 'SMTP_PORT': '465',
        'SMTP_USER': 'sysop@example.com', 'SMTP_PASS': 'pw',
        'MAIL_FROM': 'sysop@example.com', 'MAIL_TO': 'op@example.com',
    }

    def test_port_465_uses_smtp_ssl_and_logs_in(self):
        with mock.patch.dict(os.environ, self.ENV, clear=True), \
             mock.patch.object(opsmail.smtplib, 'SMTP_SSL') as ssl_cls:
            opsmail.send_email('Subj', '<p>html</p>', 'text')
        ssl_cls.assert_called_once()
        server = ssl_cls.return_value.__enter__.return_value
        server.login.assert_called_once_with('sysop@example.com', 'pw')
        server.send_message.assert_called_once()
        msg = server.send_message.call_args[0][0]
        self.assertEqual(msg['Subject'], 'Subj')
        self.assertEqual(msg['To'], 'op@example.com')

    def test_non_465_port_uses_starttls(self):
        env = dict(self.ENV, SMTP_PORT='587')
        with mock.patch.dict(os.environ, env, clear=True), \
             mock.patch.object(opsmail.smtplib, 'SMTP') as smtp_cls:
            opsmail.send_email('Subj', '<p>h</p>', 't')
        server = smtp_cls.return_value.__enter__.return_value
        server.starttls.assert_called_once()

    def test_missing_credentials_raises(self):
        env = dict(self.ENV); env.pop('SMTP_PASS')
        with mock.patch.dict(os.environ, env, clear=True):
            with self.assertRaises(RuntimeError):
                opsmail.send_email('S', '<p>h</p>', 't')

    def test_module_imports_no_django(self):
        """The no-venv guarantee: daily_ops_email.py imports this under bare python3."""
        import ast, pathlib
        src = pathlib.Path(opsmail.__file__).read_text()
        tree = ast.parse(src)
        imported = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                imported.update(a.name.split('.')[0] for a in node.names)
            elif isinstance(node, ast.ImportFrom) and node.module:
                imported.add(node.module.split('.')[0])
        self.assertNotIn('django', imported)
        self.assertNotIn('warships', imported)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && DJANGO_SECRET_KEY=k DB_ENGINE=sqlite3 python -m pytest warships/tests/test_opsmail.py --nomigrations --tb=short`
Expected: FAIL, `ModuleNotFoundError: No module named 'warships.opsmail'`

- [ ] **Step 3: Create the module**

Create `server/warships/opsmail.py`:

```python
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
from pathlib import Path

DEFAULT_ENV_FILE = "/etc/battlestats-ops-email.env"


def load_env_file(path: str = DEFAULT_ENV_FILE) -> None:
    """Merge KEY=VALUE lines from an env file into os.environ (env wins if set)."""
    p = Path(path)
    if not p.exists():
        return
    for raw in p.read_text().splitlines():
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

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = mail_from
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && DJANGO_SECRET_KEY=k DB_ENGINE=sqlite3 python -m pytest warships/tests/test_opsmail.py --nomigrations --tb=short`
Expected: PASS, 6 tests.

- [ ] **Step 5: Point `daily_ops_email.py` at the shared module**

In `server/scripts/daily_ops_email.py`, delete the local `load_env_file`, `cfg` (lines 48-65) and `send_email` (lines 393-419) definitions, along with the now-unused `smtplib`, `ssl`, `EmailMessage` and `Path` imports if nothing else uses them. Add, after the existing imports:

```python
# Shared send path. sys.path insert keeps the no-venv guarantee: opsmail is
# stdlib-only, so a bare python3 can import it from the server/ package dir.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from warships.opsmail import cfg, load_env_file, send_email  # noqa: E402
```

Keep the `DEFAULT_ENV_FILE` constant in `daily_ops_email.py` as-is; it is still referenced by `main()`.

- [ ] **Step 6: Verify the digest still runs without the virtualenv**

Run: `cd server && python3 scripts/daily_ops_email.py --dry-run --no-llm`
Expected: it prints a rendered digest (or a `FAILED`-tagged one if the benchmark dir is absent locally) and does **not** raise `ImportError`. Any `ImportError` means the sys.path insert or the stdlib-only rule was broken.

- [ ] **Step 7: Run the full backend suite for regressions**

Run: `cd server && DJANGO_SECRET_KEY=k DB_ENGINE=sqlite3 python -m pytest warships/tests/ --nomigrations --tb=short -q`
Expected: no new failures against the pre-existing baseline.

- [ ] **Step 8: Commit**

```bash
git add server/warships/opsmail.py server/warships/tests/test_opsmail.py server/scripts/daily_ops_email.py
git commit -m "refactor: extract the shared stdlib-only send path into opsmail

Both the ops digest and the incoming feedback notifier need to send mail.
Extracting cfg/load_env_file/send_email means an SMTP fix is made once
rather than twice. The module is stdlib-only by contract, enforced by a
test, because daily_ops_email.py must keep running without the venv."
```

---

### Task 2: State file for notified ids and the credit-warning date

**Files:**
- Create: `server/warships/notify_state.py`
- Create: `server/warships/tests/test_notify_state.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `load_notified_ids(path: str) -> set[int]`; `save_notified_ids(path: str, ids: set[int]) -> None`; `load_last_credit_warning(path: str) -> date | None`; `save_last_credit_warning(path: str, day: date) -> None`. All writes are atomic (temp file plus `os.replace`). A missing or corrupt file reads as empty rather than raising.

- [ ] **Step 1: Write the failing tests**

Create `server/warships/tests/test_notify_state.py`:

```python
"""Tests for the feedback-notifier state files."""
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
        import json
        notify_state.save_notified_ids(self.path, {3, 1, 2})
        self.assertEqual(json.loads(open(self.path).read()), [1, 2, 3])

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && DJANGO_SECRET_KEY=k DB_ENGINE=sqlite3 python -m pytest warships/tests/test_notify_state.py --nomigrations --tb=short`
Expected: FAIL, `ModuleNotFoundError: No module named 'warships.notify_state'`

- [ ] **Step 3: Create the module**

Create `server/warships/notify_state.py`:

```python
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
mode of raising is a notifier that stays wedged and silent.
"""
from __future__ import annotations

import json
import os
import tempfile
from datetime import date
from pathlib import Path


def _atomic_write(path: str, text: str) -> None:
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && DJANGO_SECRET_KEY=k DB_ENGINE=sqlite3 python -m pytest warships/tests/test_notify_state.py --nomigrations --tb=short`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add server/warships/notify_state.py server/warships/tests/test_notify_state.py
git commit -m "feat: add notified-id set state for the feedback notifier

Stores the set of already-mailed Feedback ids, not a maximum. A max-id
watermark permanently skips a row that commits after a higher id, which
was reproduced against Postgres 15. Reads are forgiving so a corrupt file
re-arms rather than wedging the notifier."
```

---

### Task 3: Purelymail credit read

**Files:**
- Create: `server/warships/purelymail.py`
- Create: `server/warships/tests/test_purelymail_credit.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `account_credit(token: str, *, timeout: float = 20.0) -> Decimal`. Raises `PurelymailError` on a non-success response.

- [ ] **Step 1: Write the failing tests**

Create `server/warships/tests/test_purelymail_credit.py`:

```python
"""Tests for the Purelymail account-credit read."""
import io
import json
from decimal import Decimal
from unittest import mock

from django.test import SimpleTestCase

from warships import purelymail


def _response(payload):
    body = json.dumps(payload).encode()
    resp = mock.MagicMock()
    resp.read.return_value = body
    resp.__enter__.return_value = resp
    return resp


class AccountCreditTests(SimpleTestCase):
    def test_parses_long_decimal_string_without_float_loss(self):
        """Purelymail pro-rates to the byte and second; the balance is a long
        decimal string and must never round-trip through float."""
        raw = '7.3492982623033992897006595636732647082699137493658041603247082699'
        with mock.patch.object(purelymail.urllib.request, 'urlopen',
                               return_value=_response(
                                   {'type': 'success', 'result': {'credit': raw}})):
            credit = purelymail.account_credit('tok')
        self.assertIsInstance(credit, Decimal)
        self.assertEqual(credit, Decimal(raw))

    def test_sends_the_api_token_header(self):
        with mock.patch.object(purelymail.urllib.request, 'urlopen',
                               return_value=_response(
                                   {'type': 'success', 'result': {'credit': '1'}})) as up:
            purelymail.account_credit('sekrit')
        request = up.call_args[0][0]
        self.assertEqual(request.get_header('Purelymail-api-token'), 'sekrit')

    def test_error_type_raises(self):
        with mock.patch.object(purelymail.urllib.request, 'urlopen',
                               return_value=_response({'type': 'error', 'message': 'nope'})):
            with self.assertRaises(purelymail.PurelymailError):
                purelymail.account_credit('tok')

    def test_comparison_against_floor_is_exact(self):
        with mock.patch.object(purelymail.urllib.request, 'urlopen',
                               return_value=_response(
                                   {'type': 'success', 'result': {'credit': '4.999'}})):
            self.assertLess(purelymail.account_credit('tok'), Decimal('5.00'))
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && DJANGO_SECRET_KEY=k DB_ENGINE=sqlite3 python -m pytest warships/tests/test_purelymail_credit.py --nomigrations --tb=short`
Expected: FAIL, `ModuleNotFoundError: No module named 'warships.purelymail'`

- [ ] **Step 3: Create the module**

Create `server/warships/purelymail.py`:

```python
"""Minimal Purelymail JSON API client: account credit only.

Stdlib-only, matching warships/opsmail.py, so nothing here constrains what can
import it. Named to match the equivalent clients in the derby and metro
projects, which wrap more of the same API.

Auth: header `Purelymail-Api-Token: <token>`. All endpoints are POST.
Spec: https://news.purelymail.com/api/index.html
"""
from __future__ import annotations

import json
import urllib.error
import urllib.request
from decimal import Decimal

BASE_URL = "https://purelymail.com"


class PurelymailError(RuntimeError):
    pass


def account_credit(token: str, *, timeout: float = 20.0) -> Decimal:
    """Return the account's remaining credit in dollars.

    Decimal, never float: Purelymail pro-rates charges to the byte and the
    second and returns a ~64-digit decimal string. Binary floating point would
    silently perturb a value that is compared against a spend threshold.
    """
    req = urllib.request.Request(
        f"{BASE_URL}/api/v0/checkAccountCredit",
        data=b"{}",
        headers={"Purelymail-Api-Token": token, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            payload = json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        raise PurelymailError(f"HTTP {exc.code} from checkAccountCredit") from exc

    if payload.get("type") != "success":
        raise PurelymailError(f"checkAccountCredit returned {payload!r}")
    return Decimal(str(payload["result"]["credit"]))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && DJANGO_SECRET_KEY=k DB_ENGINE=sqlite3 python -m pytest warships/tests/test_purelymail_credit.py --nomigrations --tb=short`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add server/warships/purelymail.py server/warships/tests/test_purelymail_credit.py
git commit -m "feat: read Purelymail account credit as Decimal

The notifier warns before the balance that pays for sending runs out.
Purelymail pro-rates to the byte and second and returns a ~64-digit
decimal string, so the value is parsed as Decimal and compared exactly."
```

---

### Task 4: The `notify_pending_feedback` command

**Files:**
- Create: `server/warships/management/commands/notify_pending_feedback.py`
- Create: `server/warships/tests/test_feedback_notify.py`

**Interfaces:**
- Consumes: `warships.opsmail.load_env_file`, `warships.opsmail.send_email`, `warships.opsmail.cfg`; `warships.purelymail.account_credit`, `warships.purelymail.PurelymailError`; all four `warships.notify_state` functions; `warships.models.Feedback` with `STATUS_PENDING`, `id`, `created_at`, `category`, `locale`, `realm`, `path`, `message`.
- Produces: the management command `notify_pending_feedback`, with `--dry-run` and `--state-dir` options. Exits 0 on success (mail sent or nothing to do), non-zero via `CommandError` on any failure.

**Note on patch targets:** the tests patch `warships.management.commands.notify_pending_feedback.send_email`, not `warships.opsmail.send_email`, because the command imports the name directly. Patching the source module would not intercept the already-bound reference.

- [ ] **Step 1: Write the failing tests**

Create `server/warships/tests/test_feedback_notify.py`:

```python
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
        long_message = 'x' * 4000 + ' TAIL-MARKER'
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
        low = self._feedback(message='LATE-COMMITTER')
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
        notify_state.save_last_credit_warning(
            os.path.join(self.dir, 'feedback-credit-warning'), stale)
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && DJANGO_SECRET_KEY=k DB_ENGINE=sqlite3 python -m pytest warships/tests/test_feedback_notify.py --nomigrations --tb=short`
Expected: FAIL, `CommandError: Unknown command: 'notify_pending_feedback'`

- [ ] **Step 3: Write the command**

Create `server/warships/management/commands/notify_pending_feedback.py`:

```python
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
        header = f"#{f.id} · {f.category} · {f.locale or '-'} · {f.realm or '-'} · {stamp}"
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
            "--state-dir", default=os.getenv("FEEDBACK_NOTIFY_STATE_DIR", DEFAULT_STATE_DIR),
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

            # No feedback. The credit warning still has to be able to travel.
            if credit_note and self._credit_warning_due(credit_file):
                text, html = _render([], credit_note)
                send_email("battlestats: Purelymail credit is low", html, text)
                save_last_credit_warning(credit_file, date.today())
                self.stdout.write("Mailed low-credit warning.")
                return

            self.stdout.write(
                f"{len(pending)} pending, 0 unnotified; nothing sent.")

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
            text = (f"notify_pending_feedback failed.\n\n{exc}\n\n{tb}")
            send_email("battlestats: feedback notifier FAILED",
                       f"<pre style='white-space:pre-wrap'>{html_lib.escape(text)}</pre>",
                       text)
        except Exception:  # noqa: BLE001
            self.stderr.write("Could not send the failure notification.")
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && DJANGO_SECRET_KEY=k DB_ENGINE=sqlite3 python -m pytest warships/tests/test_feedback_notify.py --nomigrations --tb=short`
Expected: PASS, 18 tests.

- [ ] **Step 5: Run the full backend suite**

Run: `cd server && DJANGO_SECRET_KEY=k DB_ENGINE=sqlite3 python -m pytest warships/tests/ --nomigrations --tb=short -q`
Expected: no new failures.

- [ ] **Step 6: Commit**

```bash
git add server/warships/management/commands/notify_pending_feedback.py server/warships/tests/test_feedback_notify.py
git commit -m "feat: add notify_pending_feedback management command

Mails each unreviewed Feedback submission exactly once, in full, and stays
silent on an empty queue. Any failure mails a FAILED-tagged traceback and
exits non-zero, so a broken checker never looks like a clean queue. The
low-credit warning sends on its own schedule because the quiet stretches
are exactly when a draining balance would otherwise go unseen."
```

---

### Task 5: Schedule both consumers from the deploy script

**Files:**
- Modify: `server/deploy/deploy_to_droplet.sh` (add unit pairs near the existing timers around line 1236; add enable calls after line 1248)

**Interfaces:**
- Consumes: the `notify_pending_feedback` command from Task 4; the existing `server/scripts/daily_ops_email.py`.
- Produces: `battlestats-feedback-notify.{service,timer}` and `battlestats-ops-digest.{service,timer}` on the droplet, plus `/opt/battlestats-server/shared/state/`.

- [ ] **Step 1: Add the state directory**

In `server/deploy/deploy_to_droplet.sh`, immediately before the block that writes the timer units, add:

```bash
# State for the feedback notifier (notified-id set + last credit warning).
# shared/ has no mkdir precedent in this script; its other subdirectories were
# created by hand, so this one is made explicitly.
mkdir -p "${APP_ROOT}/shared/state"
chown "${APP_USER}:${APP_USER}" "${APP_ROOT}/shared/state"
```

- [ ] **Step 2: Add the feedback-notify unit pair**

Append after the existing `battlestats-cleanup-entity-visits.timer` block:

```bash
cat > /etc/systemd/system/battlestats-feedback-notify.service <<EOF
[Unit]
Description=Battlestats visitor-feedback notifier
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${APP_ROOT}/current/server
EnvironmentFile=/etc/battlestats-server.env
EnvironmentFile=/etc/battlestats-server.secrets.env
# Third env file, unlike every other unit here: the SMTP settings and the
# Purelymail API token live in the ops-email env file, which until now was read
# only by daily_ops_email.py at runtime.
EnvironmentFile=/etc/battlestats-ops-email.env
ExecStart=/bin/bash -lc 'exec "${APP_ROOT}/venv/bin/python" manage.py notify_pending_feedback'
TimeoutStartSec=600
EOF

cat > /etc/systemd/system/battlestats-feedback-notify.timer <<'EOF'
[Unit]
Description=Check the Battlestats feedback queue daily

[Timer]
OnCalendar=*-*-* 13:00:00 UTC
Persistent=true
RandomizedDelaySec=300

[Install]
WantedBy=timers.target
EOF
```

- [ ] **Step 3: Add the ops-digest unit pair**

Append immediately after:

```bash
cat > /etc/systemd/system/battlestats-ops-digest.service <<EOF
[Unit]
Description=Battlestats daily ops digest email
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${APP_ROOT}/current/server
EnvironmentFile=/etc/battlestats-ops-email.env
# Deliberately /usr/bin/python3, not the venv: daily_ops_email.py is stdlib-only
# by design and this keeps that property honest.
ExecStart=/bin/bash -lc 'exec /usr/bin/python3 scripts/daily_ops_email.py'
TimeoutStartSec=900
EOF

cat > /etc/systemd/system/battlestats-ops-digest.timer <<'EOF'
[Unit]
Description=Send the Battlestats ops digest each morning

[Timer]
OnCalendar=*-*-* 11:30:00 UTC
Persistent=true
RandomizedDelaySec=300

[Install]
WantedBy=timers.target
EOF
```

- [ ] **Step 4: Enable both timers**

After the existing `systemctl enable --now` block (near line 1254), add:

```bash
systemctl enable --now battlestats-feedback-notify.timer 2>/dev/null || true
systemctl enable --now battlestats-ops-digest.timer 2>/dev/null || true
```

- [ ] **Step 5: Verify the script parses**

Run: `bash -n server/deploy/deploy_to_droplet.sh`
Expected: no output, exit 0. A syntax error here breaks every future deploy, so this check is not optional.

- [ ] **Step 6: Commit**

```bash
git add server/deploy/deploy_to_droplet.sh
git commit -m "chore: schedule the feedback notifier and ops digest

Adds two timer/service pairs alongside the six already written by this
script, plus the shared/state directory the notifier needs. The ops digest
has existed and been deployed since July without anything scheduling it;
this is what re-arms it."
```

---

### Task 6: Provision the sending identity (production mutation)

**This task mutates the shared Purelymail account and touches derby's mail domain. Do not run any step without explicit operator approval, and run the two API calls as separate acknowledged steps rather than as one batch.**

**Files:** none committed. This is an operator procedure; its durable record is the runbook in Task 7.

**Interfaces:**
- Consumes: `shared/purelymail-api-token` from Pass.
- Produces: the `sysop@tamezz.com` mailbox, an exact routing rule for it, and `shared/purelymail-sysop-smtp` in Pass.

- [ ] **Step 1: Pre-check, changing nothing**

```bash
TOKEN=$(pass show shared/purelymail-api-token | head -1) python3 -c "
import os,json,urllib.request
tok=os.environ['TOKEN']
def call(p,b={}):
    r=urllib.request.Request('https://purelymail.com'+p,data=json.dumps(b).encode(),
      headers={'Purelymail-Api-Token':tok,'Content-Type':'application/json'})
    return json.loads(urllib.request.urlopen(r,timeout=20).read())
print('users:', call('/api/v0/listUser')['result']['users'])
print('tamezz rules:', [r for r in call('/api/v0/listRoutingRules')['result']['rules']
                        if r['domainName']=='tamezz.com'])
"
```

Expected: `sysop@tamezz.com` absent from users; exactly one `tamezz.com` rule, `matchUser=''`, `prefix=True`, `catchall=False`, targeting `tjones86@tamezz.com`. If either differs, stop and re-read the spec's section 1 before continuing.

- [ ] **Step 2: Generate the password and put it in Pass first**

Pass is the authority; the mailbox is created to match it, never the reverse.

```bash
python3 -c "import secrets,string; print(''.join(secrets.choice(string.ascii_letters+string.digits) for _ in range(32)))" \
  | pass insert -e shared/purelymail-sysop-smtp
```

- [ ] **Step 3: Create the mailbox (operator approval required)**

```bash
TOKEN=$(pass show shared/purelymail-api-token | head -1) \
PW=$(pass show shared/purelymail-sysop-smtp | head -1) python3 -c "
import os,json,urllib.request
r=urllib.request.Request('https://purelymail.com/api/v0/createUser',
  data=json.dumps({'userName':'sysop','domainName':'tamezz.com',
                   'password':os.environ['PW'],'enablePasswordReset':False,
                   'sendWelcomeEmail':False}).encode(),
  headers={'Purelymail-Api-Token':os.environ['TOKEN'],'Content-Type':'application/json'})
print(json.loads(urllib.request.urlopen(r,timeout=20).read()))
"
```

Expected: `{'type': 'success', ...}`. Confirm with `listUser` that `sysop@tamezz.com` now appears.

`sendWelcomeEmail` is set to `False` deliberately. It defaults to true, and the
mailbox is created one step **before** its routing rule exists, so a welcome
message would be addressed to `sysop@tamezz.com` while derby's blanket prefix
rule is still the only match: it would land in derby's ingest inbox. That is a
small instance of exactly the leak this task exists to prevent.

- [ ] **Step 4: Add the exact routing rule (operator approval required)**

Without this, derby receives every bounce and reply addressed to `sysop@`. Purelymail documents that an exact match always beats a prefix match, which is what makes this additive fix work without editing derby's rule.

```bash
TOKEN=$(pass show shared/purelymail-api-token | head -1) python3 -c "
import os,json,urllib.request
r=urllib.request.Request('https://purelymail.com/api/v0/createRoutingRule',
  data=json.dumps({'domainName':'tamezz.com','prefix':False,'matchUser':'sysop',
                   'targetAddresses':['sysop@tamezz.com'],'catchall':False}).encode(),
  headers={'Purelymail-Api-Token':os.environ['TOKEN'],'Content-Type':'application/json'})
print(json.loads(urllib.request.urlopen(r,timeout=20).read()))
"
```

Expected: `{'type': 'success', ...}`. Re-run the Step 1 pre-check and confirm the new exact rule is listed.

- [ ] **Step 5: Write the password into the droplet env file**

The on-disk file is generated from Pass, never hand-authored as the source of truth.

```bash
NEW=$(pass show shared/purelymail-sysop-smtp | head -1)
ssh root@battlestats.online "sed -i 's|^SMTP_PASS=.*|SMTP_PASS=\"$NEW\"|' /etc/battlestats-ops-email.env && \
  grep -c '^SMTP_PASS=' /etc/battlestats-ops-email.env && \
  ls -l /etc/battlestats-ops-email.env"
```

Expected: `1`, and the file still shows mode `-rw-------`.

- [ ] **Step 6: Verify authentication without sending**

```bash
ssh root@battlestats.online 'python3 -c "
import os,ssl,smtplib
from pathlib import Path
for raw in Path(\"/etc/battlestats-ops-email.env\").read_text().splitlines():
    l=raw.strip()
    if l and not l.startswith(\"#\") and \"=\" in l:
        k,_,v=l.partition(\"=\"); os.environ[k.strip()]=v.strip().strip(chr(34)).strip(chr(39))
with smtplib.SMTP_SSL(os.environ[\"SMTP_HOST\"], int(os.environ[\"SMTP_PORT\"]),
                      timeout=20, context=ssl.create_default_context()) as s:
    s.login(os.environ[\"SMTP_USER\"], os.environ[\"SMTP_PASS\"])
    print(\"AUTH OK, no mail sent\")
"'
```

Expected: `AUTH OK, no mail sent`. If this still returns 535, the mailbox or the password did not land; do not proceed to Task 7.

- [ ] **Step 7: Add the API token to the env file**

The notifier's credit check needs it, and the file is already the right home for Purelymail secrets.

```bash
TOK=$(pass show shared/purelymail-api-token | head -1)
ssh root@battlestats.online "grep -q '^PURELYMAIL_API_TOKEN=' /etc/battlestats-ops-email.env || \
  echo 'PURELYMAIL_API_TOKEN=\"$TOK\"' >> /etc/battlestats-ops-email.env"
```

---

### Task 7: Deploy, verify end to end, and document

**Files:**
- Create: `agents/runbooks/runbook-droplet-outbound-mail-2026-08-06.md`
- Modify: `agents/runbooks/ops-env-reference.md`
- Modify: `agents/doc_registry.json`
- Modify: `agents/work-items/droplet-outbound-mail-spec.md` (status line)

- [ ] **Step 1: Deploy the backend**

Run: `./server/deploy/deploy_to_droplet.sh battlestats.online`
Expected: completes without error. Note that the deploy ships the working tree, so confirm the branch is merged or that the working tree is what you intend to ship.

- [ ] **Step 2: Verify both timers are armed**

```bash
ssh root@battlestats.online 'systemctl list-timers --all --no-pager | grep -E "feedback-notify|ops-digest"; \
  ls -ld /opt/battlestats-server/shared/state'
```

Expected: both timers listed with a populated `NEXT`; the state directory exists and is owned by the app user.

- [ ] **Step 3: Dry-run the notifier against production data**

```bash
ssh root@battlestats.online 'cd /opt/battlestats-server/current/server && \
  /opt/battlestats-server/venv/bin/python manage.py notify_pending_feedback --dry-run'
```

Expected: a `DRY RUN: N pending, M unnotified, credit …` line, and no mail. This proves the ORM, the env file and the credit call all work before anything is sent.

- [ ] **Step 4: Send one real test message**

Submit a feedback row through the live footer modal on battlestats.online, then:

```bash
ssh root@battlestats.online 'cd /opt/battlestats-server/current/server && \
  /opt/battlestats-server/venv/bin/python manage.py notify_pending_feedback'
```

Expected: `Mailed 1 submission(s).`

- [ ] **Step 5: Operator check, inbox versus spam**

**This step cannot be automated and the work is not done until a human has done it.** Confirm the message arrived in the Gmail **inbox** and not the spam folder, and that the body carries the full verbatim message. If it landed in spam, stop: the entire premise of the feature is that the operator stops polling, and filtered mail restores the polling silently.

- [ ] **Step 6: Verify exactly-once**

```bash
ssh root@battlestats.online 'cd /opt/battlestats-server/current/server && \
  /opt/battlestats-server/venv/bin/python manage.py notify_pending_feedback; \
  cat /opt/battlestats-server/shared/state/feedback-notify-watermark'
```

Expected: `N pending, 0 unnotified; nothing sent.` and a JSON array containing the id just mailed.

- [ ] **Step 7: Verify derby is not receiving the bounces**

```bash
TOKEN=$(pass show shared/purelymail-api-token | head -1) python3 -c "
import os,json,urllib.request
r=urllib.request.Request('https://purelymail.com/api/v0/listRoutingRules',data=b'{}',
  headers={'Purelymail-Api-Token':os.environ['TOKEN'],'Content-Type':'application/json'})
for x in json.loads(urllib.request.urlopen(r,timeout=20).read())['result']['rules']:
    if x['domainName']=='tamezz.com': print(x)
"
```

Expected: both rules present, including the exact `sysop` rule targeting `sysop@tamezz.com`.

- [ ] **Step 8: Write the runbook**

Create `agents/runbooks/runbook-droplet-outbound-mail-2026-08-06.md` covering: the sending identity and why it exists; the two timers and their schedules; the state files and the fact that deleting the watermark re-arms everything; how to run the notifier by hand; what a `FAILED` subject means and where to look; the credit floor and how to top up; and the `tamezz.com` routing constraint so a future reader does not remove the exact rule and silently route battlestats bounces into derby.

- [ ] **Step 9: Update the env reference**

In `agents/runbooks/ops-env-reference.md`, add `FEEDBACK_NOTIFY_ENABLED` (default `1`), `FEEDBACK_NOTIFY_STATE_DIR` (default `/opt/battlestats-server/shared/state`), and note that `/etc/battlestats-ops-email.env` now also carries `PURELYMAIL_API_TOKEN` and is read by a systemd unit rather than only by `daily_ops_email.py`.

- [ ] **Step 10: Reconcile the spec and registry**

Update the spec's `**Status:**` line to record implementation and the date. Register the runbook in `agents/doc_registry.json` with `kind: runbook`, `lifecycle: evergreen`, `section: operations`. Edit the registry with a minimal targeted change: a full `json.dump` at the wrong indent rewrites all 157 entries, so match the existing 4-space indent and verify with `git diff --stat` that only the added lines appear.

- [ ] **Step 11: Commit**

```bash
git add agents/runbooks/runbook-droplet-outbound-mail-2026-08-06.md \
        agents/runbooks/ops-env-reference.md agents/doc_registry.json \
        agents/work-items/droplet-outbound-mail-spec.md
git commit -m "docs: runbook and env reference for droplet outbound mail

Records the sending identity, the two timers, the state files and their
recovery procedure, and the tamezz.com routing constraint, so a later
reader does not remove the exact sysop rule and silently route bounces
into derby's ingest mailbox."
```

- [ ] **Step 12: Cut the release**

The notifier is user-invisible, so this is a patch. Check `main`'s VERSION before bumping, since `release.sh` bumps the local file blind.

```bash
./scripts/release.sh patch
./client/deploy/deploy_to_droplet.sh battlestats.online
```

The client redeploy is mandatory after any version bump, even a backend-only one, because `NEXT_PUBLIC_APP_VERSION` is captured at frontend build time and the footer would otherwise keep showing the old version.

---

## Self-Review

**Spec coverage.** Section 1 identity repair maps to Task 6, including the routing rule the spec added after QA. Section 2's command is Task 4, with the kill switch, the fail-loud path, the credit floor and its independent send all covered by named tests. Section 3's id-set state file is Task 2, and the out-of-order-commit case has its own test in Task 4. Section 4 scheduling is Task 5, following the deploy-script convention QA established rather than the manual install the first draft wrongly assumed. Section 5's shared module is Task 1, with an AST test enforcing the stdlib-only rule that keeps `daily_ops_email.py` venv-free. Section 6's test list is distributed across Tasks 1 to 4. All seven acceptance criteria appear in Task 7, with number 2 marked as an operator step no automation can close.

**Placeholders.** None. Every code step carries the actual code, every verification step names the command and the expected output.

**Type consistency.** `send_email(subject, html_body, text_body)` keeps the signature `daily_ops_email.py` already calls, so Task 1 is a pure move. `_render` returns `(text, html)` and every call site unpacks in that order, while `send_email` takes html before text; the command passes them explicitly in the right positions, and the tests unpack `send.call_args[0]` as `(subject, html, text)` to match. `account_credit` returns `Decimal` and is compared against the `Decimal` constant `CREDIT_FLOOR`. `load_notified_ids` returns `set[int]` and is unioned with a set comprehension over `f.id`.

**API payloads verified.** Both mutating calls in Task 6 were checked against Purelymail's published API schema rather than inferred. `createUser` accepts `userName`, `domainName`, `password`, `enablePasswordReset`, `sendWelcomeEmail` (plus recovery fields this plan does not use); `createRoutingRule` accepts `domainName`, `prefix`, `matchUser`, `targetAddresses`, `catchall`. Both payloads in the plan match exactly. That check also surfaced the welcome-email leak now handled in step 3, which would otherwise have delivered the first message of this whole effort into derby's inbox.

One documented constraint to respect if a step is retried: *"Routing rule must not have the same user/prefix as any other existing rules for the domain."* Re-running step 4 after a success will therefore fail rather than duplicate, which is the safe direction, but it means a retry needs the Step 1 pre-check first to see whether the rule already landed.
