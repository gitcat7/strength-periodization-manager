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

## Review Remediation Evidence

### Scope

Addressed all six review findings in the same Task 4 files. The RPC now derives a program ID through an ownership-safe lookup, locks the active owned program before any mutable workout row, re-reads the source under that lock, and locks affected rows through an ID-ordered, lockable subquery before aggregating the output array.

### RED

Added focused static SQL-contract assertions first for the named direction constraint, source and affected mixed-ownership predicates, program-first serialization lock, ID ordering before `FOR UPDATE`, and guarded `schema.sql` type creation.

Ran:

```powershell
pnpm vitest run scripts/exercise-catalog-sql-contract.test.mjs
```

Result: exit code `1`; 1 test file ran, 3 tests ran, 2 failed. The failures were the expected absent `exercises_training_direction_check` and absent `w.user_id = v_user_id` ownership predicate.

### GREEN

After implementing the mirrored SQL changes, ran:

```powershell
pnpm vitest run src/domain/exercise-substitution.test.ts scripts/exercise-catalog-sql-contract.test.mjs
pnpm test
pnpm typecheck
pnpm release:check
```

Results:

- Focused suite: 2 files passed, 13 tests passed.
- Full Vitest suite: 8 files passed, 64 tests passed.
- Typecheck: passed.
- Release check: passed typecheck, optimized production build, and all configured local smoke checks.
- `git diff --check`: passed.

### pgTAP Coverage and Limitation

`supabase/tests/substitute_workout_exercise.test.sql` now has an exact `plan(43)` with 43 pgTAP assertions. It covers exact sorted output arrays for both scopes, the same-date `>=` case, `PUBLIC`/`anon`/`authenticated` execution privileges, valid and invalid training-direction metadata, and exercise/weight/log state assertions for every rejection family.

The suite adds the critical mixed-owner fixture where user B's workout refers to user A's program. Acting as A must reject it, and the follow-up state assertion proves the exercise ID, weight, prescription, and log count are unchanged. A separate remaining-program fixture proves a completed future set rolls back the entire scope unchanged.

Ran:

```powershell
supabase test db
```

Result: exit code `1`; PowerShell reported that `supabase` is not recognized. The environment still has neither Supabase CLI nor Docker, so pgTAP and migration syntax have not been executed by PostgreSQL locally. This remains a linked-database verification requirement and is not represented as production verification.

### Remediation Files

- `supabase/migrations/20260711190000_exercise_catalog_bridge.sql`
- `supabase/schema.sql`
- `supabase/tests/substitute_workout_exercise.test.sql`
- `scripts/exercise-catalog-sql-contract.test.mjs`
- `.superpowers/sdd/task-4-report.md`

### Remediation Self-Review

- Source authorization now requires `w.user_id = auth.uid()`, `p.user_id = auth.uid()`, and `w.user_id = p.user_id`; every affected remaining-program row repeats the corresponding `w2` checks.
- The active program row is locked first. Source eligibility is re-read after that lock, and affected workout rows are selected in `we.id` order inside a non-aggregate `FOR UPDATE` subquery; only the outer query aggregates sorted IDs.
- The nullable named direction check allows only `push`, `pull`, `squat`, `cardio`, and `NULL`. The migration safely drops/re-adds it; the bootstrap schema declares it by name. `schema.sql` now uses the same guarded enum creation block as the migration.
- The SQL contract verifies both mirrors. The pgTAP plan count is mechanically checked against the 43 test assertions, but PostgreSQL execution remains unavailable in this environment.
