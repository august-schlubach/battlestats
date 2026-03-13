#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "$ROOT_DIR"

echo "[1/4] Ensuring docker services are running"
docker compose up -d db redis rabbitmq server react-app task-runner task-scheduler >/dev/null

echo "[2/4] Running backend test suite"
docker compose exec -T server python manage.py test warships.tests

echo "[3/4] Running frontend production build"
cd "$ROOT_DIR/client"
npm run build

echo "[4/4] Running API smoke tests"
cd "$ROOT_DIR"
docker compose exec -T server python scripts/smoke_test_site_endpoints.py

echo "Full test suite passed"