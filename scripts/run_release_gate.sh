#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# shellcheck source=lib/local_prereqs.sh
source "${ROOT_DIR}/scripts/lib/local_prereqs.sh"
MAIN_CHECKOUT="$(bs_main_checkout || echo "${ROOT_DIR}")"

# This project's venv lives at server/.venv (see CLAUDE.md), not the repo root, so
# the root-only lookup never matched and the gate silently fell back to whatever
# `python` the shell resolved — a pyenv with no pytest, which failed the release
# at step 4 of 4, after the client build had already run. Root stays first for any
# checkout that does place a venv there.
#
# Both candidates were ROOT_DIR-relative, which fixed only the main checkout: a
# linked worktree has no venv at all, so the original failure reproduced there
# unchanged. The main checkout is now the last resort — a venv's bin/python is an
# absolute interpreter path and runs fine against another tree's source.
# THERE IS NO BARE `python` FALLBACK. Silently choosing an interpreter means the
# gate can report on an environment nobody asked about, which is worse than
# failing. Runbook: agents/runbooks/runbook-worktree-local-prereqs-2026-08-13.md
DEFAULT_PYTHON_BIN=""
for candidate in \
    "${ROOT_DIR}/.venv/bin/python" \
    "${ROOT_DIR}/server/.venv/bin/python" \
    "${MAIN_CHECKOUT}/.venv/bin/python" \
    "${MAIN_CHECKOUT}/server/.venv/bin/python"; do
  if [[ -x "${candidate}" ]]; then
    DEFAULT_PYTHON_BIN="${candidate}"
    break
  fi
done

PYTHON_BIN="${PYTHON_BIN:-${DEFAULT_PYTHON_BIN}}"

# Preflight BEFORE step 1. A worktree previously discovered node_modules at step
# 1 and, once that was fixed, the interpreter at step 4 — the serial rediscovery
# this exists to end. node_modules is preflight-only: npm resolves it from its own
# working directory and the gate must lint THIS tree's source, so the main
# checkout's copy cannot be borrowed.
bs_require_prereqs "release gate" \
  "${ROOT_DIR}/client/node_modules|(cd ${ROOT_DIR}/client && npm ci)" \
  "${PYTHON_BIN:-${MAIN_CHECKOUT}/server/.venv/bin/python}|python -m venv ${MAIN_CHECKOUT}/server/.venv \&\& ${MAIN_CHECKOUT}/server/.venv/bin/pip install -r ${MAIN_CHECKOUT}/server/requirements.txt"

echo "Release gate interpreter: ${PYTHON_BIN}"

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