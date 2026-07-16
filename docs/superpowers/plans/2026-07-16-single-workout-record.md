# 单次训练记录 Implementation Plan

> **For agentic workers:** Execute inline with TDD. Each task begins with a failing test and ends with focused verification.

**Goal:** Allow an authenticated user to record a one-off training session without creating or changing a period program.

**Architecture:** A nullable `workouts.program_id` marks a standalone training workout. A scoped migration expands RLS so owned standalone workouts, exercises and logs remain accessible without weakening cross-user boundaries. The new mobile route writes this existing three-table record shape; period-plan queries remain program-scoped.

**Tech Stack:** Next.js App Router, React, TypeScript, Supabase RLS/PostgreSQL, Vitest, Tailwind.

## Global Constraints

- No images, image cards, user-id client payloads, or program writes.
- Standalone rows use `day_type='training'`, `program_id=null`, `schedule_index=0`, `sequence_index=0` and a `单次训练 · yyyy-mm-dd` name.
- Existing program scheduling, next-workout selection and recommendation application stay program-scoped.
- New controls remain mobile-safe, text-first and use existing visual tokens.

### Task 1: Domain selection and persistence payload

- [ ] Add RED tests for Chinese category/search filtering, selection de-duplication, standalone payload and program-isolation predicates.
- [ ] Implement pure helpers under `src/domain/single-workout.ts`.
- [ ] Run focused GREEN tests.

### Task 2: Database compatibility

- [ ] Add RED static migration contract for nullable program ownership and parent-or-owned RLS.
- [ ] Add one independent migration and update `supabase/schema.sql` mirror.
- [ ] Verify contract test.

### Task 3: Home entry and single-workout editor

- [ ] Add RED state tests for draft/complete transitions.
- [ ] Add `/single-workout` route and text-only editor; change only no-plan home CTA copy/destinations.
- [ ] Verify focused tests, typecheck and component behavior.

### Task 4: Release verification

- [ ] Run full test, lint, typecheck, build and release check.
- [ ] Commit, merge without overwriting main changes, push, deploy and smoke test production.
