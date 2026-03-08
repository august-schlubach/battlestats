from unittest.mock import patch

from django.test import TestCase

from warships.api.ships import _fetch_ship_info
from warships.models import Ship


class ShipInfoApiTests(TestCase):
    @patch("warships.api.ships._make_api_request")
    def test_fetch_ship_info_refreshes_incomplete_existing_ship(self, mock_make_api_request):
        Ship.objects.create(
            ship_id=123456789,
            name="",
            nation="",
            ship_type="",
            tier=None,
            is_premium=False,
        )

        mock_make_api_request.return_value = {
            "123456789": {
                "name": "Khabarovsk",
                "nation": "ussr",
                "is_premium": False,
                "type": "Destroyer",
                "tier": 10,
            }
        }

        ship = _fetch_ship_info("123456789")

        self.assertIsNotNone(ship)
        ship.refresh_from_db()
        self.assertEqual(ship.name, "Khabarovsk")
        self.assertEqual(ship.ship_type, "Destroyer")
        self.assertEqual(ship.tier, 10)
        self.assertEqual(ship.nation, "ussr")
        mock_make_api_request.assert_called_once()
