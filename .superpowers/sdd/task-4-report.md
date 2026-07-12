# Task 4 Report: Reviewed Supabase Bridge and Atomic Accessory Substitution

## Status

Implemented the reviewed exercise bridge, the atomic `substitute_workout_exercise` RPC, pure client eligibility logic, SQL/TypeScript contract coverage, and complete pgTAP scenarios. Existing exercise UUIDs are preserved: the migration updates the 18 existing rows by `slug` and inserts only the 12 approved alternatives.

## RED/GREEN Evidence

### RED

1. Ran:

   ```powershell
   pnpm vitest run src/domain/exercise-substitution.test.ts scripts/exercise-catalog-sql-contract.test.mjs
   ```

   Initial result: failed as intended because `src/domain/exercise-substitution.ts` and `supabase/migrations/20260711190000_exercise_catalog_bridge.sql` did not exist. Vitest reported the missing domain import plus three `ENOENT` migration-contract failures.

2. Added a final hardening contract assertion requiring non-null direction/pattern metadata for source and target rows. The focused SQL contract test failed as intended because that guard was absent.

### GREEN

After implementation and the metadata-lock hardening, the focused command passed:

```powershell
pnpm vitest run src/domain/exercise-substitution.test.ts scripts/exercise-catalog-sql-contract.test.mjs
```

Result: 2 test files passed, 13 tests passed.

Final full verification:

```powershell
pnpm test
pnpm typecheck
pnpm release:check
```

Results:

- `pnpm test`: 8 files passed, 64 tests passed.
- `pnpm typecheck`: passed.
- `pnpm release:check`: passed typecheck, production build, and local smoke checks for all configured routes and `/api/health`.
- `git diff --check`: passed.

## SQL Test Status

`supabase test db` was attempted but could not execute because the `supabase` CLI is not installed. A direct environment check also found `supabase_cli=False docker_cli=False`.

`supabase/tests/substitute_workout_exercise.test.sql` nevertheless contains 25 transactional pgTAP assertions covering:

- `current_workout` and `remaining_program` scopes.
- Cross-user and unauthenticated rejection.
- Inactive program, positions 1-2, completed/skipped workouts, disabled/unmapped source, disabled target, same target, incompatible direction/pattern, and completed-set rejection.
- Exact affected count, target-weight reset, target sets/reps preservation, incomplete-log deletion, and completed-log rollback preservation.

This is not a production database verification. Run `supabase test db` after installing the Supabase CLI with Docker available, then rerun the same assertions against the linked database immediately after applying the migration.

## Changed Files

- `supabase/migrations/20260711190000_exercise_catalog_bridge.sql`
- `supabase/schema.sql`
- `supabase/tests/substitute_workout_exercise.test.sql`
- `src/domain/exercise-substitution.ts`
- `src/domain/exercise-substitution.test.ts`
- `scripts/exercise-catalog-sql-contract.test.mjs`
- `.superpowers/sdd/task-4-report.md`

## Self-Review

- The migration updates existing rows by `slug` only and never inserts explicit IDs. It inserts precisely the 12 approved alternative slugs; the contract test checks all 29 approved slug/catalog/direction/pattern/replaceability mappings and Zone 2's null mapping.
- The RPC has no `user_id` input. It derives identity from `auth.uid()`, requires ownership of an active program, and revokes execution from `public` and `anon` while granting only `authenticated`.
- The transaction locks the source workout row, target exercise row, all affected workout rows, and their logs. Any completed log aborts before deletion/update; incomplete logs are deleted only after the guard succeeds. The update resets only `target_weight`, preserves prescription sets/reps, updates `updated_at`, and returns sorted affected IDs plus the exact count.
- Existing RLS policies were not changed or broadened. Direct owner table-mutation behavior remains as it was before Task 4.

## Remaining Concern

The local environment cannot execute pgTAP or apply the migration, so SQL syntax and runtime behavior have not been exercised in a real Supabase/PostgreSQL instance here. The static SQL contract and complete pgTAP suite provide coverage, but linked-database execution remains required before production use.
