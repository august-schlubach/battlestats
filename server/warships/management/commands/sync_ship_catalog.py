from django.core.management.base import BaseCommand, CommandError

from warships.api.ships import sync_ship_catalog


class Command(BaseCommand):
    help = "Pull the full WoWS ship catalog locally and populate chart-friendly ship names."

    def add_arguments(self, parser):
        parser.add_argument(
            "--page-size",
            type=int,
            default=100,
            help="WG encyclopedia page size (max 100).",
        )

    def handle(self, *args, **options):
        try:
            result = sync_ship_catalog(page_size=options["page_size"])
        except RuntimeError as error:
            raise CommandError(str(error)) from error

        self.stdout.write(
            self.style.SUCCESS(
                "Processed {processed} ships; created {created}, updated {updated}.".format(
                    **result)
            )
        )
