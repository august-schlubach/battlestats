# Runbook: Player Playstyle Taxonomy

## Goal

Maintain the player playstyle taxonomy so verdict labels map cleanly onto meaningful WoWS performance bands and remain consistent across API refreshes, crawler saves, and the player detail UI.

## Threshold Rationale

- WoWS player color bands in this repo already treat `> 65%` win rate as the start of the super-unicum shelf, so `Sealord` lives there as the absolute top-end label.
- `Assassin` now covers the rest of the purple/unicum tier at `60%` to `<65%`.
- `Warrior` now covers the stronger blue band at `56%` to `<60%` with stable survival.
- `Stalwart` covers the merely-good but dependable band at `52%` to `<56%` with stable survival.
- `Daredevil` remains the aggressive low-survival mirror for both the `Stalwart` and `Warrior` skill bands.
- `Flotsam` now starts at `51%` so players hovering right around `50%` no longer read as quietly useful.
- `Hot Potato` starts below `42%` win rate with poor survival, making it a rarer worst-of-the-worst shelf rather than swallowing too much of the ordinary low-red population.
- `Potato` and `Survivor` now absorb the broad average-to-bad shelf from `42%` to `<51%`, while `Flotsam` and `Jetsam` stay reserved for players who are at least meaningfully above average.

## Current Thresholds

1. `< 100 battles` -> `Recruit`
2. `>= 65% WR` -> `Sealord`
3. `60% to < 65% WR` -> `Assassin`
4. `56% to < 60% WR` -> `Warrior` or `Daredevil` depending on survival
5. `52% to < 56% WR` -> `Stalwart` or `Daredevil` depending on survival
6. `51% to < 52% WR` -> `Flotsam` or `Jetsam` depending on survival
7. `42% to < 51% WR` -> `Survivor` or `Potato` depending on survival
8. `< 42% WR` -> `Survivor` or `Hot Potato` depending on survival

Low-survival split:

- `pvp_survival_rate < 33.0` is treated as the aggressive/fragile branch.

## Code Changes

1. Centralize verdict calculation in `warships.data.compute_player_verdict()`.
2. Use that helper from both:
   - `warships.data.update_player_data()`
   - `warships.clan_crawl.save_player()`
3. Recalculate stored verdict rows with the management command:
   - `python manage.py backfill_player_verdicts --changed-only --batch-size 2000`
4. Keep the UI label as `Playstyle` while preserving the `verdict` field name in the API/model.
5. Keep helper text in sync in `client/app/components/PlayerDetail.tsx`.

## Execution Steps

1. Apply the code changes.
2. Run targeted backend tests covering verdict assignment.
3. Run the verdict backfill command against the live dataset.
4. Spot-check grouped verdict counts after backfill.
5. Commit and push.

## Validation

- Targeted tests:
  - `python manage.py test warships.tests.test_data.PlayerDataHardeningTests warships.tests.test_data.PlayerExplorerSummaryTests`
- Optional UI sanity:
  - open representative players and confirm the player detail section renders the expected verdict and helper copy.
- Data sanity:
  - query grouped verdict counts after backfill.

## Rollback

1. Revert the commit.
2. Re-run the verdict backfill command after the revert if you need stored verdicts recalculated back to the old scheme.
