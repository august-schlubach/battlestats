# Runbook — Worktree-missing local prerequisites (2026-08-13)

_Created: 2026-08-13_
_Context: the 2026-08-12 v5.3.5 backend deploy failed twice in a row on gitignored files absent from the worktree it was invoked from, which is the third recorded occurrence of the same failure class._
_QA: reviewed 2026-08-13 — see QA Notes._
_Status: **IMPLEMENTED 2026-08-13** — 1,191 backend tests pass; 14 new. Both mechanisms demonstrated live with the worktree's copied secrets deleted._

## QA Notes

_Reviewed 2026-08-13 against `/home/august/code/battlestats/.claude/worktrees/recapture-upstream-guard` (linked worktree, branch `worktree-recapture-upstream-guard`). 17 assertions checked, 3 corrected._

### Resolved

- **"client build / `client/deploy/deploy_to_droplet.sh` requires `client/node_modules`"** -> actual: the client deploy **excludes** `node_modules` from its rsync (`client/deploy/deploy_to_droplet.sh:45`) and runs `npm ci` + `npm run build` **on the droplet** inside the ssh heredoc (`:85-86`) -> the client deploy needs nothing local and is not part of this failure class. Removed from the requirements table and from the Implementation table; `client/node_modules` reattributed to `scripts/run_release_gate.sh:55,62,69`, which runs `npm run lint` / `test:ci` / `build` in `${ROOT_DIR}/client`.
- **"the gate fails at step 4 of 4, behind client lint, client tests and the production build"** -> actual: this worktree has no `client/node_modules` at all, so `npm run lint` fails at **step 1 of 4** (`scripts/run_release_gate.sh:54-58`) -> the step-4 failure is the *main-checkout* history quoted in the script's own comment, where `node_modules` exists and only the interpreter was wrong. Body now distinguishes the two, and the correction strengthens rather than weakens the argument: the two prerequisites are discovered serially, one behind the other.
- **"resolve untracked prerequisites from the main checkout"** applied uniformly -> actual: `npm` resolves `node_modules` from its own working directory and the gate must lint the *worktree's* source, so a main-checkout copy cannot be pointed at; symlinking is ruled out by the hardlink-not-symlink constraint -> Decision 1 now splits the prerequisites into **path-resolvable** (`.env.cloud`, `.env.secrets.cloud`, `ca-certificate.crt`, the venv interpreter — an absolute `bin/python` runs fine against another tree's source, as this whole session did) and **preflight-only** (`node_modules`, reported with `npm ci` as recovery, never resolved). Without this split the helper would have had a method that silently does nothing useful for one of its callers.
- **Ambiguity: where do tests for a repo-root shell helper live?** -> resolved from the codebase rather than escalated: CI runs only `python -m pytest warships/tests/` (`.github/workflows/ci.yml:165`), so a test anywhere else would never execute. `server/warships/tests/test_local_prereqs.py` driving the helper via `subprocess` is the only placement CI enforces.
- **Ambiguity: is deploying from a worktree supported?** -> resolved: nothing in either deploy script or `agents/runbooks/` restricts it, and `server/deploy/deploy_to_droplet.sh` already asserts "local tree is at or ahead of origin/main" plus a CI-status gate — checks that are only meaningful if the script runs from an arbitrary tree. Main-checkout resolution is therefore consistent with existing intent, not a new policy.

### Unverified

- `reference_frontend_visual_verify_recipe` (the hardlink-not-symlink constraint on `node_modules`) is an assistant memory file outside this repository, so its content cannot be checked from a checkout. It is cited as the reason symlinking `node_modules` is rejected; the decision does not depend on it, since npm's working-directory resolution already rules the approach out.
- Whether main-checkout resolution behaves correctly on a **fresh dev box with no main checkout populated** is untested — `git rev-parse --git-common-dir` would resolve, but the files would be absent in both locations. The preflight is what covers this case, and it is the same message either way.

## Purpose

Two things live here. First, why deploys and the release gate keep failing on missing local material when run from a git worktree, and why the two previous fixes could not stop it. Second, the contract of the fix: resolve untracked prerequisites from the **main checkout**, and validate **all** of them at invocation instead of one at a time at point of use.

Read this before invoking a deploy or the release gate from a worktree, when a script dies on `stat local: No such file or directory`, or before adding any new local-file dependency to a script.

## The failure class

Every deploy and ops script resolves its own root from `BASH_SOURCE`:

```bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"      # server/deploy/deploy_to_droplet.sh:5-7
```

So a script invoked from a worktree looks for its prerequisites *inside that worktree*. Git never populates gitignored files in a linked worktree. As of 2026-08-13 there are **22 linked worktrees plus main** (`git worktree list`), so 22 of 23 trees are structurally missing everything below.

### What is actually required (from the scripts, not from `.gitignore`)

| Consumer | Requires |
|---|---|
| `server/deploy/deploy_to_droplet.sh:87-89` | `server/.env.cloud`, `server/.env.secrets.cloud`, `server/ca-certificate.crt` |
| `scripts/run_release_gate.sh:55,62,69` (steps 1–3) | `client/node_modules` |
| `scripts/run_release_gate.sh:12` (step 4) | a venv at `.venv/bin/python` or `server/.venv/bin/python` |
| `server/scripts/switch_db_target.sh:64-67` | `server/.env.$TARGET`, `server/.env.secrets.$TARGET` |

**`client/deploy/deploy_to_droplet.sh` needs nothing local.** It excludes `node_modules` from the rsync (`:45`) and runs `npm ci && npm run build` **on the droplet** inside the ssh heredoc (`:85-86`). It is not part of this failure class and is not touched by this tranche.

This list is deliberately **narrower than `.gitignore`**. `server/.env.example` is tracked, and `server/.env.local-postgres.backup` is required by nothing; provisioning them would make the problem look larger than it is.

### Two distinct harms

1. **Fail-late, fail-serially.** Nothing is validated up front, so each missing item surfaces at its own point of use, after work has already been done. The 2026-08-12 deploy failed at `scp` #1, was fixed, failed at `scp` #2, was fixed, then ran — three invocations, each re-running the CI check and rsync. The release gate has the same shape: a worktree hits `node_modules` at step 1, and only *after* that is fixed does it reach the venv problem at step 4.
2. **Silent interpreter selection.** `run_release_gate.sh` falls back to bare `python` when it finds no venv (`:12-19`), so *which interpreter ran* is never stated. The narrower risk is a tree whose fallback python happens to have pytest but different dependencies — that would produce a green or red result about the wrong environment, which is worse than failing.

Reproduced 2026-08-13 in `.claude/worktrees/recapture-upstream-guard`: no `client/node_modules`, neither venv candidate exists, `command -v python` is `/home/august/.pyenv/shims/python`, and `import pytest` raises `ModuleNotFoundError`.

**Where each tree actually fails.** In a worktree the gate dies at **step 1 of 4** (`npm run lint`, no `node_modules`) — loud and cheap. The "step 4 of 4, after the client build had already run" failure recorded in the script's own comment is the **main-checkout** history, where `node_modules` exists and only the interpreter was wrong. Both are the same defect discovered at different depths, which is exactly the serial-discovery pattern this runbook exists to end.

## Why the two previous fixes did not hold

- **Commit `171abb9` (2026-07-30)** documented this exact gap in `ops-env-reference.md`, naming the recovery command and stating that "a git worktree ... needs its own copy, exactly like the `.cloud` env files." Accurate, and it did not prevent the 2026-08-12 recurrence: **a doc cannot stop `scp` from failing.**
- **`run_release_gate.sh`** was fixed by widening the venv lookup from one candidate to two. Its own comment records the original symptom precisely — silent fallback to a pytest-less pyenv python, failing "at step 4 of 4, after the client build had already run." Both candidates are still `ROOT_DIR`-relative, so the fix applies **only to the main checkout** and the original failure reproduces unchanged in every worktree.

**The lesson that drives the design:** prose and a widened path list are not checks. Only a check that runs at invocation and reports *every* missing item at once can prevent recurrence.

## Decisions

### 1. Resolve untracked prerequisites from the main checkout

`git rev-parse --path-format=absolute --git-common-dir` returns `/home/august/code/battlestats/.git` from inside a linked worktree; its parent is the main checkout. Verified 2026-08-13 from this worktree.

Lookup order for each prerequisite: **the invoking tree first, the main checkout as fallback.** Tree-local wins so a deliberate per-worktree override still works.

**This works only for prerequisites a script reads by path, and `client/node_modules` is not one of them.** `.env.cloud`, `.env.secrets.cloud` and `ca-certificate.crt` are `scp`'d from an explicit path, and a venv's `bin/python` is an absolute interpreter path that runs fine against another tree's source (this session ran the whole suite that way). But `npm` resolves `node_modules` from its own working directory, and the gate must lint *the worktree's* code — so pointing it at the main checkout's copy is not possible, and symlinking is ruled out by the hardlink-not-symlink constraint on `node_modules`. `node_modules` is therefore **preflight-only**: detected and reported with `npm ci` as the recovery, never resolved.

Evidence this matches intent: `deploy_to_droplet.sh` already asserts "local tree is at or ahead of origin/main" and gates on CI status — checks that only make sense if the script is expected to run from wherever the operator happens to be. Nothing in the scripts or `agents/runbooks/` requires the main checkout.

**Stated tradeoff.** A deploy from any worktree will write `/etc/battlestats-server.env` and `/etc/battlestats-server.secrets.env` on production from the **main checkout's** `.cloud` files. That is almost certainly correct — these are machine-level config for a single production target, not branch content, and the alternative (per-worktree copies) means 22 duplicates of the same secrets drifting apart. But it is a silent coupling on the code path that mutates production credentials, so it is recorded here as a deliberate decision rather than a side effect.

Rejected alternative: **provisioning each worktree** with copies or symlinks. Strictly worse — duplicates secrets 22 times, needs re-running on every credential rotation, and `client/node_modules` carries a known hardlink-not-symlink constraint (`reference_frontend_visual_verify_recipe`).

### 2. Preflight every prerequisite at invocation

Before the CI check, the rsync, or the client build, each script validates its whole prerequisite set and — on failure — prints **every** missing item with its recovery command, then exits non-zero. Three round trips collapse to one message.

### 3. The release gate fails loudly on a missing interpreter

No silent fallback to bare `python`. If neither venv resolves (tree-local or main-checkout), the gate reports what it looked for and exits, before running client lint.

### 4. Not done

- No change to what the scripts deploy, nor to any production behavior.
- `switch_db_target.sh` is left alone this tranche: it is interactive, main-checkout-only in practice, and its `.env.$TARGET` files are a different (local dev) concern.

## Implementation

| File | Change |
|---|---|
| `scripts/lib/local_prereqs.sh` | New shared helper: `bs_main_checkout`, `bs_resolve_prereq` (path-resolvable items), `bs_require_prereqs` (preflight, collects every miss) |
| `server/deploy/deploy_to_droplet.sh` | Source the helper; preflight the three files; resolve each via the helper |
| `scripts/run_release_gate.sh` | Preflight `client/node_modules` **and** the venv before step 1; resolve both through the helper; fail loudly instead of falling back to bare `python` |
| `server/warships/tests/test_local_prereqs.py` | New — drives the shell helper via `subprocess` |
| `agents/runbooks/ops-env-reference.md` | Reconcile the 2026-07-30 "each worktree needs its own copy" guidance |
| `CLAUDE.md` | One clause |

Tests live under `server/warships/tests/` despite covering a repo-root shell helper, because that is the only suite CI runs (`.github/workflows/ci.yml:165` → `pytest warships/tests/`). A shell helper with no test is what let this regress twice.

## Validation

Implemented 2026-08-13. Each test watched failing first — 10 of the 14 failed as a group before the helper existed. **Result: 1,191 passed, 2 skipped**, via `server/warships/tests/test_local_prereqs.py`.

Covered by tests: `bs_main_checkout` resolves the main checkout from inside a linked worktree; `bs_resolve_prereq` prefers tree-local, falls back to main, fails when neither has it; `bs_require_prereqs` reports **every** missing item (not just the first), exits non-zero on any miss and zero when all resolve, and accepts directories as well as files; the gate has no `DEFAULT_PYTHON_BIN="python"` fallback and preflights before `[1/4]`; the deploy preflights before both the CI gate and the rsync, and its three `scp`s ship resolved paths rather than `${SERVER_DIR}/…`; `bash -n` clean on every touched script.

**Demonstrated live, not just unit-tested.** The three secrets copied into this worktree on 2026-08-12 were **deleted**, and then:

```
main: /home/august/code/battlestats
  server/.env.cloud        -> /home/august/code/battlestats/server/.env.cloud
  server/.env.secrets.cloud -> /home/august/code/battlestats/server/.env.secrets.cloud
  server/ca-certificate.crt -> /home/august/code/battlestats/server/ca-certificate.crt
```

The release gate, run from this worktree, now stops before step 1 with one actionable message instead of an opaque `npm` error followed by an interpreter failure at step 4:

```
Cannot run the release gate: 1 required local file(s) missing.
  missing: …/recapture-upstream-guard/client/node_modules
  fix    : (cd …/recapture-upstream-guard/client && npm ci)
```

The interpreter resolved to `/home/august/code/battlestats/server/.venv/bin/python` (main checkout) and imports pytest, so it was correctly *not* reported as missing.

**Note on the `test_deploy_preflights_*` assertion:** it anchors on line-start commands. An earlier version matched the bare string `rsync`, which hits a *comment* near the top of the deploy script and produced a false failure while the ordering was in fact correct.

## Operating notes

- **A deploy from a worktree now uses the main checkout's credentials.** If you need a worktree to deploy with different creds, drop a tree-local `server/.env.cloud` and it wins.
- Preflight failure prints every missing prerequisite at once. Fix them all, then re-invoke once.
- **Adding a new local-file dependency to any script means adding it to that script's prereq list**, or the next worktree run rediscovers this failure the hard way.
- The managed-Postgres CA recovery (`scp` it off the droplet) stays documented in `ops-env-reference.md`; with main-checkout resolution it is only needed on a genuinely fresh dev box, not per worktree.

## Follow-ups

- **`switch_db_target.sh` is unconverted** and will still fail from a worktree. Low impact (interactive, local-dev only), but it is the remaining instance of the class.
- ~~**Secrets duplicated into `.claude/worktrees/recapture-upstream-guard/server/`**~~ **DONE 2026-08-13.** Deleted as part of this implementation, and their absence is what proved main-checkout resolution works.
- **No shellcheck in CI.** These scripts carry real operational weight and are only syntax-checked by hand (`bash -n`). Worth considering separately.

## Related

- `agents/runbooks/ops-env-reference.md` — the env catalogue, and the 2026-07-30 CA-certificate entry this supersedes for the worktree case
- `reference_frontend_visual_verify_recipe` — the hardlink-not-symlink constraint on `client/node_modules`
- `.github/workflows/ci.yml` — the only suite that runs, and therefore where the helper's tests must live
