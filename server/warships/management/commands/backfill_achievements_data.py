from __future__ import annotations

from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db.models import Q
from django.utils import timezone

from warships.data import update_achievements_data
from warships.models import Player


class Command(BaseCommand):
    help = 'Backfill or refresh curated player combat achievements.'

    def add_arguments(self, parser):
        parser.add_argument('--player-id', type=int,
                            help='Optional single WoWS player_id to refresh.')
        parser.add_argument('--limit', type=int, default=0,
                            help='Optional maximum number of players to process.')
        parser.add_argument('--batch-size', type=int, default=100,
                            help='Iterator batch size and progress interval.')
        parser.add_argument('--force', action='store_true',
                            help='Refresh all players in scope even if achievements already exist.')
        parser.add_argument('--only-missing', action='store_true',
                            help='Refresh only players missing achievements_json or achievements_updated_at.')
        parser.add_argument('--older-than-hours', type=int, default=0,
                            help='Refresh players with stale achievements older than this many hours.')
        parser.add_argument('--include-hidden', action='store_true',
                            help='Include hidden players instead of defaulting to visible players only.')

    def handle(self, *args, **options):
        player_id = options.get('player_id')
        limit = max(int(options.get('limit') or 0), 0)
        batch_size = max(int(options.get('batch_size') or 100), 1)
        force = bool(options.get('force'))
        only_missing = bool(options.get('only_missing'))
        older_than_hours = max(int(options.get('older_than_hours') or 0), 0)
        include_hidden = bool(options.get('include_hidden'))

        queryset = Player.objects.exclude(
            player_id__isnull=True).order_by('id')
        if player_id:
            queryset = queryset.filter(player_id=player_id)
        if not include_hidden:
            queryset = queryset.filter(is_hidden=False)

        stale_cutoff = None
        if older_than_hours > 0:
            stale_cutoff = timezone.now() - timedelta(hours=older_than_hours)

        if not force:
            if only_missing or stale_cutoff is None:
                queryset = queryset.filter(
                    Q(achievements_json__isnull=True) |
                    Q(achievements_updated_at__isnull=True)
                )
            else:
                queryset = queryset.filter(
                    Q(achievements_updated_at__isnull=True) |
                    Q(achievements_updated_at__lt=stale_cutoff)
                )

        processed = 0
        for player in queryset.iterator(chunk_size=batch_size):
            update_achievements_data(player.player_id, force_refresh=True)
            processed += 1
            if processed % batch_size == 0:
                self.stdout.write(f'Processed {processed} players...')
            if limit and processed >= limit:
                break

        self.stdout.write(self.style.SUCCESS(
            f'Achievements backfill complete: processed={processed}'
        ))
