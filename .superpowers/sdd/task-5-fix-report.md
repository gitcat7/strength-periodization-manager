# Task 5 Review Fix Report

## Scope

Changed only the Task 5 exercise-library implementation under `src/components/exercises/` plus this required report.

## Review Fixes

1. Catalog and bridge loading are isolated. `loadExerciseLibraryData` treats catalog loading as the blocking path and returns bridge failures alongside usable catalog records. `ExerciseLibrary` keeps the catalog browseable, disables the program-only control, shows a concise Chinese warning, and retries only the bridge mapping.
2. `ExerciseDetailPanel` now records a return target for both desktop and mobile details. On mobile it traps Tab and Shift+Tab within the dialog, closes on Escape, locks body scrolling, and restores focus on close. Desktop close also restores the trigger focus.
3. `ExerciseDetailLauncher` uses request generations. Results from an older request or an unmounted component do not update state.
4. `resolveExerciseDetail` preserves local Zone 2 guidance without invoking the catalog loader. Catalog detail resolves only when the user action invokes the resolver.

## TDD Evidence

- RED: `pnpm vitest run src/components/exercises/exercise-library-load.test.ts src/components/exercises/exercise-detail-focus.test.ts src/components/exercises/exercise-detail-request.test.ts src/components/exercises/exercise-detail-resolver.test.ts`
  - Failed because the four target helper modules did not exist. After correcting test-only aliases to the repository's relative-import convention, the expected missing-module failures remained.
- GREEN: the same command passed with 4 files and 9 tests after the minimal helper implementations were added.
- Focused regression verification: 6 files and 32 tests passed, including the original library-state and catalog tests.

## Final Verification

- `pnpm test`: 13 files, 78 tests passed.
- `pnpm typecheck`: passed.
- `pnpm build`: passed without warnings; `/exercises` is present in the route output.
