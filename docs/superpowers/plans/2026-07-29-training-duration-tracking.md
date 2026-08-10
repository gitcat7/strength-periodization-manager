# Training Duration Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record reliable elapsed training time for planned and standalone workouts, restore it during continued training, allow correction before completion, and show the result in history.

**Architecture:** Persist `started_at` and final `duration_seconds` on `plan_workouts`. Use one small domain module for elapsed-time formatting and manual-duration validation, one shared completion editor, idempotent Supabase start/complete contracts, and existing planned/standalone recorder state for display. Old rows remain nullable and are never guessed or backfilled.

**Tech Stack:** Next.js 15, React, TypeScript, Vitest, Tailwind CSS, Supabase PostgreSQL/PLpgSQL, pnpm, Vercel.

## Global Constraints

- Support both planned training and standalone/free training.
- Start only on the first weight, reps, RPE, or completed-set interaction; page view and exercise selection do not start time.
- Persist the first start time across reloads and devices; later interactions must not reset it.
- Show elapsed time while training and clear browser intervals on completion or unmount.
- Completion allows an integer manual duration from 1 through 720 minutes.
- If `started_at` is absent at completion, manual duration is required.
- Do not infer or backfill duration for historical rows.
- Database migration must run before deploying dependent frontend code.
- Preserve RLS and authenticated ownership checks.
- Use TDD RED→GREEN and do not deploy until the independent “测试” task passes.

---

### Task 1: Duration domain contract and shared completion editor

**Files:**
- Create: `src/domain/workout-duration.ts`
- Create: `src/domain/workout-duration.test.ts`
- Create: `src/components/workout/workout-duration-editor.tsx`
- Create: `src/components/workout/workout-duration-editor.test.tsx`

**Interfaces:**
- Produces:
  - `getElapsedDurationSeconds(startedAt: string | null, nowMs?: number): number | null`
  - `formatWorkoutDuration(seconds: number | null): string`
  - `validateManualDurationMinutes(value: string): { ok: true; seconds: number } | { ok: false; message: string }`
  - `getAutomaticDurationMinutes(startedAt: string | null, nowMs?: number): number | null`
  - `WorkoutDurationEditor` props:

```ts
type WorkoutDurationEditorProps = {
  automaticMinutes: number | null;
  manualMinutes: string;
  onManualMinutesChange(value: string): void;
  onManualModeChange(enabled: boolean): void;
  manualMode: boolean;
};
```

- [ ] **Step 1: Write failing domain tests**

```ts
expect(getElapsedDurationSeconds("2026-07-29T10:00:00.000Z", Date.parse("2026-07-29T11:02:03.000Z"))).toBe(3723);
expect(getElapsedDurationSeconds(null)).toBeNull();
expect(formatWorkoutDuration(3723)).toBe("1 小时 2 分钟");
expect(formatWorkoutDuration(null)).toBe("未记录");
expect(validateManualDurationMinutes("1")).toEqual({ ok: true, seconds: 60 });
expect(validateManualDurationMinutes("720")).toEqual({ ok: true, seconds: 43200 });
expect(validateManualDurationMinutes("0")).toEqual({ ok: false, message: "训练时长请输入 1–720 的整数分钟。" });
expect(validateManualDurationMinutes("12.5")).toEqual({ ok: false, message: "训练时长请输入 1–720 的整数分钟。" });
```

- [ ] **Step 2: Run domain tests and confirm RED**

Run:

```powershell
pnpm vitest run src/domain/workout-duration.test.ts
```

Expected: FAIL because `workout-duration.ts` does not exist.

- [ ] **Step 3: Implement the domain functions**

```ts
const MAX_DURATION_MINUTES = 720;

export function getElapsedDurationSeconds(startedAt: string | null, nowMs = Date.now()) {
  if (!startedAt) return null;
  const startedMs = Date.parse(startedAt);
  if (!Number.isFinite(startedMs)) return null;
  return Math.max(0, Math.floor((nowMs - startedMs) / 1000));
}

export function getAutomaticDurationMinutes(startedAt: string | null, nowMs = Date.now()) {
  const seconds = getElapsedDurationSeconds(startedAt, nowMs);
  return seconds === null ? null : Math.max(1, Math.round(seconds / 60));
}

export function formatWorkoutDuration(seconds: number | null) {
  if (seconds === null) return "未记录";
  const totalMinutes = Math.max(1, Math.round(seconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours} 小时 ${minutes} 分钟` : `${minutes} 分钟`;
}

export function validateManualDurationMinutes(value: string) {
  if (!/^\d+$/.test(value)) {
    return { ok: false as const, message: "训练时长请输入 1–720 的整数分钟。" };
  }
  const minutes = Number(value);
  if (minutes < 1 || minutes > MAX_DURATION_MINUTES) {
    return { ok: false as const, message: "训练时长请输入 1–720 的整数分钟。" };
  }
  return { ok: true as const, seconds: minutes * 60 };
}
```

- [ ] **Step 4: Write the shared editor component test**

```tsx
render(
  <WorkoutDurationEditor
    automaticMinutes={62}
    manualMinutes=""
    manualMode={false}
    onManualMinutesChange={onChange}
    onManualModeChange={onMode}
  />
);
expect(screen.getByText("自动记录时长：1 小时 2 分钟")).toBeTruthy();
expect(screen.getByText("如果训练结束后忘记及时点击完成，请检查并修改时长。")).toBeTruthy();
fireEvent.click(screen.getByRole("button", { name: "修改时长" }));
expect(onMode).toHaveBeenCalledWith(true);
```

- [ ] **Step 5: Implement the shared editor**

Render the automatic value, required reminder, a `修改时长` button, and—when `manualMode` is true—an integer input with `inputMode="numeric"`, label `实际训练时长（分钟）`, and the 1–720 hint. When `automaticMinutes` is `null`, open manual mode and state that a duration is required.

- [ ] **Step 6: Run Task 1 tests and confirm GREEN**

```powershell
pnpm vitest run src/domain/workout-duration.test.ts src/components/workout/workout-duration-editor.test.tsx
```

Expected: both files pass.

---

### Task 2: Database migration, schema, and SQL contracts

**Files:**
- Create: `supabase/migrations/20260729233000_workout_duration_tracking.sql`
- Modify: `supabase/schema.sql`
- Create: `scripts/workout-duration-sql-contract.test.mjs`

**Interfaces:**
- Adds `plan_workouts.started_at timestamptz null`.
- Adds `plan_workouts.duration_seconds integer null check (duration_seconds between 60 and 43200)`.
- Adds `start_training_workout(p_workout_id uuid) returns timestamptz`.
- Replaces `complete_training_workout(p_workout_id uuid, p_duration_seconds integer default null, p_user_id uuid default null) returns jsonb`.
- `save_standalone_workout(jsonb)` accepts `started_at` and optional `duration_seconds`, preserves the first start time, and returns:

```json
{"workout_id":"uuid","started_at":"ISO timestamp","duration_seconds":null}
```

- `get_standalone_workout_draft()` returns `started_at`.

- [ ] **Step 1: Write the failing SQL contract test**

The test must read both migration and `supabase/schema.sql`, then assert:

```js
expect(sql).toMatch(/started_at\s+timestamptz/i);
expect(sql).toMatch(/duration_seconds\s+integer/i);
expect(sql).toMatch(/duration_seconds\s+between\s+60\s+and\s+43200/i);
expect(sql).toMatch(/create or replace function public\.start_training_workout/i);
expect(sql).toMatch(/coalesce\(started_at,\s*now\(\)\)/i);
expect(sql).toMatch(/p_duration_seconds\s+integer/i);
expect(sql).toMatch(/completed_at[\s\S]*duration_seconds/i);
expect(sql).toMatch(/'started_at',\s*v_workout\.started_at/i);
```

- [ ] **Step 2: Run the SQL contract and confirm RED**

```powershell
pnpm vitest run scripts/workout-duration-sql-contract.test.mjs
```

Expected: FAIL because the migration and fields do not exist.

- [ ] **Step 3: Add fields and idempotent start RPC**

The start RPC must follow this behavior:

```sql
select * into v_workout
from public.plan_workouts
where id = p_workout_id
  and user_id = auth.uid()
  and day_type = 'training'
  and status in ('scheduled', 'draft')
for update;

if v_workout.id is null then
  raise exception 'Training workout was not found' using errcode = 'P0001';
end if;

update public.plan_workouts
set started_at = coalesce(started_at, now()), updated_at = now()
where id = p_workout_id
returning started_at into v_started_at;
```

Revoke from `public, anon`; grant only to `authenticated`.

- [ ] **Step 4: Extend atomic planned completion**

Validate explicit duration when supplied:

```sql
if p_duration_seconds is not null and p_duration_seconds not between 60 and 43200 then
  raise exception 'Workout duration is invalid' using errcode = 'P0001';
end if;
if v_workout.started_at is null and p_duration_seconds is null then
  raise exception 'Workout duration is required' using errcode = 'P0001';
end if;
```

Write completion atomically:

```sql
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

Preserve service-role identity behavior and all existing completed-set validation.

- [ ] **Step 5: Extend standalone draft and completion**

Parse `p_payload ->> 'started_at'` as `timestamptz`, but never allow an update to replace an existing non-null start. For completion, accept `duration_seconds`, require it when no start exists, and use the same 60–43200 validation and automatic fallback. Return a JSON object instead of a bare UUID, and add `started_at` to the draft getter.

- [ ] **Step 6: Mirror the final database definitions into clean schema**

Update the base table definition, comments, grants and the final effective definitions in `supabase/schema.sql`. Do not edit historical migration files.

- [ ] **Step 7: Run SQL contracts and existing database contracts**

```powershell
pnpm vitest run scripts/workout-duration-sql-contract.test.mjs scripts/single-workout-sql-contract.test.mjs scripts/database-schema-organization-contract.test.mjs
```

Expected: all pass.

---

### Task 3: Planned workout start, live display, and completion correction

**Files:**
- Modify: `src/components/today/today-workout.tsx`
- Modify: `src/components/today/today-workout.test.tsx`

**Interfaces:**
- `WorkoutRow` gains `started_at: string | null` and `duration_seconds: number | null`.
- The load query selects both fields.
- First valid group edit invokes `start_training_workout` once per loaded workout.
- Completion RPC sends `p_duration_seconds` as manual seconds or `null`.

- [ ] **Step 1: Write failing planned-workout tests**

Cover these exact behaviors with fake timers:

```ts
expect(startRpc).not.toHaveBeenCalled(); // after initial render
fireEvent.change(weightInput, { target: { value: "100" } });
expect(startRpc).toHaveBeenCalledTimes(1);
fireEvent.change(repsInput, { target: { value: "5" } });
expect(startRpc).toHaveBeenCalledTimes(1);
expect(screen.getByText("已训练 00:00:00")).toBeTruthy();
vi.advanceTimersByTime(62_000);
expect(screen.getByText("已训练 00:01:02")).toBeTruthy();
```

Also test an already loaded `started_at` resumes immediately, completion preview shows the reminder/editor, invalid manual duration blocks RPC, valid `45` sends `p_duration_seconds: 2700`, and unmount clears the interval.

- [ ] **Step 2: Run the planned component test and confirm RED**

```powershell
pnpm vitest run src/components/today/today-workout.test.tsx
```

- [ ] **Step 3: Add start-state and live display**

Add `startedAt`, `elapsedSeconds`, `manualDurationMode`, `manualDurationMinutes`, and one `useRef` guard for an in-flight start request. The `ensureWorkoutStarted()` function must:

```ts
if (!workout || workout.started_at || startRequestRef.current) return workout?.started_at ?? null;
startRequestRef.current = true;
const { data, error } = await supabase.rpc("start_training_workout", { p_workout_id: workout.id });
startRequestRef.current = false;
if (error || typeof data !== "string") throw new Error(error?.message ?? "训练开始时间保存失败。");
setWorkout((current) => current ? { ...current, started_at: data } : current);
return data;
```

Call it on the first weight/reps/RPE edit and on false→true set completion. Do not call it when merely opening the page.

- [ ] **Step 4: Add completion correction**

At preview time derive automatic minutes from `started_at`. Validate manual input with `validateManualDurationMinutes`. If no start exists, force manual mode. Pass `p_duration_seconds` only for a valid manual value; otherwise pass `null` and let the atomic RPC calculate.

- [ ] **Step 5: Run planned tests and confirm GREEN**

```powershell
pnpm vitest run src/components/today/today-workout.test.tsx src/domain/workout-duration.test.ts
```

Expected: all pass.

---

### Task 4: Standalone workout persistence, continuation, and completion correction

**Files:**
- Modify: `src/domain/single-workout.ts`
- Modify: `src/domain/single-workout.test.ts`
- Modify: `src/components/single-workout/single-workout-recorder.tsx`
- Modify: `src/components/single-workout/single-workout-recorder.test.tsx`

**Interfaces:**
- Standalone draft parser accepts `started_at`.
- Save payload accepts `startedAt?: string` and `durationSeconds?: number`.
- RPC result is normalized from `{ workout_id, started_at, duration_seconds }`.

- [ ] **Step 1: Write failing standalone tests**

Test:

- Adding an exercise alone does not start.
- First weight/reps/RPE edit or first completion starts once.
- First interaction immediately persists a draft and receives its `workout_id`/`started_at`.
- Reloaded draft restores the original start.
- Live display advances with fake timers.
- Completion reminder and manual correction match planned training.
- Valid `90` sends `duration_seconds: 5400`.
- Completed summary and unmount clear elapsed/rest timers.

- [ ] **Step 2: Run standalone tests and confirm RED**

```powershell
pnpm vitest run src/domain/single-workout.test.ts src/components/single-workout/single-workout-recorder.test.tsx
```

- [ ] **Step 3: Extend standalone payload/parser**

Use this payload shape:

```ts
return {
  ...(workoutId ? { workout_id: workoutId } : {}),
  ...(startedAt ? { started_at: startedAt } : {}),
  ...(durationSeconds ? { duration_seconds: durationSeconds } : {}),
  scheduled_date: date,
  status: "draft" as const,
  exercises
};
```

The parser must return `started_at: string | null` without requiring it for old drafts.

- [ ] **Step 4: Persist the first interaction immediately**

Create one guarded async `ensureStandaloneStarted(nextSelected)` that snapshots `new Date().toISOString()`, calls `save_standalone_workout` with draft status and the full current exercise state, then stores the returned workout ID and server start time. Failure keeps input intact and shows “训练开始时间保存失败，请检查网络后重试。”

Input handlers must compute `nextSelected`, update state, and pass that same snapshot to the start function so the first typed value is not lost through stale React state.

- [ ] **Step 5: Add live display and completion correction**

Reuse the Task 1 helpers/editor. Completion payload includes manual seconds only when modified. On successful completion, preserve the returned duration in the read-only success summary and stop elapsed/rest intervals.

- [ ] **Step 6: Run standalone tests and confirm GREEN**

```powershell
pnpm vitest run src/domain/single-workout.test.ts src/components/single-workout/single-workout-recorder.test.tsx
```

Expected: all pass.

---

### Task 5: History duration display

**Files:**
- Modify: `src/components/history/training-history.tsx`
- Create: `src/components/history/training-history.test.tsx`

**Interfaces:**
- `WorkoutRow` gains `duration_seconds: number | null`.
- Both modern and legacy fallback selects include `duration_seconds` only where the deployed migration guarantees it; no pre-migration deployment is allowed.

- [ ] **Step 1: Write failing history tests**

```tsx
expect(screen.getByText("训练时长")).toBeTruthy();
expect(screen.getByText("1 小时 2 分钟")).toBeTruthy();
```

Render another completed workout with `duration_seconds: null` and assert `未记录`.

- [ ] **Step 2: Run history test and confirm RED**

```powershell
pnpm vitest run src/components/history/training-history.test.tsx
```

- [ ] **Step 3: Load and render duration**

Add `duration_seconds` to history queries/cache and render a compact row in each completed training article:

```tsx
<p className="mt-2 text-sm text-muted">
  训练时长：{formatWorkoutDuration(workout.duration_seconds)}
</p>
```

Do not add aggregate duration metrics in this release.

- [ ] **Step 4: Run history test and confirm GREEN**

```powershell
pnpm vitest run src/components/history/training-history.test.tsx
```

---

### Task 6: Full verification, commit, migration handoff, independent QA, and release

**Files:**
- Verify all files from Tasks 1–5.
- Do not create another migration.

- [ ] **Step 1: Run targeted suite**

```powershell
pnpm vitest run src/domain/workout-duration.test.ts src/components/workout/workout-duration-editor.test.tsx scripts/workout-duration-sql-contract.test.mjs src/components/today/today-workout.test.tsx src/domain/single-workout.test.ts src/components/single-workout/single-workout-recorder.test.tsx src/components/history/training-history.test.tsx
```

- [ ] **Step 2: Run full gates**

```powershell
pnpm test
pnpm release:check
```

Expected: zero failures; typecheck, production build and local 14-route smoke pass.

- [ ] **Step 3: Commit and push**

```powershell
git add src supabase scripts docs/superpowers/plans/2026-07-29-training-duration-tracking.md
git commit -m "feat: track actual workout duration"
git push origin codex/p0-remediation
```

- [ ] **Step 4: Stop for production migration**

Report the fixed commit and provide the absolute migration link:

`D:\力量训练周期管理\strength-periodization-manager\.worktrees\p0-remediation\supabase\migrations\20260729233000_workout_duration_tracking.sql`

Do not deploy until the user confirms that SQL executed successfully.

- [ ] **Step 5: Send fixed commit to independent “测试” task**

The QA request must cover both workout types, start triggers, non-triggering page/exercise actions, refresh continuation, manual correction, old null history, SQL ownership/idempotency, interval cleanup, and full release gates.

- [ ] **Step 6: Deploy only after both gates**

Required gates:

1. User confirms production SQL migration succeeded.
2. “测试” explicitly reports validation passed for the fixed commit.

Then deploy production, run the formal-domain 14-route smoke and `/api/health`.

- [ ] **Step 7: Notify architect for final acceptance**

Send the architect task the commit, production deployment URL/ID, migration confirmation, independent QA result, online smoke result, and an explicit request for final acceptance.
