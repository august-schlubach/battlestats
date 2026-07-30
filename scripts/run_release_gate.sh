#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEFAULT_PYTHON_BIN="python"

if [[ -x "${ROOT_DIR}/.venv/bin/python" ]]; then
  DEFAULT_PYTHON_BIN="${ROOT_DIR}/.venv/bin/python"
fi

PYTHON_BIN="${PYTHON_BIN:-${DEFAULT_PYTHON_BIN}}"

# The FULL backend suite, not a curated subset. It ran as a hand-picked 3-file
# slice (142 tests) back when the suite took ~17 minutes locally — a cost that
# turned out to be RabbitMQ connection-retry timeouts, not real work (see
# server/conftest.py). With the in-memory broker the whole 850-test suite
# finishes in ~5s, so the subset bought nothing and left ~700 tests out of the
# gate. This now matches what CI runs, so the gate and CI can no longer
# disagree about what "green" means.
#
# No -x: surface every failure in one pass, same as CI. The env below is
# belt-and-braces — conftest.py defaults the Celery values now — but it
# documents intent at the call site and survives that file changing.
run_backend_release_tests() {
  local sqlite_dir="${ROOT_DIR}/.tmp"
  local sqlite_db="${sqlite_dir}/release-gate.sqlite3"

  (
    mkdir -p "${sqlite_dir}"
    rm -f "${sqlite_db}"
    cd "${ROOT_DIR}/server"
    DB_ENGINE=sqlite3 \
    DB_NAME="${sqlite_db}" \
    DB_SSLMODE='' \
    DB_SSLROOTCERT='' \
    DJANGO_SECRET_KEY=release-gate-test-secret-key \
    REDIS_URL='' \
    CELERY_BROKER_URL=memory:// \
    CELERY_RESULT_BACKEND=cache+memory:// \
      "${PYTHON_BIN}" -m pytest --nomigrations \
        warships/tests/ \
        --tb=short
  )
}

echo "[1/4] Running client lint"
(
  cd "${ROOT_DIR}/client"
  npm run lint
)

echo "[2/4] Running client release tests"
(
  cd "${ROOT_DIR}/client"
  npm run test:ci
)

echo "[3/4] Running client production build"
(
  cd "${ROOT_DIR}/client"
  npm run build
)

echo "[4/4] Running server release tests"
run_backend_release_tests

echo "Release gate passed"