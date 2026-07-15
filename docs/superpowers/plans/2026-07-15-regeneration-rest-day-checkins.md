# 计划重建交互与休息日打卡 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Make plan regeneration previewable and atomic, and create explicit, one-tap-check-in rest days for cadence and fixed-weekday schedules.

**Architecture:** Keep workouts as the user-visible schedule table, adding a day_type and all-day schedule_index while retaining sequence_index only for strength sessions. Generate a mixed schedule in the domain layer, persist a complete plan through one authenticated PostgreSQL RPC, and add focused UI components for confirmation and rest-day completion.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, Tailwind CSS, Supabase PostgreSQL/RLS/RPC, Vitest, pgTAP, Lucide.

## Global Constraints

- Mobile Web/PWA remains the primary surface; use kg only.
- Training templates, existing exercise UUIDs, set prescriptions, Fitness Coach and action substitution behavior must remain unchanged.
- day_type is exactly 'training' | 'rest'; rest days have no exercises.
- schedule_index is continuous across every schedule item; sequence_index is continuous only for training items and is null for rest items.
- Cadence and fixed-weekday schedules create explicit rest items; flexible schedules do not create calendar rest items.
- Rest completion only updates the owned rest schedule item and completed_at; it never affects volume, e1RM, PR, recommendations, strength completion rate or exercise logs.
- Regeneration must not archive the old active program until the new program, all schedule items and every training prescription are validly inserted in the same transaction.
- RPC identity derives only from auth.uid() and must never accept user_id.
- Follow red-green-refactor: every production behavior begins with a focused failing test.

---

## File Structure

- src/domain/program.ts: mixed training/rest schedule generation and preview summary.
- src/domain/program.test.ts: cadence, fixed-weekday and flexible schedule regression tests.
- src/domain/program-regeneration.ts: pure regeneration preview types and payload conversion.
- src/domain/program-regeneration.test.ts: preview and payload tests.
- supabase/migrations/20260715000000_rest_day_schedule_and_program_replacement.sql: schema evolution, validation trigger and atomic RPC.
- supabase/schema.sql: current-schema mirror.
- supabase/tests/rest_day_schedule.test.sql: pgTAP constraints, permissions and rollback tests.
- scripts/rest-day-sql-contract.test.mjs: static migration contract tests.
- src/components/plan/program-regeneration-dialog.tsx: accessible preview/confirm UI.
- src/components/plan/program-regeneration-dialog-state.ts and .test.ts: reducer state and tests.
- src/components/today/rest-day-card.tsx: one-tap rest component.
- src/components/today/rest-day-state.ts and .test.ts: date-exact rest selection and completion eligibility.
- src/components/today/today-workout.tsx: separate rest and training queries.
- src/components/history/training-history.tsx, src/components/progress/progress-dashboard.tsx, src/components/settings/settings-panel.tsx: rest display and training-only aggregation/export.
- src/domain/rest-day-presentation.ts and .test.ts: shared rest-row display copy.
- src/lib/analytics.ts and src/lib/client-cache.ts: event names and targeted invalidation.

### Task 1: Generate mixed training and rest schedule items

**Files:**
- Modify: src/domain/program.ts
- Modify: src/domain/program.test.ts

**Interfaces:**
- Produce:
~~~ts
export type PlannedWorkout = {
  dayType: 'training';
  exercises: PlannedWorkoutExercise[];
  name: string;
  scheduledDate: string;
  scheduleIndex: number;
  sequenceIndex: number;
};

export type PlannedRestDay = {
  dayType: 'rest';
  exercises: [];
  name: '休息/恢复日';
  scheduledDate: string;
  scheduleIndex: number;
  sequenceIndex: null;
};

export type PlannedScheduleItem = PlannedWorkout | PlannedRestDay;
export function buildSchedulePreview(items: PlannedScheduleItem[]): {
  endDate: string;
  restDays: number;
  trainingDays: number;
};
~~~

- [ ] **Step 1: Write failing domain tests**

~~~ts
it('expands train one rest one into explicit continuous schedule items', () => {
  const items = buildFourWeekProgram({
    templateType: 'three_split',
    schedule: { mode: 'cadence', trainDays: 1, restDays: 1 },
    exerciseProfiles: profiles,
    startDate: new Date('2026-07-13T00:00:00')
  });

  expect(items.slice(0, 5).map(({ dayType, scheduledDate, sequenceIndex, scheduleIndex }) => ({
    dayType, scheduledDate, sequenceIndex, scheduleIndex
  }))).toEqual([
    { dayType: 'training', scheduledDate: '2026-07-13', sequenceIndex: 0, scheduleIndex: 0 },
    { dayType: 'rest', scheduledDate: '2026-07-14', sequenceIndex: null, scheduleIndex: 1 },
    { dayType: 'training', scheduledDate: '2026-07-15', sequenceIndex: 1, scheduleIndex: 2 },
    { dayType: 'rest', scheduledDate: '2026-07-16', sequenceIndex: null, scheduleIndex: 3 },
    { dayType: 'training', scheduledDate: '2026-07-17', sequenceIndex: 2, scheduleIndex: 4 }
  ]);
});
~~~

Add tests proving fixed Monday/Wednesday/Friday creates Tuesday rest, flexible emits training-only items, the final item is training, and buildSchedulePreview counts each type.

- [ ] **Step 2: Run test to verify RED**

Run: pnpm vitest run src/domain/program.test.ts

Expected: FAIL because dayType, scheduleIndex and rest items do not exist.

- [ ] **Step 3: Implement the generator**

First build all training prescriptions exactly as today. Then call:

~~~ts
function expandScheduleItems(
  trainingWorkouts: Omit<PlannedWorkout, 'dayType' | 'scheduleIndex'>[],
  schedule: ScheduleConfig
): PlannedScheduleItem[] {
  // cadence inserts rest only between training records;
  // fixed weekdays fills non-training calendar dates;
  // flexible returns training items only.
}
~~~

Assign scheduleIndex only after expansion. Do not append tail rest days after the last training session.

- [ ] **Step 4: Verify GREEN**

Run: pnpm vitest run src/domain/program.test.ts

Expected: PASS. Update existing date tests to select dayType === 'training' before asserting training sequence/date behavior.

- [ ] **Step 5: Commit**

~~~powershell
git add src/domain/program.ts src/domain/program.test.ts
git commit -m "feat: generate explicit rest schedule days"
~~~

### Task 2: Add owned schedule persistence and atomic program replacement

**Files:**
- Create: supabase/migrations/20260715000000_rest_day_schedule_and_program_replacement.sql
- Modify: supabase/schema.sql
- Create: supabase/tests/rest_day_schedule.test.sql
- Create: scripts/rest-day-sql-contract.test.mjs

**Interfaces:**
- Produce:
~~~sql
replace_active_program(p_payload jsonb)
returns table (
  program_id uuid,
  first_schedule_item_id uuid,
  training_days integer,
  rest_days integer
)
~~~
- Payload has name, template_type, custom_template_name, schedule_mode, schedule_config, start_date, end_date and schedule_items. Training items include exercise prescriptions; rest items require exercises: [] and sequence_index: null.

- [ ] **Step 1: Write failing SQL tests**

~~~js
test('rest-day migration exposes protected atomic replacement', () => {
  expect(sql).toMatch(/day_type text not null default 'training'/);
  expect(sql).toMatch(/schedule_index integer not null/);
  expect(sql).toMatch(/create or replace function public\.replace_active_program/);
  expect(sql).toMatch(/auth\.uid\(\)/);
});
~~~

~~~sql
select throws_ok(
  $$insert into public.workout_exercises (workout_id, exercise_id, order_index, target_sets, target_reps, target_weight)
      values ('<rest-workout-id>', '<exercise-id>', 1, 3, 8, 20)$$,
  '.*rest.*',
  'rest schedule items reject exercise prescriptions'
);
~~~

Also prove: duplicate program/schedule_index is rejected; multiple null sequence_index values are allowed; public and anon have no RPC execute; an invalid replacement payload leaves the old active program active; another user cannot replace the owner's plan.

- [ ] **Step 2: Run test to verify RED**

Run: pnpm vitest run scripts/rest-day-sql-contract.test.mjs

Expected: FAIL because the migration and RPC are absent.

- [ ] **Step 3: Implement schema and RPC**

Start the migration with:

~~~sql
alter table public.workouts
  add column day_type text not null default 'training' check (day_type in ('training', 'rest')),
  add column schedule_index integer;

update public.workouts
set schedule_index = sequence_index
where schedule_index is null;

alter table public.workouts alter column schedule_index set not null;
alter table public.workouts alter column sequence_index drop not null;
alter table public.workouts add constraint workouts_program_schedule_index_key unique (program_id, schedule_index);
~~~

Add an insert/update trigger on workout_exercises that rejects parent day_type other than training. Implement the security-definer RPC with fixed search_path, auth.uid() guard, JSON validation, indexes and ownership checks. Insert the new program, all schedule rows and each training prescription before archiving existing active programs. Revoke execute from public/anon and grant authenticated only.

- [ ] **Step 4: Verify GREEN**

Run:
~~~powershell
pnpm vitest run scripts/rest-day-sql-contract.test.mjs
supabase test db
~~~

Expected: contract test passes. If CLI/Docker is unavailable, record that limitation and repeat pgTAP against linked Supabase before release.

- [ ] **Step 5: Commit**

~~~powershell
git add supabase scripts/rest-day-sql-contract.test.mjs
git commit -m "feat: add atomic rest-day program replacement"
~~~

### Task 3: Build regeneration preview and confirmation interaction

**Files:**
- Create: src/domain/program-regeneration.ts
- Create: src/domain/program-regeneration.test.ts
- Create: src/components/plan/program-regeneration-dialog-state.ts
- Create: src/components/plan/program-regeneration-dialog-state.test.ts
- Create: src/components/plan/program-regeneration-dialog.tsx
- Modify: src/components/plan/program-manager.tsx
- Modify: src/lib/analytics.ts
- Modify: src/lib/client-cache.ts

**Interfaces:**
~~~ts
export function buildRegenerationPreview(input: {
  activeItems: Array<{ dayType: 'training' | 'rest'; status: string }>;
  proposedItems: PlannedScheduleItem[];
}): {
  endDate: string;
  restDays: number;
  trainingDays: number;
  unfinishedRestDays: number;
  unfinishedTrainingDays: number;
};
~~~

- [ ] **Step 1: Write failing preview and dialog tests**

~~~ts
it('does not create mutation data before confirmation', () => {
  let state = createRegenerationDialogState();
  state = reduceRegenerationDialog(state, { type: 'open', preview });
  expect(state.open).toBe(true);
  expect(buildConfirmationPayload(state)).toBeNull();

  state = reduceRegenerationDialog(state, { type: 'confirm' });
  expect(buildConfirmationPayload(state)?.schedule_items).toHaveLength(28);
});
~~~

Add tests that cancel clears state, a failed request preserves preview/selection, and submitting ignores a duplicate confirm event.

- [ ] **Step 2: Run tests to verify RED**

Run: pnpm vitest run src/domain/program-regeneration.test.ts src/components/plan/program-regeneration-dialog-state.test.ts

Expected: FAIL because the helper and reducer do not exist.

- [ ] **Step 3: Implement preview, accessible dialog and single RPC mutation**

Use a bottom sheet below md and centered dialog at md+. The dialog has role=dialog, aria-modal=true, a labelled heading, return-focus target, Escape/backdrop close only while not submitting. Display template, schedule, date range, training count, rest count and unfinished current training/rest counts. Primary copy is 确认生成新计划 and switches to 正在生成计划.

Refactor ProgramManager so openRegenerationDialog builds plan items and preview without database writes. confirmProgramRegeneration calls:

~~~ts
const { data, error } = await supabase.rpc('replace_active_program', {
  p_payload: buildProgramReplacementPayload({ schedule, plannedItems, templateType })
});
~~~

On success clear training/plan/today/draft caches, track program_regenerated, reload current program and focus first schedule row. On failure retain dialog state and old active plan. For an initial program, call the same RPC with no active items.

- [ ] **Step 4: Verify GREEN**

Run:
~~~powershell
pnpm vitest run src/domain/program-regeneration.test.ts src/components/plan/program-regeneration-dialog-state.test.ts src/domain/program.test.ts
pnpm typecheck
~~~

Expected: PASS.

- [ ] **Step 5: Commit**

~~~powershell
git add src/domain/program-regeneration.ts src/domain/program-regeneration.test.ts src/components/plan src/components/plan/program-manager.tsx src/lib/analytics.ts src/lib/client-cache.ts
git commit -m "feat: confirm atomic program regeneration"
~~~

### Task 4: Show and complete rest days without blocking training

**Files:**
- Create: src/components/today/rest-day-card.tsx
- Create: src/components/today/rest-day-state.ts
- Create: src/components/today/rest-day-state.test.ts
- Modify: src/components/today/today-workout.tsx
- Modify: src/lib/analytics.ts
- Modify: src/lib/client-cache.ts

**Interfaces:**
~~~ts
export function getTodayScheduleState(input: {
  now: string;
  restItems: RestScheduleItem[];
  trainingItems: TrainingScheduleItem[];
}):
  | { kind: 'rest'; restItem: RestScheduleItem; nextTraining: TrainingScheduleItem | null }
  | { kind: 'training'; workout: TrainingScheduleItem }
  | { kind: 'empty' };

export function canCompleteRestDay(item: { dayType: string; status: string }): boolean;
~~~

- [ ] **Step 1: Write failing rest-state tests**

~~~ts
it('shows a date-exact rest day without consuming the next strength session', () => {
  const state = getTodayScheduleState({
    now: '2026-07-14',
    restItems: [{ dayType: 'rest', id: 'rest-1', scheduledDate: '2026-07-14', status: 'scheduled' }],
    trainingItems: [{ dayType: 'training', id: 'train-1', name: '拉 B · 容量', sequenceIndex: 1, status: 'scheduled' }]
  });

  expect(state).toMatchObject({ kind: 'rest', nextTraining: { id: 'train-1' } });
});
~~~

Add tests that completed/other-date rest does not replace training and canCompleteRestDay rejects training, completed and unknown statuses.

- [ ] **Step 2: Run test to verify RED**

Run: pnpm vitest run src/components/today/rest-day-state.test.ts

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement separate queries and one-tap card**

TodayWorkout queries date-exact rest with day_type=rest and scheduled_date=today, then queries next training with day_type=training ordered by sequence_index. The rest card contains 今日恢复 and 完成休息; it never loads exercises, logs, catalog or the rest timer.

Complete rest with an owned update constrained by id, user_id, day_type=rest and scheduled/draft status. On success set completed_at, clear today/plan caches, emit rest_day_completed and reload. Show a secondary 查看下一节训练 link when nextTraining exists.

- [ ] **Step 4: Verify GREEN**

Run:
~~~powershell
pnpm vitest run src/components/today/rest-day-state.test.ts src/domain/next-workout.test.ts src/lib/client-cache.test.ts
pnpm typecheck
~~~

Expected: PASS.

- [ ] **Step 5: Commit**

~~~powershell
git add src/components/today src/lib/analytics.ts src/lib/client-cache.ts
git commit -m "feat: add one-tap rest day check-ins"
~~~

### Task 5: Render rest days safely in plan/history and exclude them from strength metrics

**Files:**
- Create: src/domain/rest-day-presentation.ts
- Create: src/domain/rest-day-presentation.test.ts
- Create: src/domain/training-metric-workouts.ts
- Create: src/domain/training-metric-workouts.test.ts
- Modify: src/components/plan/program-manager.tsx
- Modify: src/components/history/training-history.tsx
- Modify: src/components/progress/progress-dashboard.tsx
- Modify: src/components/settings/settings-panel.tsx

**Interfaces:**
~~~ts
export function getScheduleItemPresentation(item: {
  dayType: 'training' | 'rest';
  status: string;
}): { icon: 'dumbbell' | 'moon'; statusLabel: string; title: string };

export function filterTrainingMetricWorkouts<T extends { dayType: string }>(rows: T[]): T[];
~~~

- [ ] **Step 1: Write failing presentation/aggregation tests**

~~~ts
it('formats completed rest without strength metrics', () => {
  expect(getScheduleItemPresentation({ dayType: 'rest', status: 'completed' })).toEqual({
    icon: 'moon',
    statusLabel: '已完成休息',
    title: '休息/恢复日'
  });
});
~~~

Add a progress fixture with one completed rest and one completed training row. Assert weekly volume, e1RM inputs and strength completion numerator/denominator include only training.

- [ ] **Step 2: Run test to verify RED**

Run: pnpm vitest run src/domain/rest-day-presentation.test.ts src/domain/training-metric-workouts.test.ts

Expected: FAIL because the presentation helper does not exist.

- [ ] **Step 3: Implement rendering and filters**

Sort plan rows by schedule_index. Render rest rows with Moon, low-emphasis recovery styling and no prescription/actions. History renders completed rest without exercise or RPE editors. Progress queries/aggregation filter day_type=training. CSV includes a day_type column and empty exercise fields for schedule-history rest rows, while all capacity calculations exclude rest.

- [ ] **Step 4: Verify GREEN**

Run:
~~~powershell
pnpm vitest run src/domain/rest-day-presentation.test.ts src/domain/training-metric-workouts.test.ts
pnpm typecheck
~~~

Expected: PASS.

- [ ] **Step 5: Commit**

~~~powershell
git add src/domain/rest-day-presentation.ts src/domain/rest-day-presentation.test.ts src/domain/training-metric-workouts.ts src/domain/training-metric-workouts.test.ts src/components/plan/program-manager.tsx src/components/history/training-history.tsx src/components/progress/progress-dashboard.tsx src/components/settings/settings-panel.tsx
git commit -m "feat: show rest days outside strength metrics"
~~~

### Task 6: Apply migration, visually verify, and record release evidence

**Files:**
- Modify: docs/12_database_release_runbook.md
- Modify: docs/11_mvp_release_checklist.md
- Create: docs/verification/2026-07-15-rest-day-regeneration-evidence.md
- Create: scripts/rest-day-smoke.test.mjs
- Modify: scripts/release-check.mjs only if the new smoke helper is not covered by pnpm test.

**Interfaces:**
- Produce timestamped, sanitized proof for migration, atomic regeneration, rest check-in, user isolation and responsive behavior.

- [ ] **Step 1: Write failing smoke helper**

~~~js
test('rest-day routes remain reachable', async () => {
  expect(await getStatus('/plan')).toBe(200);
  expect(await getStatus('/today')).toBe(200);
});
~~~

The release checklist SQL verifies both day types exist for cadence and confirms zero exercise rows belong to rest items:
~~~sql
select count(*)
from public.workout_exercises we
join public.workouts w on w.id = we.workout_id
where w.day_type = 'rest';
~~~

- [ ] **Step 2: Run test to verify RED**

Run: pnpm vitest run scripts/rest-day-smoke.test.mjs

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Apply migration and run authenticated functional checks**

Apply the new migration to linked Supabase. Verify malformed RPC payload retains the old active plan; valid regeneration archives old only after new insert; a rest day completes once; a second user cannot update it; progress and CSV strength totals remain unchanged after rest completion.

- [ ] **Step 4: Run full gates and responsive review**

Run:
~~~powershell
pnpm test
pnpm typecheck
pnpm build
pnpm release:check
~~~

Use the in-app browser at 320x568, 390x844, 768x1024 and 1440x900. Verify dialog focus/close/loading, rest card action, plan/history rows, no horizontal overflow, no failed assets and no console errors.

- [ ] **Step 5: Record evidence and commit**

~~~powershell
git add docs scripts
git commit -m "docs: verify rest day regeneration release"
~~~

Store only sanitized IDs and UTC timestamps; never store email addresses, tokens, service keys or raw user UUIDs.
