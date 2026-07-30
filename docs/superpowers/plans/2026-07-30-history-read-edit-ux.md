# History Read/Edit UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make history date-first and read-only by default, reveal workout/set details on demand, and require an explicit edit mode that atomically saves duration, set logs, and recalculated pending Coach recommendations.

**Architecture:** Keep calendar filtering and Supabase loading in `TrainingHistory`. Add a focused workout-card component that owns disclosure and edit drafts, plus a pure reducer for cancel-safe edit state. Introduce one authenticated database RPC that composes the existing audited log-revision RPC with duration persistence inside the same PostgreSQL transaction.

**Tech Stack:** Next.js 14, React, TypeScript, Tailwind CSS, Supabase/PostgreSQL, Vitest, React DOM test utilities.

## Global Constraints

- Mobile Web/PWA is the primary surface.
- Preserve the existing calendar and date-selection behavior.
- History records are read-only until the user explicitly selects “修改记录”.
- Entering and cancelling edit mode must never mutate the loaded history cache.
- Saving must atomically persist duration and set logs, then recalculate pending Coach recommendations.
- Existing applied recommendations are not automatically reversed.
- Duration is either unchanged/null or an integer from 60 to 43,200 seconds.
- Completed strength sets retain the real-RPE validation rule; valid numeric zero values must not be treated as missing.
- 375px, 390px, and 430px layouts must not horizontally overflow.
- Primary touch targets must be at least 44px high.
- Do not change plan generation, training prescription, Agent APIs, or completion RPC behavior.
- No deployment until the production migration succeeds and the independent test window explicitly reports “验证通过”.

---

## File Map

- Create `supabase/migrations/20260730123000_history_read_edit_workflow.sql`: authenticated atomic history revision RPC.
- Modify `supabase/schema.sql`: clean-initialization copy of the new RPC.
- Create `scripts/history-read-edit-sql-contract.test.mjs`: SQL ownership, duration, transaction-composition, and grant contract.
- Create `src/components/history/history-workout-editor-state.ts`: pure draft/edit reducer.
- Create `src/components/history/history-workout-editor-state.test.ts`: edit, update, cancel, save-failure, and save-success state tests.
- Create `src/components/history/history-workout-card.tsx`: summary, detail disclosure, explicit edit controls, and local feedback.
- Create `src/components/history/history-workout-card.test.tsx`: mobile interaction and accessibility regression tests.
- Modify `src/components/history/training-history.tsx`: map loaded data into cards and call the new RPC.
- Create `src/components/history/training-history.test.tsx`: integration test for new RPC and Coach refresh.
- Preserve `src/components/history/history-calendar.tsx` and its existing tests unless an integration defect requires a minimal change.

### Task 1: Atomic history revision database contract

**Files:**
- Create: `supabase/migrations/20260730123000_history_read_edit_workflow.sql`
- Modify: `supabase/schema.sql`
- Create: `scripts/history-read-edit-sql-contract.test.mjs`

**Interfaces:**
- Consumes:

```sql
public.revise_completed_workout_logs(p_workout_id uuid, p_logs jsonb)
```

- Produces:

```sql
public.revise_completed_workout(
  p_workout_id uuid,
  p_logs jsonb,
  p_duration_seconds integer default null
) returns jsonb
```

The returned object contains `workout_id`, `duration_seconds`, `set_logs`, and `recommendations`.

- [ ] **Step 1: Write the failing SQL contract test**

Create:

```js
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260730123000_history_read_edit_workflow.sql"
);
const schemaPath = resolve(process.cwd(), "supabase/schema.sql");

describe("history read/edit SQL contract", () => {
  it("atomically composes audited log revision with owned duration persistence", () => {
    const migrationSql = readFileSync(migrationPath, "utf8");
    const schemaSql = readFileSync(schemaPath, "utf8");
    const sql = `${migrationSql}\n${schemaSql}`;
    expect(sql).toMatch(/create or replace function public\.revise_completed_workout\(/i);
    expect(sql).toMatch(/public\.revise_completed_workout_logs\(p_workout_id,\s*p_logs\)/i);
    expect(sql).toMatch(/duration_seconds[\s\S]*between 60 and 43200/i);
    expect(sql).toMatch(/id = p_workout_id[\s\S]*user_id = auth\.uid\(\)/i);
    expect(sql).toMatch(/jsonb_build_object\('duration_seconds'/i);
    expect(sql).toMatch(/grant execute on function public\.revise_completed_workout\(uuid, jsonb, integer\) to authenticated/i);
    expect(sql).not.toMatch(/rename to save_standalone_workout_legacy/i);
    expect(schemaSql).toMatch(/create or replace function public\.replace_pending_workout_recommendations/i);
    expect(schemaSql).toMatch(/create or replace function public\.revise_completed_workout_logs/i);
    expect(schemaSql).toMatch(/create or replace function public\.revise_completed_workout\(/i);
  });
});
```

- [ ] **Step 2: Run the SQL contract and verify RED**

Run:

```powershell
pnpm vitest run scripts/history-read-edit-sql-contract.test.mjs
```

Expected: FAIL because the migration file and RPC do not exist.

- [ ] **Step 3: Implement the migration**

Use a wrapper around the existing audited RPC so the entire call remains one PostgreSQL transaction:

```sql
create or replace function public.revise_completed_workout(
  p_workout_id uuid,
  p_logs jsonb,
  p_duration_seconds integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_duration_seconds integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = 'P0001';
  end if;

  if p_duration_seconds is not null
     and p_duration_seconds not between 60 and 43200 then
    raise exception 'Workout duration is invalid' using errcode = 'P0001';
  end if;

  select duration_seconds
    into v_duration_seconds
  from public.plan_workouts
  where id = p_workout_id
    and user_id = auth.uid()
    and status = 'completed'
    and day_type = 'training'
  for update;

  if not found then
    raise exception 'Completed training workout was not found' using errcode = 'P0001';
  end if;

  v_result := public.revise_completed_workout_logs(p_workout_id, p_logs);

  update public.plan_workouts
  set duration_seconds = coalesce(p_duration_seconds, duration_seconds),
      updated_at = now()
  where id = p_workout_id
    and user_id = auth.uid()
  returning duration_seconds into v_duration_seconds;

  return v_result || jsonb_build_object(
    'duration_seconds', v_duration_seconds,
    'workout_id', p_workout_id
  );
end;
$$;

revoke all on function public.revise_completed_workout(uuid, jsonb, integer)
  from public, anon;
grant execute on function public.revise_completed_workout(uuid, jsonb, integer)
  to authenticated;
```

For clean initialization, first synchronize the final definitions of
`replace_pending_workout_recommendations` and `revise_completed_workout_logs`
from `20260730010000_atomic_training_completion_and_recommendations.sql` into
`supabase/schema.sql`, then append the new wrapper definition. The schema copy
must order dependencies before the wrapper. Do not rename or drop the legacy
two-argument RPC.

- [ ] **Step 4: Run SQL contract tests and verify GREEN**

Run:

```powershell
pnpm vitest run scripts/history-read-edit-sql-contract.test.mjs scripts/atomic-training-closure-sql-contract.test.mjs
```

Expected: both contract files pass.

- [ ] **Step 5: Commit the database contract**

```powershell
git add supabase/migrations/20260730123000_history_read_edit_workflow.sql supabase/schema.sql scripts/history-read-edit-sql-contract.test.mjs
git commit -m "feat: revise completed workouts atomically"
```

### Task 2: Cancel-safe history editor state

**Files:**
- Create: `src/components/history/history-workout-editor-state.ts`
- Create: `src/components/history/history-workout-editor-state.test.ts`

**Interfaces:**

```ts
export type HistoryEditableSet = {
  actual_reps: number | null;
  actual_weight: number | null;
  completed: boolean;
  id: string;
  rpe: number | null;
  set_index: number;
  target_reps: number;
  target_weight: number;
  workout_exercise_id: string;
};

export type HistoryWorkoutEditorState = {
  durationMinutes: string;
  error: string;
  logs: HistoryEditableSet[];
  mode: "read" | "edit" | "saving";
};

export type HistoryWorkoutEditorAction =
  | { type: "begin"; durationSeconds: number | null; logs: HistoryEditableSet[] }
  | { type: "cancel" }
  | { type: "changeDuration"; value: string }
  | { type: "changeLog"; id: string; patch: Partial<HistoryEditableSet> }
  | { type: "save" }
  | { type: "saveFailed"; message: string }
  | { type: "saveSucceeded"; durationSeconds: number | null; logs: HistoryEditableSet[] };

export function createHistoryWorkoutEditorState(): HistoryWorkoutEditorState;
export function reduceHistoryWorkoutEditor(
  state: HistoryWorkoutEditorState,
  action: HistoryWorkoutEditorAction
): HistoryWorkoutEditorState;
export function parseHistoryDurationMinutes(
  value: string
): { ok: true; seconds: number | null } | { ok: false; message: string };
```

- [ ] **Step 1: Write failing reducer tests**

Cover:

```ts
it("copies loaded values into a draft and cancel discards every change", () => {
  const editing = reduceHistoryWorkoutEditor(createHistoryWorkoutEditorState(), {
    type: "begin",
    durationSeconds: 2700,
    logs: [log]
  });
  const changed = reduceHistoryWorkoutEditor(editing, {
    type: "changeLog",
    id: log.id,
    patch: { actual_weight: 82.5 }
  });
  expect(changed.logs[0].actual_weight).toBe(82.5);
  expect(reduceHistoryWorkoutEditor(changed, { type: "cancel" }))
    .toEqual(createHistoryWorkoutEditorState());
});

it("keeps the draft editable after a save failure", () => {
  const saving = reduceHistoryWorkoutEditor(editingState, { type: "save" });
  const failed = reduceHistoryWorkoutEditor(saving, {
    type: "saveFailed",
    message: "网络连接失败，请重试。"
  });
  expect(failed.mode).toBe("edit");
  expect(failed.logs).toEqual(editingState.logs);
});

it.each([
  ["", { ok: true, seconds: null }],
  ["1", { ok: true, seconds: 60 }],
  ["45", { ok: true, seconds: 2700 }],
  ["720", { ok: true, seconds: 43200 }]
])("accepts history duration %s", (value, expected) => {
  expect(parseHistoryDurationMinutes(value)).toEqual(expected);
});
```

Also reject `0`, `721`, decimals, and non-numeric text with the user-facing message `训练时长请输入 1–720 的整数分钟。`.

- [ ] **Step 2: Run reducer tests and verify RED**

Run:

```powershell
pnpm vitest run src/components/history/history-workout-editor-state.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the reducer**

The `begin` and `saveSucceeded` actions must clone each log:

```ts
function cloneLogs(logs: HistoryEditableSet[]) {
  return logs.map((log) => ({ ...log }));
}

export function createHistoryWorkoutEditorState(): HistoryWorkoutEditorState {
  return { durationMinutes: "", error: "", logs: [], mode: "read" };
}

export function parseHistoryDurationMinutes(value: string) {
  if (value.trim() === "") return { ok: true as const, seconds: null };
  if (!/^\d+$/.test(value)) {
    return { ok: false as const, message: "训练时长请输入 1–720 的整数分钟。" };
  }
  const minutes = Number(value);
  if (minutes < 1 || minutes > 720) {
    return { ok: false as const, message: "训练时长请输入 1–720 的整数分钟。" };
  }
  return { ok: true as const, seconds: minutes * 60 };
}
```

Do not retain a hidden mutable baseline; cancelling always returns a fresh read state and the parent remains the source of truth.

- [ ] **Step 4: Run reducer tests and verify GREEN**

Run:

```powershell
pnpm vitest run src/components/history/history-workout-editor-state.test.ts
```

Expected: all editor-state tests pass.

- [ ] **Step 5: Commit the editor state**

```powershell
git add src/components/history/history-workout-editor-state.ts src/components/history/history-workout-editor-state.test.ts
git commit -m "feat: add cancel-safe history editing state"
```

### Task 3: Read-only history workout card with explicit detail and edit modes

**Files:**
- Create: `src/components/history/history-workout-card.tsx`
- Create: `src/components/history/history-workout-card.test.tsx`

**Interfaces:**

```ts
export type HistoryWorkoutCardExercise = {
  id: string;
  logs: HistoryEditableSet[];
  name: string;
  targetReps: number;
  targetSets: number;
  targetWeight: number;
};

export type HistoryWorkoutCardRecommendation = {
  id: string;
  label: string;
  previousWeight: number;
  statusLabel: string;
  suggestedWeight: number;
};

export type SaveHistoryWorkoutInput = {
  durationSeconds: number | null;
  logs: HistoryEditableSet[];
  workoutId: string;
};

export type SaveHistoryWorkoutResult = {
  durationSeconds: number | null;
  logs: HistoryEditableSet[];
};

export type HistoryWorkoutCardProps = {
  durationSeconds: number | null;
  exercises: HistoryWorkoutCardExercise[];
  initiallyExpanded: boolean;
  isRecovery: boolean;
  name: string;
  onSave(input: SaveHistoryWorkoutInput): Promise<SaveHistoryWorkoutResult>;
  onValidate(logs: HistoryEditableSet[]):
    | { ok: true; logs: HistoryEditableSet[] }
    | { ok: false; message: string };
  recommendations: HistoryWorkoutCardRecommendation[];
  review: {
    averageRpe: number | null;
    completedSets: number;
    completionRate: number;
    headline: string;
    plannedSets: number;
    tone: "good" | "neutral" | "warning";
    volume: number;
  };
  scheduledDate: string;
  workoutId: string;
};
```

- [ ] **Step 1: Write failing component tests**

Use React `createRoot` and `act`. Prove:

```tsx
expect(view.textContent).toContain("45 分钟");
expect(view.textContent).toContain("最佳组：80kg × 5");
expect(view.querySelectorAll("input")).toHaveLength(0);
expect(view.textContent).not.toContain("保存修改");

act(() => clickButton(view, "查看详情"));
expect(view.textContent).toContain("第 1 组");
expect(view.querySelectorAll("input")).toHaveLength(0);

act(() => clickButton(view, "修改记录"));
expect(view.textContent).toContain("正在修改历史记录");
expect(view.querySelector("input[aria-label='实际训练时长（分钟）']")).not.toBeNull();
expect(view.querySelector("input[aria-label='第 1 组重量 kg']")).not.toBeNull();

act(() => clickButton(view, "取消"));
expect(view.querySelectorAll("input")).toHaveLength(0);
expect(onSave).not.toHaveBeenCalled();
```

Add one successful save test and one failed save test. A failed save keeps inputs and the draft; a successful save returns to read mode and announces `历史训练已保存，Coach 建议已重新计算。`.

- [ ] **Step 2: Run component tests and verify RED**

Run:

```powershell
pnpm vitest run src/components/history/history-workout-card.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement summary and disclosure**

The initial card shows:

- date, workout name, completed status;
- duration, completed sets, completion rate, volume, average RPE;
- per-exercise best-set summary;
- one `查看详情`/`收起详情` button with `aria-expanded`.

Detail mode renders set values as text, not disabled inputs. Use `tabular-nums` and preserve decimal formatting.

- [ ] **Step 4: Implement edit mode**

On “修改记录”, dispatch `begin` with the currently loaded props. Render:

- visible `正在修改历史记录`;
- duration input using `parseHistoryDurationMinutes`;
- weight, reps, RPE inputs and 44px completion buttons;
- `取消` and `保存修改`.

Before `onSave`, retain the existing domain validation contract by accepting an `onValidate` callback or returning structured validation from the parent. Do not duplicate weaker validation inside the component.

```ts
onValidate(logs: HistoryEditableSet[]):
  | { ok: true; logs: HistoryEditableSet[] }
  | { ok: false; message: string };
```

Call `onSave` only with normalized logs from `onValidate`.

- [ ] **Step 5: Run component tests and verify GREEN**

Run:

```powershell
pnpm vitest run src/components/history/history-workout-card.test.tsx src/components/history/history-workout-editor-state.test.ts
```

Expected: all history card/editor tests pass with no new `act` warnings.

- [ ] **Step 6: Commit the card**

```powershell
git add src/components/history/history-workout-card.tsx src/components/history/history-workout-card.test.tsx
git commit -m "feat: separate history reading from editing"
```

### Task 4: Integrate history cards and the new atomic RPC

**Files:**
- Modify: `src/components/history/training-history.tsx`
- Create: `src/components/history/training-history.test.tsx`

**Interfaces:**
- Consumes: `HistoryWorkoutCard`, current history queries, current set validation functions, and `revise_completed_workout`.
- Produces: unchanged `TrainingHistory` export and unchanged calendar routing.

- [ ] **Step 1: Write the failing integration test**

Mock one completed workout, one exercise, logs, and recommendations. Assert:

```tsx
expect(view.textContent).toContain("当天训练摘要");
expect(view.querySelectorAll("input")).toHaveLength(0);

act(() => clickButton(view, "查看详情"));
act(() => clickButton(view, "修改记录"));
setInputValue(view.querySelector("input[aria-label='实际训练时长（分钟）']")!, "50");
setInputValue(view.querySelector("input[aria-label='第 1 组重量 kg']")!, "82.5");

await act(async () => clickButton(view, "保存修改"));

expect(supabase.rpc).toHaveBeenCalledWith("revise_completed_workout", {
  p_duration_seconds: 3000,
  p_logs: expect.arrayContaining([
    expect.objectContaining({ actual_weight: 82.5, set_index: 1 })
  ]),
  p_workout_id: "workout-1"
});
expect(view.textContent).toContain("历史训练已保存，Coach 建议已重新计算。");
```

Also test that selecting a date with no completed workout keeps the existing calendar empty-state message.

- [ ] **Step 2: Run integration tests and verify RED**

Run:

```powershell
pnpm vitest run src/components/history/training-history.test.tsx
```

Expected: FAIL because the page still renders editable fields immediately and calls the legacy RPC.

- [ ] **Step 3: Extract validation without weakening it**

Move the current normalization and validation block into a local pure function exported for tests:

```ts
export function validateHistoryWorkoutLogs({
  exercises,
  logs
}: {
  exercises: WorkoutExerciseRow[];
  logs: SetLogRow[];
}):
  | { ok: true; logs: SetLogRow[] }
  | { ok: false; message: string };
```

Reuse `resolveCompletedSetValues`, `validateRecordedSet`, `getHistoryLoadType`, and `requiresRealRpe`. Preserve the exact rule that a completed strength set requires RPE 1–10.

- [ ] **Step 4: Integrate the card**

For each selected workout:

- compute review and exercise best sets in the parent;
- pass `initiallyExpanded={workout.id === focusedWorkoutId}`;
- preserve the focused-workout wrapper/ref and reduced-motion scrolling;
- map recommendations to display-only card props;
- keep rest-day cards non-editable.

Change save to:

```ts
const { data, error } = await supabase.rpc("revise_completed_workout", {
  p_workout_id: workoutId,
  p_logs: normalizedLogs.map(toRpcLog),
  p_duration_seconds: durationSeconds
});
```

On success:

- replace returned logs;
- update the matching workout `duration_seconds`;
- replace pending recommendations for the workout;
- clear training caches;
- return the normalized result to the card.

On failure, throw a friendly normalized message so the card remains in edit mode. Do not show raw `TypeError: Load failed`.

- [ ] **Step 5: Run focused history tests**

Run:

```powershell
pnpm vitest run src/components/history/history-workout-editor-state.test.ts src/components/history/history-workout-card.test.tsx src/components/history/training-history.test.tsx src/components/history/history-calendar.test.tsx src/components/history/history-workout-focus.test.ts src/domain/history-calendar.test.ts src/domain/history-date-filter.test.ts
```

Expected: all focused history tests pass.

- [ ] **Step 6: Run full tests and release gate**

Run:

```powershell
pnpm test
pnpm release:check
```

Expected:

- all non-environment tests pass;
- TypeScript exits `0`;
- production build exits `0`;
- local 14-route and `/api/health` smoke pass.

- [ ] **Step 7: Check mobile layouts**

At 375px, 390px, and 430px:

- calendar does not overflow;
- summary cards fit without clipped numbers;
- no editable controls appear before “修改记录”;
- set rows show full `22.5` decimal values;
- completion controls and save/cancel buttons are at least 44px;
- bottom navigation does not cover save/cancel actions.

- [ ] **Step 8: Commit integration**

```powershell
git add src/components/history/training-history.tsx src/components/history/training-history.test.tsx
git commit -m "feat: make history read-only until editing"
```

## Production Migration and Independent Release Gate

The implementation window must provide:

- fixed commit;
- clean `git status`;
- migration path `supabase/migrations/20260730123000_history_read_edit_workflow.sql`;
- focused test, full test, and `release:check` evidence.

The user must execute only that migration in Supabase and explicitly confirm success.

The independent test window must verify:

1. date calendar behavior is unchanged;
2. history cards are read-only by default;
3. details expand without entering edit mode;
4. cancel discards weight, reps, RPE, completion, and duration drafts;
5. failed save preserves the draft;
6. successful save exits edit mode and updates duration/sets;
7. pending Coach recommendations are recalculated;
8. applied recommendations are not silently undone;
9. zero values and decimal weights remain valid/displayed;
10. 375px, 390px, and 430px layouts do not overflow.

Only after both the migration confirmation and explicit “验证通过” may the implementation window deploy the fixed commit. The deployment report must include commit, deployment ID, deployment URL, production URL, and 14-route production smoke results.
