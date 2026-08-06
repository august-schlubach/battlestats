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
