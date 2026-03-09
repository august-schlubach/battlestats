# Runbook: Add Assassin Playstyle

## Goal

Add a new top-end player playstyle label, `Assassin`, for elite player records on the player detail page without making it so rare that it never appears.

## Threshold Rationale

- WoWS player color bands in this repo already treat `>= 60%` win rate as the start of the purple/unicum tier.
- `> 65%` would map more to super-unicum and would be too rare for a playful top-end label that should appear in real data.
- The new threshold is therefore `pvp_ratio >= 60.0`.
- This keeps `Assassin` aligned with the established WoWS quality breakdown while leaving `Warrior` and `Daredevil` as the strong-but-below-unicum band.

## Code Changes

1. Centralize verdict calculation in `warships.data.compute_player_verdict()`.
2. Use that helper from both:
   - `warships.data.update_player_data()`
   - `warships.clan_crawl.save_player()`
3. Add a management command:
   - `python manage.py backfill_player_verdicts --changed-only --batch-size 2000`
4. Keep the UI label as `Playstyle` while preserving the `verdict` field name in the API/model.

## Execution Steps

1. Apply the code changes.
2. Run targeted backend tests covering verdict assignment.
3. Run the verdict backfill command against the live dataset.
4. Spot-check counts to verify `Assassin` now appears in production-like data.
5. Commit and push.

## Validation

- Targeted tests:
  - `python manage.py test warships.tests.test_data.PlayerDataHardeningTests warships.tests.test_data.PlayerExplorerSummaryTests`
- Optional UI sanity:
  - open a known strong player and confirm the player detail section renders `Playstyle: Assassin`.
- Data sanity:
  - query grouped verdict counts after backfill.

## Rollback

1. Revert the commit.
2. Re-run the verdict backfill command after the revert if you need stored verdicts recalculated back to the old scheme.