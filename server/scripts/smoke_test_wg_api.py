#!/usr/bin/env python3
import json
import os
import sys

import requests


API_BASE_URL = "https://api.worldofwarships.com/wows/"
SMOKE_ENDPOINT = "encyclopedia/info/"


def main() -> int:
    app_id = os.getenv("WG_APP_ID")

    if not app_id:
        print("SMOKE TEST FAILED: WG_APP_ID is not set")
        return 1

    params = {"application_id": app_id}

    try:
        response = requests.get(
            API_BASE_URL + SMOKE_ENDPOINT,
            params=params,
            timeout=20,
        )
        response.raise_for_status()
    except requests.RequestException as error:
        print(f"SMOKE TEST FAILED: request error: {error}")
        return 1

    try:
        payload = response.json()
    except json.JSONDecodeError as error:
        print(f"SMOKE TEST FAILED: invalid JSON response: {error}")
        return 1

    status = payload.get("status")
    if status != "ok":
        error_info = payload.get("error", {})
        print(
            "SMOKE TEST FAILED: API returned non-ok status "
            f"status={status!r}, error={error_info}"
        )
        return 1

    data = payload.get("data")
    if not isinstance(data, dict) or not data:
        print("SMOKE TEST FAILED: response data is empty or invalid")
        return 1

    print("SMOKE TEST PASSED: Warships API reachable and WG_APP_ID accepted")
    print(f"Endpoint: {API_BASE_URL + SMOKE_ENDPOINT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
