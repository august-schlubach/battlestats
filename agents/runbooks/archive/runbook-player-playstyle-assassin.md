# Runbook: Player Playstyle Taxonomy

## Goal

Maintain the player playstyle taxonomy so verdict labels map cleanly onto meaningful WoWS performance bands, use survivability as the second dimension, and remain consistent across API refreshes, crawler saves, and the player detail UI.

## Threshold Rationale

- Wargaming WR bands still drive the shelves, so the first cut is always the repo's live win-rate color bands.
- Survivability splits every shelf except the top end, where `Sealord` intentionally covers both branches.
- The low-survivability branch is `pvp_survival_rate < 33.0`.
- The low-survivability names should read riskier or more self-destructive than the high-survivability names in the same WR shelf.

## Current Matrix

1. `< 100 battles` -> `Recruit`
2. `> 65% WR` -> `Sealord` regardless of survivability
3. `60% to 65% WR` -> `Assassin` on the high-survivability branch, `Kraken` on the low-survivability branch
4. `56% to < 60% WR` -> `Stalwart` on the high-survivability branch, `Daredevil` on the low-survivability branch
5. `54% to < 56% WR` -> `Warrior` on the high-survivability branch, `Raider` on the low-survivability branch
6. `52% to < 54% WR` -> `Survivor` on the high-survivability branch, `Jetsam` on the low-survivability branch
7. `50% to < 52% WR` -> `Flotsam` on the high-survivability branch, `Drifter` on the low-survivability branch
8. `45% to < 50% WR` -> `Pirate` on the high-survivability branch, `Potato` on the low-survivability branch
9. `< 45% WR` -> `Hot Potato` on the high-survivability branch, `Leroy Jenkins` on the low-survivability branch

Canonical table:

| Wargaming WR band | WR range       | High survivability | Low survivability |
| ----------------- | -------------- | ------------------ | ----------------- |
| Super Unicum      | `> 65%`        | `Sealord`          | `Sealord`         |
| Unicum            | `60% to 65%`   | `Assassin`         | `Kraken`          |
| Great             | `56% to < 60%` | `Stalwart`         | `Daredevil`       |
| Good              | `54% to < 56%` | `Warrior`          | `Raider`          |
| Above Average     | `52% to < 54%` | `Survivor`         | `Jetsam`          |
| Average           | `50% to < 52%` | `Flotsam`          | `Drifter`         |
| Below Average     | `45% to < 50%` | `Pirate`           | `Potato`          |
| Needs Improvement | `< 45%`        | `Hot Potato`       | `Leroy Jenkins`   |

## Code Changes

1. Centralize verdict calculation in `warships.data.compute_player_verdict()`.
2. Use that helper from both:
   - `warships.data.update_player_data()`
   - `warships.clan_crawl.save_player()`
3. Recalculate stored verdict rows with the management command:
   - `python manage.py backfill_player_verdicts --changed-only --batch-size 2000`
4. Keep the survivability split threshold centralized in `warships.data` so the matrix can be tuned without rewriting the branches.
5. Keep the UI label as `Playstyle` while preserving the `verdict` field name in the API/model.
6. Keep helper text in sync in `client/app/components/PlayerDetail.tsx`.

## Execution Steps

1. Apply the code changes.
2. Run targeted backend tests covering verdict assignment.
3. Run the verdict backfill command against the live dataset.
4. Spot-check grouped verdict counts after backfill.
5. Commit and push.

## Execution Status

- Updated the classifier to use the WR-plus-survivability matrix.
- Updated helper copy for the restored and new playstyles.
- Updated verdict tests to cover both survivability branches and lookup recomputation.
- Executed targeted validation on `2026-03-14`:
  - `python manage.py test warships.tests.test_data.PlayerDataHardeningTests warships.tests.test_views.PlayerViewSetTests --keepdb`
  - result: `19` tests passed
- Executed verdict backfill on `2026-03-14`:
  - `python manage.py backfill_player_verdicts --changed-only --batch-size 2000`
  - result: processed `273828` players, updated `125523`
- Updated the high-survivability placement so `Survivor` now occupies the `52% to <54%` shelf and `Flotsam` now occupies the `50% to <52%` shelf.
- Re-validated the swap on `2026-03-14`:
  - `python manage.py test warships.tests.test_data.PlayerDataHardeningTests warships.tests.test_views.PlayerViewSetTests --keepdb`
  - result: `19` tests passed
- Re-ran verdict backfill after the swap on `2026-03-14`:
  - `python manage.py backfill_player_verdicts --changed-only --batch-size 2000`
  - result: processed `273831` players, updated `21564`
- Spot-checked grouped verdict counts after backfill:
  - `Recruit: 72908`
  - `Potato: 54601`
  - `Leroy Jenkins: 41541`
  - `Pirate: 19836`
  - `Drifter: 14480`
  - `Survivor: 11255`
  - `Flotsam: 10236`
  - `Stalwart: 8681`
  - `Warrior: 8007`
  - `Jetsam: 7581`
  - `Hot Potato: 6312`
  - `Assassin: 3620`
  - `Raider: 3151`
  - `Daredevil: 1404`
  - `Sealord: 1398`
  - `Kraken: 131`

## Validation

- Targeted tests:
  - `python manage.py test warships.tests.test_data.PlayerDataHardeningTests warships.tests.test_views.PlayerViewSetTests --keepdb`
- Optional UI sanity:
  - open representative players and confirm the player detail section renders the expected verdict and helper copy.
- Data sanity:
  - query grouped verdict counts after backfill.

## Rollback

1. Revert the commit.
2. Re-run the verdict backfill command after the revert if you need stored verdicts recalculated back to the old scheme.
