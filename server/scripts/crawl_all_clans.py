import argparse
import logging
import os
import sys
import django

# ── Django bootstrap ───────────────────────────────────────────────
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "battlestats.settings")
django.setup()

from warships.clan_crawl import run_clan_crawl  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("crawl")


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

    try:
        run_clan_crawl(resume=args.resume, dry_run=args.dry_run, limit=args.limit)
    except RuntimeError as error:
        log.error("%s", error)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
