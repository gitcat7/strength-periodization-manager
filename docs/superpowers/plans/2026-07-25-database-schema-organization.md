# Database Schema Organization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all product tables to domain-prefixed names with comments, compatible legacy reads, correct time semantics, and unchanged data-access behavior.

**Architecture:** Rename relations in place to preserve data and UUIDs, recreate RLS/RPCs against the renamed relations, then offer old names as `security_invoker` read views. `schema.sql` becomes the clean-install final state; a `DB_TABLE` registry directs all app reads and writes to physical tables.

**Tech Stack:** PostgreSQL/Supabase, Next.js 15, TypeScript, Vitest.

## Global Constraints

- Preserve historical rows, foreign keys, RLS ownership and token hashing.
- Use only these table groups: `cfg_`, `usr_`, `plan_`, `log_`, `ops_`.
- Keep calendar fields as `date`; record actual instants with `timestamptz`.
- Legacy names are `security_invoker` read views only; application writes must use prefixed tables.
- Do not run hosted migrations, deploy, push, or delete views.

---

### Task 1: Lock the schema contract with failing tests

**Files:**

- Create: `scripts/database-schema-organization-contract.test.mjs`
- Modify: `scripts/baseline-migration-contract.test.mjs`

**Produces:** Contract assertions for physical tables, legacy views, comments, time types, RLS and indexes.

- [ ] **Step 1: Write the failing contract**

```js
const physical = ["cfg_exercises", "usr_athlete_profiles", "usr_lift_profiles", "plan_programs", "plan_workouts", "plan_workout_exercises", "log_set_logs", "log_recommendations", "log_pr_goals", "ops_feedback_reports", "ops_analytics_events", "ops_agent_access_tokens"];
for (const table of physical) {
  expect(migration).toMatch(new RegExp(`rename to ${table}`, "i"));
  expect(schema).toMatch(new RegExp(`create table if not exists public\\.${table}`, "i"));
  expect(migration).toMatch(new RegExp(`comment on table public\\.${table}`, "i"));
}
expect(schema).toMatch(/scheduled_date date not null/i);
expect(schema).toMatch(/completed_at timestamptz/i);
expect(migration).toMatch(/create index if not exists plan_workouts_user_status_scheduled_idx/i);
```

- [ ] **Step 2: Run red test**

Run: `pnpm vitest run scripts/database-schema-organization-contract.test.mjs`

Expected: FAIL because no organization migration exists.

- [ ] **Step 3: Update baseline expectations and commit**

Replace the legacy table list in the baseline test with physical relation names and add a `COMMENT ON TABLE` assertion.

```powershell
git add scripts/database-schema-organization-contract.test.mjs scripts/baseline-migration-contract.test.mjs
git commit -m "test: define database organization contract"
```

### Task 2: Add the in-place migration with metadata and compatibility

**Files:**

- Create: `supabase/migrations/20260725120000_database_schema_organization.sql`

**Produces:** renamed physical tables, prefixed RLS policies/indexes/triggers, comments, recompiled RPCs and legacy read views.

- [ ] **Step 1: Write a guarded relation rename block**

Rename only old `relkind = 'r'` tables, skipping already-renamed relations:

```text
athlete_profiles -> usr_athlete_profiles
exercises -> cfg_exercises
lift_profiles -> usr_lift_profiles
programs -> plan_programs
workouts -> plan_workouts
workout_exercises -> plan_workout_exercises
set_logs -> log_set_logs
recommendations -> log_recommendations
pr_goals -> log_pr_goals
feedback_reports -> ops_feedback_reports
analytics_events -> ops_analytics_events
agent_access_tokens -> ops_agent_access_tokens
```

- [ ] **Step 2: Rebuild security and update metadata**

Enable RLS on all physical tables; replace policies with prefixed names; retain direct `auth.uid() = user_id` checks and ownership joins through `plan_workouts`. Add `public.set_updated_at()` and `<table>_set_updated_at` triggers to every table having `updated_at`. Add indexes:

```sql
create index if not exists plan_programs_user_status_idx on public.plan_programs (user_id, status);
create index if not exists plan_workouts_user_status_scheduled_idx on public.plan_workouts (user_id, status, scheduled_date desc);
create unique index if not exists plan_workout_exercises_workout_order_key on public.plan_workout_exercises (workout_id, order_index);
create index if not exists log_recommendations_user_status_created_idx on public.log_recommendations (user_id, status, created_at desc);
create index if not exists log_pr_goals_user_status_target_idx on public.log_pr_goals (user_id, status, target_date);
```

- [ ] **Step 3: Add full comments and update RPCs**

Write Chinese `COMMENT ON TABLE` and `COMMENT ON COLUMN` statements for every column, including ID/FK targets, statuses, JSON snapshots, units, and `date` versus `timestamptz` meaning. Recreate `replace_active_program`, `substitute_workout_exercise`, `get_standalone_workout_draft`, `save_standalone_workout`, and `create_standalone_workout`, changing only their physical table references. Preserve `security definer`, `search_path`, `auth.uid()` validation and grants.

- [ ] **Step 4: Create read-only compatibility views and test**

```sql
create or replace view public.workouts
with (security_invoker = true)
as select * from public.plan_workouts;
comment on view public.workouts is '兼容读取视图；新代码必须使用 plan_workouts。';
revoke insert, update, delete on public.workouts from authenticated, anon;
```

Repeat for all old names. Run `pnpm vitest run scripts/database-schema-organization-contract.test.mjs` (expected PASS), then commit:

```powershell
git add supabase/migrations/20260725120000_database_schema_organization.sql
git commit -m "feat: organize database tables by domain"
```

### Task 3: Align the clean schema baseline

**Files:**

- Modify: `supabase/schema.sql`

**Produces:** idempotent clean-install schema using only physical prefixed relations.

- [ ] **Step 1: Rewrite all relation references**

Update table creation, FKs, seeds, constraints, RLS, policies, indexes and every function body to the Task 2 map. Keep `start_date`, `end_date`, `scheduled_date`, and `target_date` as `date`; all created/updated/completed/expiry/revocation event fields stay `timestamptz`.

- [ ] **Step 2: Carry over exact metadata**

Define the same trigger, indexes and Chinese comments as Task 2. Retain existing validation, grants, and RPC public interfaces.

- [ ] **Step 3: Run contracts and commit**

Run: `pnpm vitest run scripts/database-schema-organization-contract.test.mjs scripts/baseline-migration-contract.test.mjs scripts/single-workout-sql-contract.test.mjs`

Expected: PASS.

```powershell
git add supabase/schema.sql scripts/baseline-migration-contract.test.mjs
git commit -m "refactor: align database baseline with table prefixes"
```

### Task 4: Switch all application queries to a table registry

**Files:**

- Create: `src/lib/supabase/table-names.ts`
- Create: `src/lib/supabase/table-names.test.ts`
- Modify: `src/components/diagnostics/supabase-diagnostics.tsx`
- Modify: `src/components/dashboard/home-dashboard.tsx`
- Modify: `src/components/history/training-history.tsx`
- Modify: `src/components/plan/program-manager.tsx`
- Modify: `src/components/today/today-workout.tsx`
- Modify: `src/components/progress/progress-dashboard.tsx`
- Modify: `src/components/pr/pr-goal-manager.tsx`
- Modify: `src/components/settings/settings-panel.tsx`
- Modify: `src/components/feedback/feedback-form.tsx`
- Modify: `src/app/api/agent/v1/route.ts`

**Produces:** a sole source of physical relation names for all `.from()` calls.

- [ ] **Step 1: Write the red registry test**

```ts
import { expect, test } from "vitest";
import { DB_TABLE } from "./table-names";
test("uses physical prefixed relations", () => {
  expect(DB_TABLE.workouts).toBe("plan_workouts");
  expect(DB_TABLE.setLogs).toBe("log_set_logs");
});
```

Run: `pnpm vitest run src/lib/supabase/table-names.test.ts` (expected FAIL).

- [ ] **Step 2: Implement the registry and query cutover**

```ts
export const DB_TABLE = {
  exercises: "cfg_exercises", athleteProfiles: "usr_athlete_profiles", liftProfiles: "usr_lift_profiles",
  programs: "plan_programs", workouts: "plan_workouts", workoutExercises: "plan_workout_exercises",
  setLogs: "log_set_logs", recommendations: "log_recommendations", prGoals: "log_pr_goals",
  feedbackReports: "ops_feedback_reports", analyticsEvents: "ops_analytics_events", agentAccessTokens: "ops_agent_access_tokens"
} as const;
```

Import it into every listed file and replace each legacy `.from("...")` target. Preserve selections, filters, write payloads, fallback branches and RPC names. In diagnostics retain readable labels but probe `DB_TABLE` values.

- [ ] **Step 3: Verify and commit**

Run: `rg -n '\\.from\\("(athlete_profiles|exercises|lift_profiles|programs|workouts|workout_exercises|set_logs|recommendations|pr_goals|feedback_reports|analytics_events|agent_access_tokens)"' src`

Expected: no output.

Run: `pnpm vitest run src/lib/supabase/table-names.test.ts` (expected PASS).

```powershell
git add src/lib/supabase src/components src/app/api/agent/v1/route.ts
git commit -m "refactor: use prefixed database tables in app queries"
```

### Task 5: Document rollout and run final verification

**Files:**

- Modify: `docs/12_database_release_runbook.md`

- [ ] **Step 1: Update release operations**

List all 12 physical table names, append migration `20260725120000_database_schema_organization.sql`, require a backup and maintenance window before relation rename, and state old names remain read-only views.

- [ ] **Step 2: Add metadata verification SQL**

```sql
select c.relname, c.relkind, obj_description(c.oid, 'pg_class') as description
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('cfg_exercises', 'plan_workouts', 'log_set_logs', 'ops_agent_access_tokens', 'exercises', 'workouts')
order by c.relname;
```

- [ ] **Step 3: Verify and commit**

Run: `pnpm test`, `pnpm typecheck`, `pnpm release:check`, and `git diff --check`; expected exit code 0 for all.

```powershell
git add docs/12_database_release_runbook.md
git commit -m "docs: document prefixed database schema rollout"
```

## Self-review

- All confirmed requirements map to Tasks 1–5: prefixes, comments, time semantics, compatibility, indexes, RLS/RPC safety, app cutover and rollout checks.
- Relation names are identical across test, migration, baseline and registry tasks.
- The plan contains no placeholders and does not authorize production execution.
