"""Tests for the Purelymail account-credit read."""
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
