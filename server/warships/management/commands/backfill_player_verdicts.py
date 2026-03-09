from django.core.management.base import BaseCommand

from warships.data import compute_player_verdict
from warships.models import Player


class Command(BaseCommand):
    help = 'Backfill player playstyle verdicts from existing stat fields.'

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
            '--changed-only',
            action='store_true',
            help='Only persist rows whose verdict value changes.',
        )

    def handle(self, *args, **options):
        limit = max(options['limit'], 0)
        batch_size = max(options['batch_size'], 1)
        changed_only = options['changed_only']

        queryset = Player.objects.order_by('id')
        if limit:
            queryset = queryset[:limit]

        processed = 0
        updated = 0

        for player in queryset.iterator(chunk_size=batch_size):
            next_verdict = None if player.is_hidden else compute_player_verdict(
                pvp_battles=player.pvp_battles or 0,
                pvp_ratio=player.pvp_ratio,
                pvp_survival_rate=player.pvp_survival_rate,
            )
            processed += 1

            if changed_only and player.verdict == next_verdict:
                continue

            if player.verdict != next_verdict:
                player.verdict = next_verdict
                player.save(update_fields=['verdict'])
                updated += 1

            if processed % batch_size == 0:
                self.stdout.write(f'Processed {processed} players...')

        self.stdout.write(self.style.SUCCESS(
            f'Backfilled player verdicts for {processed} players; updated {updated}.'))