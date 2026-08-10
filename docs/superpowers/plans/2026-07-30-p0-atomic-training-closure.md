# P0 Atomic Training Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make workout completion, duration finalization and Coach recommendation creation one authoritative transaction shared by Web and Agent, and regenerate safe recommendations after history edits.

**Architecture:** PostgreSQL owns terminal validation and recommendation persistence. TypeScript clients save draft group data, then call RPCs and render returned results; they never independently create recommendations after completion. A second RPC atomically revises completed logs and replaces only pending recommendations.

**Tech Stack:** Next.js 15, React, TypeScript, Zod, Vitest, Supabase PostgreSQL/PLpgSQL, pnpm, Vercel.

## Global Constraints

- Preserve `complete_training_workout(p_workout_id uuid, p_duration_seconds integer default null, p_user_id uuid default null)`.
- Preserve actual-duration behavior and production migration order.
- Web and Agent must share the same server completion path.
- Never suggest an increase when completed sets miss target weight or repetitions.
- Non-main lifts must not auto-increase solely because RPE is low.
- History revisions invalidate old pending suggestions and create fresh pending suggestions atomically.
- Never automatically roll back an already accepted/modified plan change.
- Do not deploy before independent QA and user confirmation of the new production SQL migration.

---

### Task 1: SQL transaction and safety contracts

**Files:**
- Create: `supabase/migrations/20260730010000_atomic_training_completion_and_recommendations.sql`
- Modify: `supabase/schema.sql`
- Create: `scripts/atomic-training-closure-sql-contract.test.mjs`
- Modify: `scripts/database-schema-organization-contract.test.mjs` only if its expected final function signatures require updating.

**Interfaces:**
- Internal function:

```sql
public.replace_pending_workout_recommendations(
  p_user_id uuid,
  p_workout_id uuid
) returns jsonb
```

- Public functions:

```sql
public.complete_training_workout(
  p_workout_id uuid,
  p_duration_seconds integer default null,
  p_user_id uuid default null
) returns jsonb

public.revise_completed_workout_logs(
  p_workout_id uuid,
  p_logs jsonb
) returns jsonb
```

- [ ] **Step 1: Write RED SQL contract**

Assert migration and clean schema contain:

```js
expect(sql).toMatch(/replace_pending_workout_recommendations/i);
expect(sql).toMatch(/revise_completed_workout_logs/i);
expect(sql).toMatch(/delete from public\.log_recommendations[\s\S]*status = 'pending'/i);
expect(sql).toMatch(/target_attainment/i);
expect(sql).toMatch(/actual_weight[\s\S]*target_weight/i);
expect(sql).toMatch(/actual_reps[\s\S]*target_reps/i);
expect(sql).toMatch(/jsonb_build_object\('recommendations'/i);
expect(sql).toMatch(/completed set is invalid/i);
```

Run:

```powershell
pnpm vitest run scripts/atomic-training-closure-sql-contract.test.mjs
```

Expected: FAIL because the migration and functions do not exist.

- [ ] **Step 2: Implement recommendation replacement**

The internal function must:

```sql
delete from public.log_recommendations
where user_id = p_user_id
  and workout_id = p_workout_id
  and status = 'pending';
```

Aggregate per `plan_workout_exercises`:

```sql
count(*) as total_sets,
count(*) filter (where sl.completed) as completed_sets,
count(*) filter (
  where sl.completed
    and sl.actual_weight >= sl.target_weight
    and sl.actual_reps >= sl.target_reps
) as attained_sets,
avg(sl.rpe) filter (where sl.completed) as average_rpe
```

Generate exactly one pending recommendation for every weighted exercise with `target_weight > 0`. Use `cfg_exercises.default_increment`, `is_main_lift` and existing `roundToNearestPlate`-equivalent SQL rounding. Main-lift decisions must match the approved design. Non-main lifts return hold unless the existing conservative decrease/deload condition applies.

- [ ] **Step 3: Replace completion function transactionally**

Keep ownership, duration and completed-set checks. Call the internal recommendation function before the terminal update:

```sql
v_recommendations := public.replace_pending_workout_recommendations(v_user_id, p_workout_id);

update public.plan_workouts
set status = 'completed',
    completed_at = coalesce(completed_at, now()),
    duration_seconds = coalesce(
      duration_seconds,
      p_duration_seconds,
      greatest(60, least(43200, extract(epoch from (now() - started_at))::integer))
    ),
    updated_at = now()
where id = p_workout_id;
```

Return:

```sql
jsonb_build_object(
  'workout_id', p_workout_id,
  'status', 'completed',
  'duration_seconds', v_duration_seconds,
  'recommendations', v_recommendations
)
```

For a workout already completed, do not recreate recommendations or overwrite time; return existing pending/accepted/modified recommendations.

- [ ] **Step 4: Implement history revision RPC**

Validate each JSON log belongs to an exercise of the owned completed workout. Reject duplicate `(workout_exercise_id, set_index)` pairs and invalid values. Upsert all logs, call the same recommendation replacement function, and return:

```json
{"workout_id":"uuid","recommendations":[...],"set_logs":[...]}
```

Only pending recommendations are replaced.

- [ ] **Step 5: Add completed-set database guard**

Add a trigger that rejects `completed = true` when:

- `actual_reps is null or actual_reps <= 0`;
- a weighted planned set has `actual_weight is null or actual_weight <= 0`;
- a strength set requiring RPE has missing/out-of-range RPE.

Preserve standalone bodyweight, assisted and reviewed cardio exceptions already represented by exercise metadata.

- [ ] **Step 6: Mirror final definitions and grants into schema**

Grant public RPCs only to `authenticated`; retain service-role behavior inside completion. Revoke the internal helper from `public`, `anon` and `authenticated`.

- [ ] **Step 7: Run SQL contract suite**

```powershell
pnpm vitest run scripts/atomic-training-closure-sql-contract.test.mjs scripts/workout-duration-sql-contract.test.mjs scripts/single-workout-sql-contract.test.mjs scripts/database-schema-organization-contract.test.mjs
```

Expected: all pass and the duration function signature remains intact.

---

### Task 2: Web completion consumes authoritative recommendations

**Files:**
- Modify: `src/components/today/today-workout.tsx`
- Modify: `src/components/today/today-workout.test.tsx`
- Create: `src/domain/completion-result.ts`
- Create: `src/domain/completion-result.test.ts`

**Interfaces:**

```ts
type CompletionRecommendation = {
  exercise_id: string;
  previous_weight: number;
  reason: string;
  recommendation_type: RecommendationType;
  suggested_weight: number;
  status: string;
};

export function parseCompletionResult(value: unknown): {
  durationSeconds: number | null;
  recommendations: CompletionRecommendation[];
  status: "completed";
  workoutId: string;
};
```

- [ ] **Step 1: Write RED parser and component tests**

Test malformed RPC responses are rejected. In the component mock:

```ts
rpc.mockResolvedValue({
  data: {
    workout_id: "workout-1",
    status: "completed",
    duration_seconds: 3600,
    recommendations: [{
      exercise_id: "exercise-1",
      recommendation_type: "hold",
      previous_weight: 100,
      suggested_weight: 100,
      reason: "保持",
      status: "pending"
    }]
  },
  error: null
});
```

Assert the client never calls `.from(DB_TABLE.recommendations).insert(...)`.

- [ ] **Step 2: Confirm RED**

```powershell
pnpm vitest run src/domain/completion-result.test.ts src/components/today/today-workout.test.tsx
```

- [ ] **Step 3: Implement parser and remove client insertion**

After set-log upsert, call only `complete_training_workout`, parse its result, and derive the success Coach panel from returned recommendations. On RPC failure, keep workout state incomplete and preserve form input.

- [ ] **Step 4: Confirm GREEN**

```powershell
pnpm vitest run src/domain/completion-result.test.ts src/components/today/today-workout.test.tsx
```

---

### Task 3: Agent set validation, timer start and shared completion

**Files:**
- Modify: `src/app/api/agent/v1/route.ts`
- Modify: `src/app/api/agent/v1/route.test.ts`

**Interfaces:**
- `record_set` calls `start_training_workout` before persisting the first completed set.
- `complete_workout` keeps calling `complete_training_workout` and returns its recommendations.

- [ ] **Step 1: Write RED Agent tests**

Test:

```ts
await expect(POST(authorizedRequest({
  action: "record_set",
  workout_exercise_id: exerciseId,
  set_index: 1,
  actual_weight: 0,
  actual_reps: 0,
  rpe: 7,
  completed: true
}))).resolves.toHaveProperty("status", 400);
```

For a valid completed set, assert:

```ts
expect(mocks.rpc).toHaveBeenCalledWith("start_training_workout", {
  p_workout_id: "workout-1"
});
```

For completion, assert returned payload includes recommendations from the shared RPC.

- [ ] **Step 2: Confirm RED**

```powershell
pnpm vitest run src/app/api/agent/v1/route.test.ts
```

- [ ] **Step 3: Implement conditional validation**

After loading the exercise and its workout:

```ts
if ((request.completed ?? true) && request.actual_reps <= 0) {
  throw new Error("已完成组的实际次数必须大于 0。");
}
if ((request.completed ?? true) && Number(exercise.target_weight) > 0 && request.actual_weight <= 0) {
  throw new Error("负重训练已完成组的实际重量必须大于 0。");
}
```

Call `start_training_workout` with the owned workout ID before set upsert. Preserve RPE validation.

- [ ] **Step 4: Confirm GREEN**

```powershell
pnpm vitest run src/app/api/agent/v1/route.test.ts
```

---

### Task 4: History revisions regenerate pending advice atomically

**Files:**
- Modify: `src/components/history/training-history.tsx`
- Create: `src/components/history/training-history.test.tsx`
- Create: `src/domain/history-revision-result.ts`
- Create: `src/domain/history-revision-result.test.ts`

**Interfaces:**

```ts
export function parseHistoryRevisionResult(value: unknown): {
  recommendations: RecommendationRow[];
  setLogs: SetLogRow[];
  workoutId: string;
};
```

- [ ] **Step 1: Write RED tests**

Assert saving a completed workout calls:

```ts
supabase.rpc("revise_completed_workout_logs", {
  p_workout_id: workoutId,
  p_logs: normalizedLogs
});
```

Assert it does not directly upsert `DB_TABLE.setLogs`, replaces local recommendations with returned rows, clears caches, and shows:

`历史训练已保存，待处理 Coach 建议已按新数据重新生成；已应用的历史调整不会自动撤销。`

- [ ] **Step 2: Confirm RED**

```powershell
pnpm vitest run src/domain/history-revision-result.test.ts src/components/history/training-history.test.tsx
```

- [ ] **Step 3: Implement RPC-backed history save**

Retain existing client validation, then send the normalized full workout log set to the RPC. Parse the response and update `setLogs` plus recommendations in one state transition. On error, do not mutate local saved state.

- [ ] **Step 4: Confirm GREEN**

```powershell
pnpm vitest run src/domain/history-revision-result.test.ts src/components/history/training-history.test.tsx
```

---

### Task 5: Cross-rule regression, release gate and handoff

**Files:**
- Modify: `src/domain/fitness-coach.test.ts` only if a shared fixture is needed.
- Verify all Task 1–4 files.

- [ ] **Step 1: Add rule parity fixtures**

Create table-driven fixtures for:

- all targets met, RPE 7 → main increase;
- weight missed → no increase;
- reps missed → no increase;
- RPE 9 → decrease;
- accessory low RPE → hold.

The SQL contract must include the same decision branches; the TypeScript unit tests remain the readable product oracle.

- [ ] **Step 2: Run targeted suite**

```powershell
pnpm vitest run scripts/atomic-training-closure-sql-contract.test.mjs src/domain/fitness-coach.test.ts src/domain/completion-result.test.ts src/components/today/today-workout.test.tsx src/app/api/agent/v1/route.test.ts src/domain/history-revision-result.test.ts src/components/history/training-history.test.tsx
```

- [ ] **Step 3: Run full gates**

```powershell
pnpm test
pnpm release:check
```

Expected: zero failures; typecheck, build and local 14-route smoke pass.

- [ ] **Step 4: Commit and push**

```powershell
git add src supabase scripts docs/superpowers/specs/2026-07-30-p0-atomic-training-closure-design.md docs/superpowers/plans/2026-07-30-p0-atomic-training-closure.md
git commit -m "fix: make workout completion atomic"
git push origin codex/p0-remediation
```

- [ ] **Step 5: Independent QA**

Send the fixed commit to “测试” and require explicit validation of rollback semantics, duplicate completion idempotency, Web/Agent parity, invalid zero-value Agent sets, timer start, history suggestion replacement and full gates.

- [ ] **Step 6: Production migration gate**

Give the user the absolute migration path:

`D:\力量训练周期管理\strength-periodization-manager\.worktrees\p0-remediation\supabase\migrations\20260730010000_atomic_training_completion_and_recommendations.sql`

Do not deploy until the user confirms successful execution and independent QA passes.

- [ ] **Step 7: Deploy and notify architect**

Deploy, run formal-domain 14-route smoke and `/api/health`, then send the architect the fixed commit, migration confirmation, QA evidence, deployment URL/ID and smoke output for final acceptance.
