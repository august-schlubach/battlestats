#!/usr/bin/env bash
# local_prereqs.sh — resolve and validate the untracked material our scripts need.
#
# THE PROBLEM. Every deploy/ops script resolves its own root from BASH_SOURCE, so
# a script invoked from a git worktree looks for its prerequisites *inside that
# worktree*. Git never populates gitignored files in a linked worktree, so all 22
# linked trees are structurally missing server/.env.cloud, .env.secrets.cloud,
# ca-certificate.crt, server/.venv and client/node_modules.
#
# This recurred three times. Commit 171abb9 (2026-07-30) documented it, and the
# 2026-08-12 v5.3.5 deploy still failed twice in a row on it; run_release_gate.sh
# widened its venv lookup but kept it ROOT_DIR-relative, so the original failure
# reproduces unchanged in every worktree. Prose and a longer path list are not
# checks. Only something that runs at invocation and reports EVERY missing item
# at once can stop the serial rediscovery.
#
# TWO KINDS OF PREREQUISITE, and the difference matters:
#   * path-resolvable — the consumer reads an explicit path (scp'd env files, the
#     CA cert, a venv's bin/python). bs_resolve_prereq falls back to the main
#     checkout for these, so a worktree needs no provisioning at all.
#   * preflight-only — client/node_modules. npm resolves node_modules from its own
#     working directory and the gate must lint the WORKTREE's source, so a
#     main-checkout copy cannot be pointed at, and symlinking is ruled out
#     (hardlink-not-symlink constraint). Detected and reported, never resolved.
#
# Runbook: agents/runbooks/runbook-worktree-local-prereqs-2026-08-13.md
#
# Usage:
#   source "${REPO_ROOT}/scripts/lib/local_prereqs.sh"
#   MAIN="$(bs_main_checkout)"
#   ENV_FILE="$(bs_resolve_prereq "${SERVER_DIR}/.env.cloud" "${MAIN}/server/.env.cloud")"
#   bs_require_prereqs "backend deploy" "<path>|<recovery hint>" ...

# Absolute path to the MAIN checkout, from anywhere in the repo.
# `--git-common-dir` points at the shared .git for both a main checkout and a
# linked worktree, so its parent is always the main checkout.
bs_main_checkout() {
    local common
    common="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" || return 1
    [[ -n "${common}" ]] || return 1
    dirname "${common}"
}

# bs_resolve_prereq <preferred_path> [fallback_path]
# Echo the first path that exists. Tree-local wins, so a deliberate per-worktree
# override still takes precedence over the main checkout's copy.
bs_resolve_prereq() {
    local preferred="${1:-}" fallback="${2:-}"
    if [[ -n "${preferred}" && -e "${preferred}" ]]; then
        printf '%s\n' "${preferred}"
        return 0
    fi
    if [[ -n "${fallback}" && -e "${fallback}" ]]; then
        printf '%s\n' "${fallback}"
        return 0
    fi
    return 1
}

# bs_require_prereqs <label> <spec>...
#   spec = "<path>|<recovery hint>"
# Reports EVERY missing prerequisite in one pass, then fails. The whole point:
# on 2026-08-12 the deploy died at scp #1, was fixed, died at scp #2, was fixed,
# then ran — three invocations, each re-running the CI check and the rsync.
bs_require_prereqs() {
    local label="${1:-prerequisites}"
    shift || true
    local -a missing=()
    local spec path

    for spec in "$@"; do
        path="${spec%%|*}"
        [[ -e "${path}" ]] || missing+=("${spec}")
    done

    if [[ ${#missing[@]} -eq 0 ]]; then
        return 0
    fi

    {
        printf '\n'
        printf 'Cannot run the %s: %d required local file(s) missing.\n' \
            "${label}" "${#missing[@]}"
        printf 'These are gitignored, so a linked worktree never receives them.\n\n'
        for spec in "${missing[@]}"; do
            printf '  missing: %s\n' "${spec%%|*}"
            printf '  fix    : %s\n\n' "${spec#*|}"
        done
        printf 'Fix all of the above, then re-run once.\n'
        printf 'Runbook: agents/runbooks/runbook-worktree-local-prereqs-2026-08-13.md\n\n'
    } >&2

    return 1
}
