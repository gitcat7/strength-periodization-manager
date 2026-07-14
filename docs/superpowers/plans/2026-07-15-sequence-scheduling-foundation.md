# Sequence Scheduling Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add compatible persistence and domain-model support for sequence-first training scheduling.

**Architecture:** Scheduling policy is stored once per program; every workout has a stable, per-program sequence index. Existing scheduled dates remain suggestions and are not renamed in this phase.

**Tech Stack:** TypeScript, Vitest, PostgreSQL/Supabase SQL.

## Global Constraints

- Preserve existing `scheduled_date` and `completed_at` fields.
- Default all legacy programs to `fixed_weekdays`.
- Do not change UI, RPC behavior, or plan templates in this phase.
- Run tests before and after each behavior change.

---

### Task 1: Sequence-indexed domain output

**Files:**
- Modify: `src/domain/program.ts`
- Modify: `src/components/plan/program-manager.tsx`
- Create: `src/domain/program.test.ts`

**Interfaces:**
- Produces: `PlannedWorkout.sequenceIndex: number`.

- [x] Write tests asserting generated sequence indices are `[0, 1, ...]` and fixed-weekday dates remain ordered.
- [x] Run `pnpm vitest run src/domain/program.test.ts` and confirm failure because `sequenceIndex` is absent.
- [x] Add `sequenceIndex` to `PlannedWorkout`, emit the current map index, and write it in the existing `workouts` insert payload.
- [x] Run the focused test and full suite.

### Task 2: Compatible database migration

**Files:**
- Create: `supabase/migrations/20260715090000_sequence_scheduling_foundation.sql`
- Modify: `supabase/schema.sql`

**Interfaces:**
- Produces: `programs.schedule_mode` with three allowed values and `workouts.sequence_index` unique per program.

- [x] Write a SQL contract test that checks the migration contains the column additions, legacy backfill ordering, constraint, and index.
- [x] Run the contract test and confirm failure before the migration exists.
- [x] Add the migration and mirror the final table shape in `schema.sql`.
- [x] Run the contract test and full release check; compilation, types, build, and all tests passed, while local smoke is blocked by absent Supabase environment variables in the isolated worktree.
