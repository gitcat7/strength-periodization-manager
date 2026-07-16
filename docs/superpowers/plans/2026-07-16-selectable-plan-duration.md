# Selectable Plan Duration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users generate one to twelve weeks of training while preserving the existing four-week loading and deload rhythm.

**Architecture:** `buildFourWeekProgram` gains a validated `weekCount` input and generates dates inside that many calendar weeks; week intensity uses the calendar week index modulo four. Plan-page state owns the selected count and sends it into the generator before the existing replacement RPC is called; no database schema changes are required because generated workouts remain the source of truth.

**Tech Stack:** Next.js, React, TypeScript, Vitest, Supabase RPC payloads.

## Global Constraints

- The picker permits only integer values from 1 through 12 and defaults to 4.
- Weeks five through twelve repeat the first four-week accumulation, intensification, and deload block.
- Existing programs and replacement RPC contracts remain unchanged.
- Mobile controls remain usable at 320px width.

---

### Task 1: Parameterize the program generator

**Files:**
- Modify: `src/domain/program.ts`
- Modify: `src/domain/program.test.ts`

**Interfaces:**
- Produces: `buildFourWeekProgram({ ..., weekCount?: number })`, accepting an integer from 1 to 12 and defaulting to 4.

- [ ] **Step 1: Write failing domain tests**

Add tests showing a six-week three-day program has 18 training entries across six calendar weeks, labels the final entries as week 6, and applies the week-two intensity bump again during week six.

- [ ] **Step 2: Run the focused test to verify RED**

Run: `pnpm test -- src/domain/program.test.ts`

Expected: the generated result still has 12 training entries because `weekCount` is not supported.

- [ ] **Step 3: Implement the minimal generator input**

Add `weekCount?: number`, normalize it to an integer between one and twelve with fallback four, generate schedule dates inside the resulting calendar range, and use the calendar `weekIndex % 4` for `weekIntensityBumps`.

- [ ] **Step 4: Run the focused test to verify GREEN**

Run: `pnpm test -- src/domain/program.test.ts`

Expected: PASS.

### Task 2: Connect the plan setup picker

**Files:**
- Modify: `src/components/plan/program-manager.tsx`
- Modify: `src/components/plan/program-manager.plan-setup.test.tsx`
- Modify: `src/app/plan/page.tsx`

**Interfaces:**
- Consumes: `buildFourWeekProgram({ ..., weekCount })`.
- Produces: a shared plan-period select for first creation and regeneration, defaulted to four weeks.

- [ ] **Step 1: Write failing UI tests**

Assert the setup displays the 1–12 week select with four weeks selected and no longer promises a fixed four-week plan.

- [ ] **Step 2: Run focused test to verify RED**

Run: `pnpm test -- src/components/plan/program-manager.plan-setup.test.tsx`

Expected: FAIL because no period control exists.

- [ ] **Step 3: Implement the select and copy**

Store `planWeekCount` in `ProgramManager`, pass it to the generator, render a labelled select from 1 to 12 in the plan parameter form, and update create/page copy to reflect the selected period.

- [ ] **Step 4: Run focused test to verify GREEN**

Run: `pnpm test -- src/components/plan/program-manager.plan-setup.test.tsx`

Expected: PASS.

### Task 3: Verify and release

- [ ] **Step 1: Run `pnpm test`, `pnpm lint`, `pnpm typecheck`, and `pnpm build`.**
- [ ] **Step 2: Review `git diff --check` and commit the feature.**
- [ ] **Step 3: Merge to `main`, run `pnpm release:check`, push, deploy production, and run online smoke checks.**
