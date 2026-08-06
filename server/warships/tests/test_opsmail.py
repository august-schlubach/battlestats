"""Tests for the shared stdlib-only outbound mail module."""
import os
import tempfile
from unittest import mock

from django.test import SimpleTestCase

from warships import opsmail


class LoadEnvFileTests(SimpleTestCase):
    def test_parses_keys_and_strips_quotes(self):
        with tempfile.NamedTemporaryFile('w', suffix='.env', delete=False) as fh:
            fh.write('# comment\n\nSMTP_HOST="smtp.example.com"\nSMTP_PORT=465\n')
            path = fh.name
        with mock.patch.dict(os.environ, {}, clear=True):
            opsmail.load_env_file(path)
            self.assertEqual(os.environ['SMTP_HOST'], 'smtp.example.com')
            self.assertEqual(os.environ['SMTP_PORT'], '465')
        os.unlink(path)

    def test_existing_env_wins(self):
        with tempfile.NamedTemporaryFile('w', suffix='.env', delete=False) as fh:
            fh.write('SMTP_HOST=from-file\n')
            path = fh.name
        with mock.patch.dict(os.environ, {'SMTP_HOST': 'from-env'}, clear=True):
            opsmail.load_env_file(path)
            self.assertEqual(os.environ['SMTP_HOST'], 'from-env')
        os.unlink(path)

    def test_missing_file_is_not_an_error(self):
        opsmail.load_env_file('/nonexistent/path/to.env')  # must not raise

    def test_unreadable_file_is_not_an_error(self):
        """Under systemd the env file is mode 600 root-owned: systemd injects the
        values as root, then the unit runs as the app user which cannot read it.
        Raising here would break every timer-driven run. Regression test for a
        PermissionError that took down the first live unit invocation."""
        with tempfile.NamedTemporaryFile('w', suffix='.env', delete=False) as fh:
            fh.write('SMTP_HOST=unreadable\n')
            path = fh.name
        os.chmod(path, 0o000)
        try:
            if os.access(path, os.R_OK):
                self.skipTest('running as root; cannot make a file unreadable')
            with mock.patch.dict(os.environ, {}, clear=True):
                opsmail.load_env_file(path)  # must not raise
                self.assertNotIn('SMTP_HOST', os.environ)
        finally:
            os.chmod(path, 0o600)
            os.unlink(path)


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

    def test_from_header_carries_the_readable_display_name(self):
        with mock.patch.dict(os.environ, self.ENV, clear=True), \
             mock.patch.object(opsmail.smtplib, 'SMTP_SSL') as ssl_cls:
            opsmail.send_email('Subj', '<p>h</p>', 't')
        msg = ssl_cls.return_value.__enter__.return_value.send_message.call_args[0][0]
        self.assertEqual(msg['From'], 'Zeta Region CloudOps <sysop@example.com>')

    def test_from_name_is_overridable_by_env(self):
        env = dict(self.ENV, MAIL_FROM_NAME='Something Else')
        with mock.patch.dict(os.environ, env, clear=True), \
             mock.patch.object(opsmail.smtplib, 'SMTP_SSL') as ssl_cls:
            opsmail.send_email('Subj', '<p>h</p>', 't')
        msg = ssl_cls.return_value.__enter__.return_value.send_message.call_args[0][0]
        self.assertEqual(msg['From'], 'Something Else <sysop@example.com>')

    def test_blank_from_name_falls_back_to_a_bare_address(self):
        env = dict(self.ENV, MAIL_FROM_NAME='')
        with mock.patch.dict(os.environ, env, clear=True), \
             mock.patch.object(opsmail.smtplib, 'SMTP_SSL') as ssl_cls:
            opsmail.send_email('Subj', '<p>h</p>', 't')
        msg = ssl_cls.return_value.__enter__.return_value.send_message.call_args[0][0]
        self.assertEqual(msg['From'], 'sysop@example.com')

    def test_from_name_with_a_comma_is_quoted_not_malformed(self):
        """A bare f-string would split this into two addresses."""
        env = dict(self.ENV, MAIL_FROM_NAME='CloudOps, Zeta Region')
        with mock.patch.dict(os.environ, env, clear=True), \
             mock.patch.object(opsmail.smtplib, 'SMTP_SSL') as ssl_cls:
            opsmail.send_email('Subj', '<p>h</p>', 't')
        msg = ssl_cls.return_value.__enter__.return_value.send_message.call_args[0][0]
        self.assertEqual(msg['From'], '"CloudOps, Zeta Region" <sysop@example.com>')

    def test_non_465_port_uses_starttls(self):
        env = dict(self.ENV, SMTP_PORT='587')
        with mock.patch.dict(os.environ, env, clear=True), \
             mock.patch.object(opsmail.smtplib, 'SMTP') as smtp_cls:
            opsmail.send_email('Subj', '<p>h</p>', 't')
        server = smtp_cls.return_value.__enter__.return_value
        server.starttls.assert_called_once()

    def test_missing_credentials_raises(self):
        env = dict(self.ENV)
        env.pop('SMTP_PASS')
        with mock.patch.dict(os.environ, env, clear=True):
            with self.assertRaises(RuntimeError):
                opsmail.send_email('S', '<p>h</p>', 't')

    def test_module_imports_no_django(self):
        """The no-venv guarantee: daily_ops_email.py imports this under bare python3."""
        import ast
        import pathlib
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
