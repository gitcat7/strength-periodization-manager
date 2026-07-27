# 历史训练按日期查看 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a date-based history view that shows only selected-day completed workouts while retaining an all-history mode.

**Architecture:** Extract deterministic selected-date filtering into a history domain helper. The history component loads all completed workouts, stores the selected date locally, and renders the filtered collection with a date control and empty state.

**Tech Stack:** Next.js, React, TypeScript, Supabase browser client, Vitest.

## Global Constraints

- Mobile-first Chinese UI and no new database migration.
- A date selection reads records only; it never mutates workouts or set logs.
- Default history includes completed records beyond the previous 12-workout limit.
- Preserve `?workout=<id>` focus behavior.

---

### Task 1: Selected-date filtering

**Files:**
- Create: `src/domain/history-date-filter.ts`
- Create: `src/domain/history-date-filter.test.ts`

- [ ] Write a failing test where two records on `2026-07-01` remain and a `2026-07-02` record is excluded.
- [ ] Run `pnpm vitest run src/domain/history-date-filter.test.ts` and confirm the missing helper fails.
- [ ] Export `filterHistoryWorkoutsByDate<T extends { scheduled_date: string }>(workouts: T[], selectedDate: string): T[]`; return all records for an empty date and exact-date records otherwise.
- [ ] Re-run the domain test and confirm it passes.

### Task 2: History page date control

**Files:**
- Modify: `src/components/history/training-history.tsx`
- Create: `src/components/history/training-history-date-filter.test.tsx`

- [ ] Write a failing component test for `选择训练日期`, `全部历史`, and `当天没有完成训练`.
- [ ] Run `pnpm vitest run src/components/history/training-history-date-filter.test.tsx` and confirm it fails.
- [ ] Remove `.limit(12)` from completed-workout reads; add selected-date state, native date input, reset button, helper-derived filtered workout list, and selected-date empty state.
- [ ] Run `pnpm vitest run src/domain/history-date-filter.test.ts src/components/history/training-history-date-filter.test.tsx src/components/history/history-workout-focus.test.ts` and confirm it passes.

### Task 3: Release

**Files:**
- Verify: repository release gate and production URL

- [ ] Run `pnpm release:check` and confirm typecheck, build, and local smoke pass.
- [ ] Commit `feat: filter history by training date`, push `codex/p0-remediation`, deploy with `pnpm dlx vercel deploy --prod --yes`.
- [ ] Run `$env:BASE_URL='https://strength-periodization-manager.vercel.app'; pnpm smoke` and confirm every configured route passes.
