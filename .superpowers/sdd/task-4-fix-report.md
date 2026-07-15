# Task 4 fix report: rest-day completion guards and cache rollover

## Scope

Fixed the two review blockers while preserving the already-committed rest-query fallback:

- A cached rest item is accepted only when it is incomplete, a rest item, and scheduled for the current local date. The render branch performs the same check, so an already-hydrated item cannot survive a midnight rollover as a visible rest card.
- The completion action rechecks the local date before issuing a request. Its database update writes only `status` and `completed_at`, and requires matching `id`, `user_id`, `day_type = rest`, `scheduled_date = today`, and `scheduled`/`draft` status.

## Regression coverage

`rest-day-actions.test.ts` covers:

1. A prior-day cached rest record being rejected at the hydration boundary.
2. An attempted completion of that stale record performing no database request.
3. The real update-builder interaction: minimal payload and each ownership/date/day-type/status predicate.

The focused test was RED first because `rest-day-actions` did not exist. After implementation, the focused suite passed with 23 tests.

## Verification

- `pnpm vitest run src/components/today/rest-day-state.test.ts src/components/today/rest-day-actions.test.ts src/domain/next-workout.test.ts src/lib/client-cache.test.ts` — 4 files, 23 tests passed.
- `pnpm test` — 29 files, 162 tests passed.
- `pnpm typecheck` — passed.
- `git diff --check` — passed.

`pnpm lint` was attempted but cannot run in this worktree because ESLint resolves two copies of `@next/eslint-plugin-next` (one from the worktree and one from its parent) and reports the plugin as ambiguous. This is an environment/configuration issue; no lint result is asserted here.

## Preserved external work

The pre-existing rest-query fallback and safe error-copy edits were committed independently as `567cc80` while this fix was in progress and were not changed. Untracked Task 5 files (`program-manager.tsx` changes and the rest-day-presentation/training-metric-workouts files) were preserved and excluded from this commit.
