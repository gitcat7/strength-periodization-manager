# Task 3 re-review test-fix report

## Scope

Addressed the Task 3 re-review coverage gaps in the `rest-day-regeneration` worktree. No remote deployment, database operation, Task 4+ file, secret, or unrelated refactor was performed.

## TDD evidence

1. Added the mounted `ProgramRegenerationDialog` test and the fresh-load-failure outcome test before changing test support or production logic. The initial focused run failed because Vitest could not resolve `jsdom` and because `program-regeneration-outcome` did not exist.
2. Strengthened the fresh-load-failure expectation to require concrete cleared stale data. Its focused RED run failed with the expected missing `staleData` output.
3. The existing dialog-state regression test then exposed a genuine safety bug: after a successful replacement followed by a failed reload, the reducer fell back to idle instead of retaining a non-confirmable recovery dialog. The focused suite failed with the expected `open: false`, `phase: idle` result before the committed/reload-failed state-machine transition was implemented.

## Coverage added

- `program-regeneration-dialog.test.tsx` mounts the actual React dialog in Vitest's jsdom environment. It proves heading initial focus; forward, reverse, and outside-entry Tab containment; inert background handling when the platform exposes `inert`; trigger focus restoration and inert cleanup on close; and that Escape, backdrop, cancel, and confirm cannot close or mutate while submitting.
- The mounted dialog also verifies that a committed replacement with a failed fresh load removes the confirmation action and exposes only the reload-page recovery action.
- `program-regeneration-outcome.test.ts` drives the real manager-owned pure outcome branch with `replacementSucceeded: true` and `freshProgramLoaded: false`. It asserts the reload-failed dialog action, cleared program/schedule/recommendation state, no schedule-row focus, no success close, and recoverable reload messaging.
- `program-regeneration-dialog-state.test.ts` verifies `replacementCommitted` followed by `reloadFailed` retains the dialog and ignores a repeat confirmation.

## Implementation and compatible concurrent hunks

- Added `jsdom` and the Vitest automatic JSX transform so the existing React component can be mounted without introducing a testing-library dependency.
- Added the manager-owned `program-regeneration-outcome.ts` helper and consumed it from `ProgramManager`, keeping the post-RPC reload-failure branch centralized and testable.
- The compatible concurrent state-machine hunks were retained and integrated:
  - `program-regeneration-dialog-state.ts` adds `replacementCommitted` and `reloadFailed` transitions.
  - `program-manager.tsx` transitions to committed after the replacement RPC, clears stale UI state on a failed fresh load, and supplies the reload-page action.
  - `program-regeneration-dialog.tsx` presents reload recovery rather than a second confirmation after the committed replacement.

## Verification

- Focused Task 3 suite: `pnpm vitest run src/components/plan/program-regeneration-dialog.test.tsx src/components/plan/program-regeneration-outcome.test.ts src/components/plan/program-regeneration-dialog-state.test.ts src/domain/program-regeneration.test.ts`
- Static types: `pnpm typecheck`
- `pnpm test` — 25 files, 151 tests passed.
- `git diff --check` — passed.
