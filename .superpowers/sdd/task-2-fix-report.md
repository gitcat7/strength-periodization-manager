# Task 2 review-fix report

## Scope

Fixed only the three Important/High review findings for Task 2 in the `rest-day-regeneration` worktree. No remote database operations were performed.

## Root causes and fixes

1. **Fresh migration ordering** — `20260715000000_rest_day_schedule_and_program_replacement.sql` referenced `sequence_index` before `20260715090000_sequence_scheduling_foundation.sql` created it. The un-applied migration was reissued as `20260715110000_rest_day_schedule_and_program_replacement.sql`, after both its scheduling dependencies. The static contract now reads the reissued path, and exactly one rest-day migration remains.
2. **Cross-program schedule moves** — the deferred continuity trigger previously validated only `coalesce(new.program_id, old.program_id)`, so a move could leave the old program with a schedule-index gap. The trigger now enumerates and validates every affected old/new program, while continuing to skip a parent program removed by cascade.
3. **Atomic rollback proof** — the prior invalid payload failed before any insert. The new pgTAP case uses two valid training items with the same `sequence_index`; the RPC inserts the replacement program and first schedule/prescription, then the second schedule violates the real `(program_id, sequence_index)` unique constraint. The test verifies that the old program remains active and that no replacement program survives the rollback.

## Regression coverage

- Added a pgTAP test proving a `program_id` reassignment that would leave the source program non-continuous fails with `23514`.
- Added a pgTAP test proving a later database write failure rolls back an in-progress replacement and preserves the old active plan.
- Updated the pgTAP plan from 18 to 22 assertions.

## Verification

- RED: `pnpm vitest run scripts/rest-day-sql-contract.test.mjs` failed before reissuing the migration because the new expected migration path did not exist (`ENOENT`).
- GREEN: `pnpm vitest run scripts/rest-day-sql-contract.test.mjs` passed (1 test).
- `pnpm vitest run` passed (20 files, 136 tests).
- `supabase test db` was attempted but cannot run because the Supabase CLI is not installed (`supabase` is not recognized). The pgTAP tests require execution in a local/linked Supabase environment before release.
- `git diff --check` passed.

## Constraints preserved

- RPC authentication remains exclusively `auth.uid()` based.
- Rest schedule items still require `sequence_index: null` and no exercise prescriptions.
- No test-only production path or relaxed payload validation was introduced.
