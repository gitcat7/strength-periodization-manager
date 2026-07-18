# Free Workout Completion Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user verify a saved free workout, open that exact history record, and see the latest completed training on the home screen.

**Architecture:** Keep completion data in the recorder after `save_standalone_workout` returns its authoritative workout ID, then render a non-editable success state. Extend the existing user-scoped history and home queries rather than adding a database table or RPC: history validates a query-string ID against already RLS-filtered rows, while home calculates a recent-completed card from its completed-workout detail set and invalidates its cache on a free-workout completion event.

**Tech Stack:** Next.js App Router, React, TypeScript, Supabase browser client, Vitest, Tailwind.

## Global Constraints

- Do not create a second workout after completion; use the ID returned by `save_standalone_workout`.
- Keep free training separate from active-program scheduling and recommendations.
- Use kilograms only; show unavailable metrics as `不适用`.
- Never accept or send a `user_id`; all reads remain constrained by Supabase RLS.
- Do not add videos, templates, favorites, offline support, or a database migration.
- Do not deploy or merge this branch.

---

### Task 1: Completion result state and cache invalidation contract

**Files:**
- Create: `src/domain/free-workout-completion.ts`
- Create: `src/domain/free-workout-completion.test.ts`
- Modify: `src/lib/client-cache.ts`

- [ ] **Step 1: Write failing tests** for a completed free-workout summary that preserves the returned ID, date, set count, tonneage/e1RM nullability, and emits a browser completion event.
- [ ] **Step 2: Run** `pnpm vitest run src/domain/free-workout-completion.test.ts` and verify RED because the module is missing.
- [ ] **Step 3: Implement** a typed `FreeWorkoutCompletion` creator and `notifyFreeWorkoutCompleted()` custom-event helper; add a user-scoped home cache invalidator without broad local-storage clearing.
- [ ] **Step 4: Run the targeted test** and verify GREEN.
- [ ] **Step 5: Commit** the domain contract and tests.

### Task 2: Non-editable free-workout success screen

**Files:**
- Modify: `src/components/single-workout/single-workout-recorder.tsx`
- Modify: `src/components/single-workout/single-workout-recorder.test.tsx`

- [ ] **Step 1: Write failing component tests** that mock a completed RPC response, assert the success state hides action search/edit controls, shows `自由训练`, metrics including `不适用`, and exposes `/history?workout=<id>`, `/history`, and `/` links.
- [ ] **Step 2: Run** `pnpm vitest run src/components/single-workout/single-workout-recorder.test.tsx` and verify RED on the absent completion UI.
- [ ] **Step 3: Implement** success-state rendering. Only transition after a successful `completed` RPC response with a string ID; use the pre-save summary, notify home caches, and retain input if the RPC fails.
- [ ] **Step 4: Run the targeted test** and verify GREEN.
- [ ] **Step 5: Commit** recorder completion UI and tests.

### Task 3: Authorized history deep link

**Files:**
- Modify: `src/components/history/training-history.tsx`
- Create: `src/components/history/history-workout-focus.ts`
- Create: `src/components/history/history-workout-focus.test.ts`

- [ ] **Step 1: Write failing pure-logic tests** for selecting only an ID present in current-user RLS-filtered rows and returning no focus for absent/invalid IDs.
- [ ] **Step 2: Run** `pnpm vitest run src/components/history/history-workout-focus.test.ts` and verify RED.
- [ ] **Step 3: Implement** a query-string reader plus focus resolver; after history data loads, mark only the matching visible article, open it through the existing presentation, and call `scrollIntoView` without querying a workout by URL ID.
- [ ] **Step 4: Run targeted tests** and verify GREEN.
- [ ] **Step 5: Commit** history focus behavior and tests.

### Task 4: Home recent-training card and coherent cache refresh

**Files:**
- Modify: `src/components/dashboard/home-dashboard.tsx`
- Modify: `src/components/dashboard/home-dashboard-next-workout.test.mjs`
- Create: `src/domain/recent-training.ts`
- Create: `src/domain/recent-training.test.ts`

- [ ] **Step 1: Write failing tests** for selecting the latest completed training, classifying free versus program workout, calculating completed sets/volume, returning null with no history, and source-contract assertions for the home card/listener.
- [ ] **Step 2: Run targeted tests** and verify RED.
- [ ] **Step 3: Implement** a pure recent-training selector and a small mobile-friendly recent card. Subscribe to the free-workout event to invalidate and reload home data; never choose drafts as recent training.
- [ ] **Step 4: Run targeted tests** and verify GREEN.
- [ ] **Step 5: Commit** home presentation, cache refresh, and tests.

### Task 5: Integration verification and handoff evidence

**Files:**
- Modify: `docs/superpowers/plans/2026-07-18-free-workout-completion-loop.md`

- [ ] **Step 1: Run** all target tests, `pnpm test`, `pnpm lint`, `pnpm typecheck`, and `pnpm build`.
- [ ] **Step 2: Run an authenticated browser smoke** for completion, deep link, and home refresh when a logged-in browser session is available; otherwise record the unavailable prerequisite without fabricating evidence.
- [ ] **Step 3: Append exact verification outcomes and remaining risks** to this plan.
- [ ] **Step 4: Commit** verification evidence.
