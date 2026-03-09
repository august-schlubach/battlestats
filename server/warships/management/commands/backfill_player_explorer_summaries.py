from django.core.management.base import BaseCommand

from warships.data import refresh_player_explorer_summary
from warships.models import Player


class Command(BaseCommand):
    help = 'Backfill denormalized player explorer summary rows from existing player JSON/stat fields.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--limit',
            type=int,
            default=0,
            help='Optional maximum number of players to process.',
        )
        parser.add_argument(
            '--batch-size',
            type=int,
            default=500,
            help='Iterator batch size for player fetches.',
        )
        parser.add_argument(
            '--missing-only',
            action='store_true',
            help='Only process players that do not already have an explorer summary row.',
        )

    def handle(self, *args, **options):
        limit = max(options['limit'], 0)
        batch_size = max(options['batch_size'], 1)
        missing_only = options['missing_only']

        queryset = Player.objects.select_related(
            'explorer_summary').order_by('id')
        if missing_only:
            queryset = queryset.filter(explorer_summary__isnull=True)
        if limit:
            queryset = queryset[:limit]

        processed = 0
        for player in queryset.iterator(chunk_size=batch_size):
            refresh_player_explorer_summary(player)
            processed += 1

            if processed % batch_size == 0:
                self.stdout.write(f'Processed {processed} players...')

        self.stdout.write(self.style.SUCCESS(
            f'Backfilled explorer summaries for {processed} players.'))
