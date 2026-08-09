# 训练序列与日历约束排程（第一期）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用“训练序列优先 + 日历约束层”替代每周训练天数与自由安排，使计划能可靠处理练休循环、节假日、个人不可训练日、额外休息、暂停和恢复。

**Architecture:** 纯领域排程器计算训练序列在 Asia/Shanghai 自然日上的落点与变更预览；Supabase RPC 以计划版本为乐观锁，一次写入日程、跳过原因和审计事件。计划页只展示领域预览并调用 RPC，今天页只读取统一后的日程状态。

**Tech Stack:** Next.js 15、React 19、TypeScript、Vitest、Supabase PostgreSQL/PLpgSQL、Tailwind、Zod。

## Global Constraints

- 重量单位固定为 kg；单次训练时长仅允许 45、60、75、90、120、150、180 分钟。
- 新计划只允许 `cadence` 和 `fixed_weekdays`；旧 `flexible` 计划仅可读取和继续执行。
- 练休循环不使用自然周，也不接受星期参数；固定星期不接受练几休几参数。
- 训练方向由用户选择“继续当前循环”或“从下个循环第一节开始”；系统不得预选任何方向。
- 中断时长仅影响保守负荷提示，绝不自动决定训练方向。
- 个人不可训练日 > 单日节假日覆盖 > 节假日默认策略 > 长期排程规则。
- 已完成训练、历史组记录和训练草稿不得在重排中被移动、复制或删除。
- 所有重排必须以 `schedule_revision` 乐观锁原子执行；失败后旧日程完整保留。
- 日历计算和数据库日期语义统一为 `Asia/Shanghai`。
- 不提供医疗判断；受伤恢复只展示用户确认与保守训练提示。

---

## File Structure

- `src/domain/schedule-rule.ts`：长期排程规则、训练密度、快捷预设和表单校验。
- `src/domain/sequence-calendar.ts`：无副作用的初始日程与重排预览计算。
- `src/domain/schedule-adjustment.ts`：暂停/额外休息的用户路线、跳过摘要和恢复负荷提示。
- `src/components/plan/schedule-rule-fields.tsx`：计划设置中的两种安排方式和 28 天预览。
- `src/components/plan/schedule-adjustment-dialog.tsx`：不预选恢复路线的确认对话框。
- `src/components/plan/program-manager.tsx`：保存计划参数、加载日程元数据、调用重排 RPC、展示计划状态。
- `src/components/today/today-workout.tsx`：展示暂停/待确认/训练/休息四种唯一主状态。
- `src/lib/supabase/table-names.ts`：新增日历、不可训练日和事件表映射。
- `supabase/migrations/20260730100000_sequence_calendar_scheduling.sql`：前向数据库迁移、RLS、RPC 和约束。
- `supabase/schema.sql`：与迁移等价的空库基线。
- `supabase/tests/sequence_calendar_scheduling.test.sql`：原子重排、版本冲突和用户隔离的 pgTAP 覆盖。

### Task 1: 建立排程规则领域模型

**Files:**
- Create: `src/domain/schedule-rule.ts`
- Create: `src/domain/schedule-rule.test.ts`
- Modify: `src/domain/program.ts`
- Modify: `src/domain/program.test.ts`

**Interfaces:**

```ts
export type SupportedScheduleMode = "cadence" | "fixed_weekdays";
export type ScheduleRule =
  | { mode: "cadence"; trainDays: number; restDays: number }
  | { mode: "fixed_weekdays"; weekdays: number[] };
export type HolidayPolicy = "train" | "rest_and_shift";
export const weekdayPresets: readonly SchedulePreset[];
export function validateScheduleRule(rule: ScheduleRule): Record<string, string>;
export function getScheduleDensity(rule: ScheduleRule): number;
export function getScheduleRuleLabel(rule: ScheduleRule): string;
```

- [ ] **Step 1: Write failing unit tests for both rules and presets**

```ts
expect(validateScheduleRule({ mode: "cadence", trainDays: 3, restDays: 1 })).toEqual({});
expect(validateScheduleRule({ mode: "cadence", trainDays: 7, restDays: 1 })).toEqual({ trainDays: "连续训练天数应为 1–6 天" });
expect(getScheduleDensity({ mode: "cadence", trainDays: 3, restDays: 1 })).toBe(5.25);
expect(getScheduleDensity({ mode: "fixed_weekdays", weekdays: [1, 2, 3, 4, 5] })).toBe(5);
expect(weekdayPresets.find((preset) => preset.id === "weekday-training-weekend-rest")?.weekdays).toEqual([1, 2, 3, 4, 5]);
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `pnpm vitest run src/domain/schedule-rule.test.ts`

Expected: FAIL because `schedule-rule.ts` does not exist.

- [ ] **Step 3: Implement the rule model and remove new-write flexible support**

Implement the interfaces above. `validateScheduleRule` must reject empty weekdays, duplicate/out-of-range weekdays, cadence train days outside 1–6, and cadence rest days outside 1–3. Keep the existing `ScheduleMode` union in `program.ts` only as `LegacyScheduleMode = SupportedScheduleMode | "flexible"`; make all new generator inputs accept `ScheduleRule`, not `flexible`.

- [ ] **Step 4: Adapt existing program tests**

Replace the flexible new-plan expectation with a legacy-read compatibility assertion. Keep cadence and fixed-weekday schedule generation tests, and assert that `buildFourWeekProgram` no longer takes `trainingDaysPerWeek`.

- [ ] **Step 5: Run focused tests**

Run: `pnpm vitest run src/domain/schedule-rule.test.ts src/domain/program.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/domain/schedule-rule.ts src/domain/schedule-rule.test.ts src/domain/program.ts src/domain/program.test.ts
git commit -m "feat: model supported schedule rules"
```

### Task 2: 实现序列优先的日历计算与节假日约束

**Files:**
- Create: `src/domain/sequence-calendar.ts`
- Create: `src/domain/sequence-calendar.test.ts`
- Modify: `src/domain/program.ts`
- Modify: `src/domain/program.test.ts`

**Interfaces:**

```ts
export type CalendarConstraint = { date: string; kind: "holiday" | "personal_unavailable" | "override"; allowsTraining: boolean; label: string };
export type CalendarScheduleItem = { scheduledDate: string; scheduleIndex: number; sequenceIndex: number | null; dayType: "training" | "rest"; blockedReasons: string[] };
export function getTargetTrainingCount(input: { startDate: string; trainingWeeks: number; rule: ScheduleRule }): number;
export function buildSequenceCalendar(input: { startDate: string; targetTrainingCount: number; rule: ScheduleRule; constraints: CalendarConstraint[] }): CalendarScheduleItem[];
```

- [ ] **Step 1: Write failing sequence tests**

```ts
const items = buildSequenceCalendar({ startDate: "2026-08-03", targetTrainingCount: 12, rule: { mode: "cadence", trainDays: 3, restDays: 1 }, constraints: [] });
expect(items.filter((item) => item.dayType === "training").map((item) => item.scheduledDate).slice(0, 7)).toEqual([
  "2026-08-03", "2026-08-04", "2026-08-05", "2026-08-07", "2026-08-08", "2026-08-09", "2026-08-11"
]);

expect(buildSequenceCalendar({ startDate: "2026-10-01", targetTrainingCount: 2, rule: { mode: "cadence", trainDays: 1, restDays: 1 }, constraints: [{ date: "2026-10-01", kind: "holiday", allowsTraining: false, label: "国庆节" }] })[0]).toMatchObject({ dayType: "rest", blockedReasons: ["国庆节"] });

expect(buildSequenceCalendar({ startDate: "2026-08-03", targetTrainingCount: 2, rule: { mode: "fixed_weekdays", weekdays: [1, 3, 5] }, constraints: [{ date: "2026-08-05", kind: "personal_unavailable", allowsTraining: false, label: "出差" }] }).filter((item) => item.dayType === "training").map((item) => item.scheduledDate)).toEqual(["2026-08-03", "2026-08-07"]);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/domain/sequence-calendar.test.ts`

Expected: FAIL because the calendar builder is absent.

- [ ] **Step 3: Implement deterministic calendar builder**

Use local date parsing (`YYYY-MM-DDT00:00:00`) only inside the domain module. For cadence, a blocked date inserts one rest item and does not consume a train/rest phase. For fixed weekdays, a blocked allowed weekday becomes one rest item and the next training appears on the next allowed, unblocked weekday. Multiple block reasons must produce one rest item with all labels. Stop only after `targetTrainingCount` training items are produced.

- [ ] **Step 4: Integrate the builder into program generation**

`buildFourWeekProgram` must derive `targetTrainingCount` from `weekCount` and the schedule rule, create the training prescriptions in sequence order, then place them using `buildSequenceCalendar`. Keep `PlannedScheduleItem`’s existing shape while adding `cycleIndex` and `cyclePosition` to training items for persistence.

- [ ] **Step 5: Run focused tests**

Run: `pnpm vitest run src/domain/sequence-calendar.test.ts src/domain/program.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/domain/sequence-calendar.ts src/domain/sequence-calendar.test.ts src/domain/program.ts src/domain/program.test.ts
git commit -m "feat: schedule training sequences against calendar constraints"
```

### Task 3: 定义暂停、额外休息和恢复路线领域逻辑

**Files:**
- Create: `src/domain/schedule-adjustment.ts`
- Create: `src/domain/schedule-adjustment.test.ts`

**Interfaces:**

```ts
export type ResumeRoute = "continue_current_cycle" | "start_next_cycle";
export type PauseReason = "fatigue" | "time_conflict" | "minor_discomfort" | "injury" | "personal" | "other";
export type RecoveryLoadAdvice = { multiplier: number; title: string; message: string; suppressIncreases: boolean };
export function getRecoveryLoadAdvice(daysInterrupted: number): RecoveryLoadAdvice;
export function buildResumePreview(input: { route: ResumeRoute; pendingTraining: PendingTraining[]; templateLength: number; resumedOn: string }): ResumePreview;
```

- [ ] **Step 1: Write failing behavior tests**

```ts
expect(getRecoveryLoadAdvice(2)).toMatchObject({ multiplier: 1, suppressIncreases: false });
expect(getRecoveryLoadAdvice(7)).toMatchObject({ multiplier: 0.925, suppressIncreases: false });
expect(getRecoveryLoadAdvice(21)).toMatchObject({ multiplier: 0.85, suppressIncreases: true });

const preview = buildResumePreview({ route: "start_next_cycle", templateLength: 6, resumedOn: "2026-08-20", pendingTraining: pendingFromCycle(2, [3, 4, 5]) });
expect(preview.skippedSequenceIndexes).toEqual([15, 16, 17]);
expect(preview.nextSequenceIndex).toBe(18);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/domain/schedule-adjustment.test.ts`

Expected: FAIL because the module is absent.

- [ ] **Step 3: Implement advice and preview without defaults**

The module may calculate recommendations, but must not expose a `defaultRoute`. `start_next_cycle` must skip only pending training in the current cycle and set the next sequence to the first item of the subsequent cycle. `continue_current_cycle` must skip no training. Return labels, skipped names, date delta and prospective next direction for UI rendering.

- [ ] **Step 4: Run focused test**

Run: `pnpm vitest run src/domain/schedule-adjustment.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/schedule-adjustment.ts src/domain/schedule-adjustment.test.ts
git commit -m "feat: model pause and resume schedule decisions"
```

### Task 4: 增加数据库排程元数据、日历与用户约束

**Files:**
- Create: `supabase/migrations/20260730100000_sequence_calendar_scheduling.sql`
- Modify: `supabase/schema.sql`
- Modify: `src/lib/supabase/table-names.ts`
- Create: `scripts/sequence-calendar-schema-contract.test.mjs`

**Interfaces:**

The migration must add the following exact persisted concepts:

```sql
alter table public.usr_athlete_profiles
  alter column training_days_per_week drop not null,
  drop constraint if exists athlete_profiles_session_duration_minutes_check,
  add constraint athlete_profiles_session_duration_minutes_check
    check (session_duration_minutes in (45, 60, 75, 90, 120, 150, 180));

alter table public.plan_programs
  add column if not exists schedule_revision integer not null default 1,
  add column if not exists holiday_policy text not null default 'train'
    check (holiday_policy in ('train', 'rest_and_shift')),
  add column if not exists timezone text not null default 'Asia/Shanghai';

alter table public.plan_workouts
  add column if not exists cycle_index integer,
  add column if not exists cycle_position integer,
  add column if not exists skip_reason text,
  add column if not exists replaced_by_workout_id uuid references public.plan_workouts(id);
```

Create `cfg_cn_calendar_dates`, `usr_unavailable_dates`, and `ops_schedule_events`; enable RLS on user-owned tables, with `auth.uid() = user_id` policies for every read/write. Calendar dates are readable by authenticated users and not writable by browser clients.

- [ ] **Step 1: Write failing schema contract tests**

```js
expect(schema).toContain("schedule_revision integer not null default 1");
expect(schema).toContain("holiday_policy in ('train', 'rest_and_shift')");
expect(schema).toContain("session_duration_minutes in (45, 60, 75, 90, 120, 150, 180)");
expect(schema).toContain("create table if not exists public.usr_unavailable_dates");
expect(schema).toContain("create table if not exists public.ops_schedule_events");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run scripts/sequence-calendar-schema-contract.test.mjs`

Expected: FAIL because no scheduling migration exists.

- [ ] **Step 3: Write idempotent migration and synchronize schema baseline**

Populate the current and next calendar year with approved China mainland statutory holiday dates only; do not insert make-up workdays as blocked dates. Define event types as a `check` list: `extra_rest`, `pause_started`, `resume_confirmed`, `holiday_override`, `unavailable_date_added`, `recovery_strategy_skip`, `schedule_undone`.

Add `calendarDates`, `unavailableDates`, and `scheduleEvents` to `DB_TABLE` using the physical table names above.

- [ ] **Step 4: Run contract and baseline migration tests**

Run: `pnpm vitest run scripts/sequence-calendar-schema-contract.test.mjs scripts/baseline-migration-contract.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260730100000_sequence_calendar_scheduling.sql supabase/schema.sql src/lib/supabase/table-names.ts scripts/sequence-calendar-schema-contract.test.mjs
git commit -m "feat: persist schedule calendar constraints"
```

### Task 5: 实现原子重排 RPC 与数据库测试

**Files:**
- Modify: `supabase/migrations/20260730100000_sequence_calendar_scheduling.sql`
- Modify: `supabase/schema.sql`
- Create: `supabase/tests/sequence_calendar_scheduling.test.sql`
- Create: `src/domain/schedule-reflow-payload.ts`
- Create: `src/domain/schedule-reflow-payload.test.ts`

**Interfaces:**

```ts
export type ScheduleReflowPayload = {
  action: "extra_rest" | "resume" | "holiday_override" | "unavailable_dates";
  expected_revision: number;
  resume_route?: ResumeRoute;
  effective_date: string;
  reason?: PauseReason;
  schedule_items: ReflowScheduleItem[];
};
export function buildScheduleReflowPayload(input: ReflowInput): ScheduleReflowPayload;
```

Create `public.reflow_program_schedule(p_payload jsonb)` as `security definer set search_path = public`. It must derive `v_user_id := auth.uid()`, lock the program row `for update`, reject a missing/foreign/archived program, and reject an unexpected `schedule_revision` with SQLSTATE `P0001` and message `Schedule changed; refresh before confirming`.

The transaction must:

1. reject changes to completed or draft training;
2. update only pending scheduled/rest items;
3. set `status = 'skipped'` and `skip_reason = 'recovery_strategy'` for the exact supplied skipped items;
4. insert one event with sanitized structured metadata;
5. increment `schedule_revision` exactly once;
6. return the new revision and next pending workout.

- [ ] **Step 1: Write payload unit tests and pgTAP tests**

```ts
expect(buildScheduleReflowPayload(fixture({ expectedRevision: 4, route: "start_next_cycle" }))).toMatchObject({
  action: "resume", expected_revision: 4, resume_route: "start_next_cycle"
});
```

```sql
select throws_ok(
  $$select public.reflow_program_schedule('{"program_id":"00000000-0000-0000-0000-000000002001","expected_revision":99,"action":"resume","effective_date":"2026-08-20","schedule_items":[]}'::jsonb)$$,
  'P0001', 'Schedule changed; refresh before confirming', 'stale revision is rejected'
);
```

- [ ] **Step 2: Run failing tests**

Run: `pnpm vitest run src/domain/schedule-reflow-payload.test.ts && pnpm test:db:sequence`

Expected: unit test fails before implementation; pgTAP fails until the local migration is applied.

- [ ] **Step 3: Implement payload builder and RPC**

The builder must only accept fields that the UI needs: program id, revision, action, effective date, user-selected route, structured reason code, and the domain-computed next schedule items. It must never send `user_id`. The RPC must validate every JSON field and use database ownership, not client-provided ownership.

- [ ] **Step 4: Verify atomically**

Run: `pnpm vitest run src/domain/schedule-reflow-payload.test.ts && pnpm test:db:sequence`

Expected: PASS, including completed-row protection, stale-version rejection, one-event insertion and cross-user isolation.

- [ ] **Step 5: Commit**

```bash
git add src/domain/schedule-reflow-payload.ts src/domain/schedule-reflow-payload.test.ts supabase/migrations/20260730100000_sequence_calendar_scheduling.sql supabase/schema.sql supabase/tests/sequence_calendar_scheduling.test.sql
git commit -m "feat: atomically reflow scheduled workouts"
```

### Task 6: 更新计划设置表单与生成载荷

**Files:**
- Create: `src/components/plan/schedule-rule-fields.tsx`
- Create: `src/components/plan/schedule-rule-fields.test.tsx`
- Modify: `src/domain/plan-setup.ts`
- Modify: `src/domain/plan-setup.test.ts`
- Modify: `src/domain/program-regeneration.ts`
- Modify: `src/domain/program-regeneration.test.ts`
- Modify: `src/components/plan/program-manager.tsx`
- Modify: `src/components/plan/program-manager.plan-setup.test.tsx`

**Interfaces:**

```ts
export type PlanSetupInput = {
  experienceLevel: PlanExperienceLevel | "";
  goal: PlanGoal;
  injuryNotes: string;
  lifts: Array<{ exerciseId: string; weightKg: string; reps: string }>;
  weekCount: number;
  sessionDurationMinutes: 45 | 60 | 75 | 90 | 120 | 150 | 180;
};
```

`ProgramReplacementPayload` must carry `holiday_policy`, `timezone: "Asia/Shanghai"`, and each schedule item’s `cycle_index` and `cycle_position`. It must not carry `training_days_per_week`.

- [ ] **Step 1: Write failing component and validation tests**

```tsx
render(<ScheduleRuleFields value={{ mode: "cadence", trainDays: 3, restDays: 1 }} onChange={onChange} />);
expect(screen.getByText("练三休一")).toBeInTheDocument();
expect(screen.queryByText("每周训练天数")).not.toBeInTheDocument();

render(<ScheduleRuleFields value={{ mode: "fixed_weekdays", weekdays: [1, 3, 5] }} onChange={onChange} />);
await user.click(screen.getByRole("button", { name: "工作日训练、周末双休" }));
expect(onChange).toHaveBeenLastCalledWith({ mode: "fixed_weekdays", weekdays: [1, 2, 3, 4, 5] });
```

```ts
expect(validatePlanSetup({ ...baseInput, sessionDurationMinutes: 180 })).toMatchObject({ ok: true });
expect(validatePlanSetup({ ...baseInput, sessionDurationMinutes: 181 as never })).toEqual({ ok: false, fieldErrors: { sessionDurationMinutes: "单次训练时长应为 45–180 分钟的可选档位" } });
```

- [ ] **Step 2: Run failing tests**

Run: `pnpm vitest run src/domain/plan-setup.test.ts src/domain/program-regeneration.test.ts src/components/plan/schedule-rule-fields.test.tsx src/components/plan/program-manager.plan-setup.test.tsx`

Expected: FAIL because the field module and new shape do not exist.

- [ ] **Step 3: Implement conditional fields and payload changes**

Replace the current `PlanBuilder` schedule select with `ScheduleRuleFields`. Remove the flexible option and its copy. Store a plan-level holiday policy next to the rule. Keep legacy flexible plans readable in `loadCurrentProgram`, but force a new supported rule when the user opens regeneration. Persist `session_duration_minutes` from form state rather than a separate unconstrained state.

- [ ] **Step 4: Add 28-day preview**

Render the first 28 `CalendarScheduleItem`s from Task 2, with distinct labels for training, planned rest, holiday rest, and personal unavailable rest. Display calculated density and predicted end date. Do not write data until the existing program regeneration confirmation succeeds.

- [ ] **Step 5: Run focused tests**

Run: `pnpm vitest run src/domain/plan-setup.test.ts src/domain/program-regeneration.test.ts src/components/plan/schedule-rule-fields.test.tsx src/components/plan/program-manager.plan-setup.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/domain/plan-setup.ts src/domain/plan-setup.test.ts src/domain/program-regeneration.ts src/domain/program-regeneration.test.ts src/components/plan/schedule-rule-fields.tsx src/components/plan/schedule-rule-fields.test.tsx src/components/plan/program-manager.tsx src/components/plan/program-manager.plan-setup.test.tsx
git commit -m "feat: configure sequence-first training schedules"
```

### Task 7: 实现计划调整、暂停和恢复确认 UI

**Files:**
- Create: `src/components/plan/schedule-adjustment-dialog.tsx`
- Create: `src/components/plan/schedule-adjustment-dialog.test.tsx`
- Create: `src/components/plan/unavailable-date-manager.tsx`
- Create: `src/components/plan/unavailable-date-manager.test.tsx`
- Modify: `src/components/plan/program-manager.tsx`
- Modify: `src/components/dashboard/home-dashboard.tsx`

**Interfaces:**

```ts
type ScheduleAdjustmentDialogProps = {
  preview: ResumePreview;
  selectedRoute: ResumeRoute | null;
  onSelectRoute: (route: ResumeRoute) => void;
  onConfirm: () => void;
  onCancel: () => void;
};
```

- [ ] **Step 1: Write failing interaction tests**

```tsx
render(<ScheduleAdjustmentDialog preview={preview} selectedRoute={null} onSelectRoute={onSelect} onConfirm={onConfirm} onCancel={onCancel} />);
expect(screen.getByRole("radio", { name: "继续当前循环" }).evaluate((node) => (node as HTMLInputElement).checked)).toBe(false);
expect(screen.getByRole("radio", { name: "从下个循环第一节开始" }).evaluate((node) => (node as HTMLInputElement).checked)).toBe(false);
expect(screen.getByRole("button", { name: "确认调整" })).toBeDisabled();
```

- [ ] **Step 2: Run failing tests**

Run: `pnpm vitest run src/components/plan/schedule-adjustment-dialog.test.tsx src/components/plan/unavailable-date-manager.test.tsx`

Expected: FAIL because the components are absent.

- [ ] **Step 3: Implement adjustment controls**

Add plan-page controls for: add/remove personal unavailable date, pause with reason and optional return date, resume, and extra rest. For resume and extra rest, open the dialog with `selectedRoute = null`. For injury, require a checkbox labelled `我已适合恢复一般训练；本产品不提供医疗判断` before enabling route confirmation.

- [ ] **Step 4: Wire preview and confirmation to RPC**

Use the domain modules to create a read-only preview; call `reflow_program_schedule` only after a user selects a route and confirms. On stale revision, reload plan data and show `日程已在其他设备调整，请刷新后重新确认。`; on network error, preserve dialog state and local selections.

- [ ] **Step 5: Update dashboard status**

When the active program is paused or has an unconfirmed schedule event, dashboard’s primary card must direct users to `/plan` instead of presenting a stale training CTA.

- [ ] **Step 6: Run focused tests**

Run: `pnpm vitest run src/components/plan/schedule-adjustment-dialog.test.tsx src/components/plan/unavailable-date-manager.test.tsx src/components/dashboard/home-dashboard-next-workout.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/plan/schedule-adjustment-dialog.tsx src/components/plan/schedule-adjustment-dialog.test.tsx src/components/plan/unavailable-date-manager.tsx src/components/plan/unavailable-date-manager.test.tsx src/components/plan/program-manager.tsx src/components/dashboard/home-dashboard.tsx src/components/dashboard/home-dashboard-next-workout.test.mjs
git commit -m "feat: let users adjust and resume training schedules"
```

### Task 8: 让今日页遵从统一日程状态并保护训练指标

**Files:**
- Modify: `src/components/today/rest-day-state.ts`
- Modify: `src/components/today/rest-day-state.test.ts`
- Modify: `src/components/today/today-workout.tsx`
- Modify: `src/domain/training-metric-workouts.ts`
- Modify: `src/domain/training-metric-workouts.test.ts`
- Modify: `src/components/history/training-history.tsx`
- Modify: `src/components/progress/progress-dashboard.tsx`

**Interfaces:**

```ts
export type TodayScheduleState =
  | { kind: "training"; workout: TrainingScheduleItem }
  | { kind: "rest"; restItem: RestScheduleItem; nextTraining: TrainingScheduleItem | null }
  | { kind: "paused"; resumeDate: string | null }
  | { kind: "adjustment_required"; eventId: string }
  | { kind: "empty" };
export function isMetricEligibleWorkout(row: { dayType?: string; status: string; skipReason?: string | null }): boolean;
```

- [ ] **Step 1: Write failing state and metric tests**

```ts
expect(getTodayScheduleState({ now: "2026-08-20", pausedUntil: null, pendingAdjustment: { id: "event-1" }, restItems: [], trainingItems: [] })).toEqual({ kind: "adjustment_required", eventId: "event-1" });
expect(isMetricEligibleWorkout({ dayType: "training", status: "skipped", skipReason: "recovery_strategy" })).toBe(false);
```

- [ ] **Step 2: Run failing tests**

Run: `pnpm vitest run src/components/today/rest-day-state.test.ts src/domain/training-metric-workouts.test.ts`

Expected: FAIL because paused and adjustment states are not represented.

- [ ] **Step 3: Implement state expansion and page branches**

Read program pause and latest unconfirmed event together with scheduled workouts. Render only one primary card: today training, planned rest, paused plan, or adjustment required. A paused or adjustment-required plan must not load set logs or enable workout completion.

- [ ] **Step 4: Exclude skipped/replaced rows from all metrics**

Use one eligibility helper in history summaries and progress queries. A `recovery_strategy` skipped workout must never count as completed, failed, tonnage, e1RM, PR readiness, recommendation input, or CSV training metric.

- [ ] **Step 5: Run focused regression tests**

Run: `pnpm vitest run src/components/today/rest-day-state.test.ts src/components/today/today-workout.test.tsx src/domain/training-metric-workouts.test.ts src/components/dashboard/home-dashboard-next-workout.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/today/rest-day-state.ts src/components/today/rest-day-state.test.ts src/components/today/today-workout.tsx src/domain/training-metric-workouts.ts src/domain/training-metric-workouts.test.ts src/components/history/training-history.tsx src/components/progress/progress-dashboard.tsx
git commit -m "feat: reflect paused and reflowed schedules in training views"
```

### Task 9: 发布验证与文档

**Files:**
- Modify: `scripts/release-check.mjs`
- Modify: `docs/11_mvp_release_checklist.md`
- Modify: `docs/12_database_release_runbook.md`
- Create: `scripts/sequence-calendar-smoke.test.mjs`

- [ ] **Step 1: Write a failing authenticated smoke test contract**

The test must require `BASE_URL` and authenticated QA setup, then assert: cadence plan preview, weekend-rest preset, holiday shift, personal unavailable date, paused state, no route preselection, stale revision response, and a resume result with one skipped `recovery_strategy` row.

- [ ] **Step 2: Run it before implementation**

Run: `pnpm vitest run scripts/sequence-calendar-smoke.test.mjs`

Expected: FAIL until the required API/UI behavior exists; skip only when `BASE_URL` is absent.

- [ ] **Step 3: Add it to release guidance, not default unauthenticated smoke**

Keep `release:check` fast and unauthenticated. Add the authenticated command to the MVP checklist and database runbook, including required backup before migration and verification SQL for schedule revisions, skip reasons, and RLS.

- [ ] **Step 4: Run complete local verification**

Use the dedicated database command below; the legacy `pnpm test:db` script is intentionally pinned to the standalone draft test and does not accept a `--file` suffix:

```bash
pnpm test:db:sequence
```

Run:

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm test:db:sequence
pnpm release:check
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit**

```bash
git add scripts/release-check.mjs scripts/sequence-calendar-smoke.test.mjs docs/11_mvp_release_checklist.md docs/12_database_release_runbook.md
git commit -m "test: verify sequence calendar scheduling"
```

## Plan Self-Review

- Spec coverage: Tasks 1–2 cover both long-term scheduling modes, density and dynamic dates; Tasks 3, 5 and 7 cover user-selected recovery routes, atomicity and auditability; Task 4 covers duration, calendar and user constraints; Task 8 covers Today/history/progress isolation; Task 9 covers release verification.
- Intentional deferral: rest-day extra training compensation, replacement matching, undo and detailed event-history filters are Phase 2 and are covered in the companion plan.
- Type consistency: every new mode in UI, domain and payload is `cadence | fixed_weekdays`; only legacy read paths retain `flexible`. Every user decision uses `ResumeRoute` from Task 3.
