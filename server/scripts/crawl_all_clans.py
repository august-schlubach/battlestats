#!/usr/bin/env python3
"""
Crawl all WoWs clans and their members from the Wargaming API.

Flow:
  1. Paginate clans/list/ to harvest every clan_id (~352 pages of 100)
  2. For each clan, fetch member IDs via clans/info/?fields=members_ids
  3. Bulk-fetch player stats via account/info/ (up to 100 IDs per request)

Usage:
  cd server/
  DJANGO_SETTINGS_MODULE=battlestats.settings DJANGO_SECRET_KEY=<key> \
    python scripts/crawl_all_clans.py [--resume] [--dry-run] [--limit N]

Options:
  --resume   Skip clans already in the database
  --dry-run  Crawl clan list only, don't fetch members or players
  --limit N  Stop after N clans (useful for testing)
"""

import argparse
import logging
import os
import sys
import time
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional

import django
import requests

# ── Django bootstrap ───────────────────────────────────────────────
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "battlestats.settings")
django.setup()

from django.conf import settings as django_settings  # noqa: E402
from warships.models import Clan, Player  # noqa: E402


def _now():
    """Return timezone-aware or naive datetime depending on Django USE_TZ."""
    if getattr(django_settings, "USE_TZ", False):
        return datetime.now(timezone.utc)
    return datetime.now()


def _from_ts(ts):
    """Convert a UNIX timestamp to datetime matching Django USE_TZ setting."""
    if getattr(django_settings, "USE_TZ", False):
        return datetime.fromtimestamp(ts, tz=timezone.utc)
    return datetime.fromtimestamp(ts)


# ── Config ─────────────────────────────────────────────────────────
BASE_URL = "https://api.worldofwarships.com/wows/"
APP_ID = os.environ.get("WG_APP_ID")
REQUEST_TIMEOUT = 20
PAGE_SIZE = 100  # max allowed by the API
RATE_LIMIT_DELAY = 0.25  # seconds between API calls
BATCH_SIZE = 100  # max account IDs per account/info/ call

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("crawl")


# ── API helpers ────────────────────────────────────────────────────
def _api_get(endpoint: str, params: Dict) -> Optional[Dict]:
    """Make a GET request to the WG API with rate-limiting."""
    time.sleep(RATE_LIMIT_DELAY)
    params["application_id"] = APP_ID
    try:
        resp = requests.get(
            BASE_URL + endpoint, params=params, timeout=REQUEST_TIMEOUT
        )
        resp.raise_for_status()
        body = resp.json()
    except requests.RequestException as exc:
        log.error("Request failed for %s: %s", endpoint, exc)
        return None
    except ValueError as exc:
        log.error("Bad JSON from %s: %s", endpoint, exc)
        return None

    if body.get("status") != "ok":
        log.error("API error for %s: %s", endpoint, body.get("error"))
        return None

    return body


def fetch_clan_list_page(page: int) -> tuple[List[Dict], int]:
    """Return (list-of-clan-dicts, total_pages) for one page of clans/list/."""
    body = _api_get(
        "clans/list/",
        {
            "fields": "clan_id,tag,name,members_count",
            "page_no": page,
            "limit": PAGE_SIZE,
        },
    )
    if body is None:
        return [], 0

    total = body.get("meta", {}).get("total", 0)
    total_pages = (total + PAGE_SIZE - 1) // PAGE_SIZE
    return body.get("data", []) or [], total_pages


def fetch_member_ids(clan_id: int) -> List[int]:
    """Fetch members_ids for a single clan."""
    body = _api_get(
        "clans/info/",
        {"clan_id": clan_id, "fields": "members_ids"},
    )
    if body is None:
        return []
    clan_data = body.get("data", {}).get(str(clan_id)) or {}
    return clan_data.get("members_ids", []) or []


def fetch_clan_info(clan_id: int) -> Dict:
    """Fetch full clan metadata."""
    body = _api_get(
        "clans/info/",
        {
            "clan_id": clan_id,
            "fields": "members_count,tag,name,clan_id,description,leader_id,leader_name",
        },
    )
    if body is None:
        return {}
    return body.get("data", {}).get(str(clan_id)) or {}


def fetch_players_bulk(player_ids: List[int]) -> Dict:
    """Bulk-fetch player data for up to 100 IDs at once."""
    if not player_ids:
        return {}
    body = _api_get(
        "account/info/",
        {"account_id": ",".join(str(pid) for pid in player_ids)},
    )
    if body is None:
        return {}
    return body.get("data", {}) or {}


# ── Persistence helpers ────────────────────────────────────────────
def save_clan(info: Dict) -> Clan:
    """Create or update a Clan row."""
    clan, _ = Clan.objects.update_or_create(
        clan_id=info["clan_id"],
        defaults={
            "name": info.get("name", ""),
            "tag": info.get("tag", ""),
            "members_count": info.get("members_count", 0),
            "description": info.get("description", ""),
            "leader_id": info.get("leader_id"),
            "leader_name": info.get("leader_name", ""),
            "last_fetch": _now(),
        },
    )
    return clan


def save_player(player_data: Dict, clan: Clan) -> None:
    """Create or update a Player row from account/info/ response data."""
    if player_data is None:
        return

    pid = player_data.get("account_id")
    if not pid:
        return

    player, created = Player.objects.get_or_create(player_id=pid)
    player.name = player_data.get("nickname", player.name or "")
    player.clan = clan

    player.creation_date = (
        _from_ts(player_data["created_at"])
        if player_data.get("created_at")
        else player.creation_date
    )
    player.last_battle_date = (
        _from_ts(player_data["last_battle_time"]).date()
        if player_data.get("last_battle_time")
        else player.last_battle_date
    )

    if player.last_battle_date:
        player.days_since_last_battle = (
            _now().date() - player.last_battle_date
        ).days

    if player_data.get("hidden_profile"):
        player.is_hidden = True
    else:
        player.is_hidden = False
        stats = player_data.get("statistics") or {}
        pvp = stats.get("pvp") or {}
        player.total_battles = stats.get("battles", 0)
        player.pvp_battles = pvp.get("battles", 0)
        player.pvp_wins = pvp.get("wins", 0)
        player.pvp_losses = pvp.get("losses", 0)
        if player.pvp_battles > 0:
            player.pvp_ratio = round(
                player.pvp_wins / player.pvp_battles * 100, 2)
        player.pvp_survival_rate = (
            round(pvp.get("survived_battles", 0) / pvp["battles"] * 100, 2)
            if pvp.get("battles")
            else None
        )

    player.last_fetch = _now()
    player.save()


# ── Main crawl logic ──────────────────────────────────────────────
def crawl_clan_ids(limit: Optional[int] = None) -> List[Dict]:
    """Step 1: paginate clans/list/ to collect all clan stubs."""
    all_clans: List[Dict] = []
    page = 1

    first_batch, total_pages = fetch_clan_list_page(page)
    if not first_batch:
        log.error("Failed to fetch first page of clans/list/")
        return []

    all_clans.extend(first_batch)
    log.info("Page 1/%d — %d clans (total pages: %d)",
             total_pages, len(first_batch), total_pages)

    for page in range(2, total_pages + 1):
        if limit and len(all_clans) >= limit:
            break
        batch, _ = fetch_clan_list_page(page)
        if not batch:
            log.warning("Empty page %d, stopping pagination", page)
            break
        all_clans.extend(batch)
        if page % 50 == 0:
            log.info("Page %d/%d — %d clans so far",
                     page, total_pages, len(all_clans))

    if limit:
        all_clans = all_clans[:limit]

    log.info("Collected %d clan IDs", len(all_clans))
    return all_clans


def crawl_clan_members(clan_stubs: List[Dict], resume: bool = False) -> None:
    """Steps 2-3: for each clan, fetch members and bulk-load player data."""
    total = len(clan_stubs)
    clans_processed = 0
    players_saved = 0
    skipped = 0

    for i, stub in enumerate(clan_stubs, 1):
        clan_id = stub["clan_id"]

        if resume and Clan.objects.filter(clan_id=clan_id, last_fetch__isnull=False).exists():
            skipped += 1
            continue

        # Fetch full clan info and save
        info = fetch_clan_info(clan_id)
        if not info:
            log.warning("[%d/%d] Failed to fetch info for clan %d",
                        i, total, clan_id)
            continue

        clan = save_clan(info)
        members_count = info.get("members_count", 0)

        if members_count == 0:
            clans_processed += 1
            continue

        # Fetch member IDs
        member_ids = fetch_member_ids(clan_id)
        if not member_ids:
            log.warning("[%d/%d] No member IDs for [%s] %s",
                        i, total, clan.tag, clan.name)
            clans_processed += 1
            continue

        # Bulk-fetch player data in batches of BATCH_SIZE
        for batch_start in range(0, len(member_ids), BATCH_SIZE):
            batch_ids = member_ids[batch_start: batch_start + BATCH_SIZE]
            player_map = fetch_players_bulk(batch_ids)

            for pid_str, pdata in player_map.items():
                save_player(pdata, clan)
                players_saved += 1

        clans_processed += 1
        if clans_processed % 25 == 0:
            log.info(
                "[%d/%d] Processed %d clans, %d players saved, %d skipped",
                i, total, clans_processed, players_saved, skipped,
            )

    log.info(
        "Done. Clans processed: %d, skipped: %d, players saved: %d",
        clans_processed, skipped, players_saved,
    )


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Crawl all WoWs clans and players")
    parser.add_argument("--resume", action="store_true",
                        help="Skip clans already fetched")
    parser.add_argument("--dry-run", action="store_true",
                        help="Only crawl clan list, no members")
    parser.add_argument("--limit", type=int, default=None,
                        help="Max clans to process")
    args = parser.parse_args()

    if not APP_ID:
        log.error("WG_APP_ID environment variable is not set")
        return 1

    log.info("Starting crawl (resume=%s, dry_run=%s, limit=%s)",
             args.resume, args.dry_run, args.limit)

    clan_stubs = crawl_clan_ids(limit=args.limit)
    if not clan_stubs:
        return 1

    if args.dry_run:
        log.info("Dry run complete — %d clans found", len(clan_stubs))
        return 0

    crawl_clan_members(clan_stubs, resume=args.resume)
    return 0


if __name__ == "__main__":
    sys.exit(main())
