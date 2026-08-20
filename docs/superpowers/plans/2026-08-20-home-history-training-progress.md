# 首页与历史训练进度展示 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** 首页展示当前计划训练的真实逐动作完成组数；历史页只显示所选日期的训练详情。

**Architecture:** 首页新增纯领域聚合函数，把当前训练动作与组记录转换成动作级、总计级进度。历史页从 \`claude/history-date-selection\` 选择性移植月历模块，并用纯筛选函数将日历摘要和可编辑完成详情隔离。

**Tech Stack:** Next.js App Router、React、TypeScript、Vitest、Supabase browser client、Tailwind。

## Global Constraints

- 基线必须是 \`aaed7202114931af2a4bd4124f3e7a7ef145874e\`；禁止整体合并旧历史分支。
- 不新增 migration、RLS、RPC、依赖、缓存键或环境变量。
- 不修改训练数据、完成状态、计划处方、Coach、Progress 或训练算法。
- 每项先 RED 后 GREEN；测试窗口明确“验证通过”前禁止部署。

---

### Task 1: 首页当前训练逐动作进度

**Files:**

- Create: \`src/domain/current-workout-progress.ts\`
- Create: \`src/domain/current-workout-progress.test.ts\`
- Modify: \`src/components/dashboard/home-dashboard.tsx\`
- Modify: \`src/components/dashboard/home-dashboard-next-workout.test.mjs\`

**Interfaces:**

- \`buildCurrentWorkoutProgress(exercises, logs)\` 返回 \`{ completedSets, totalSets, byExerciseId }\`。
- \`byExerciseId[exerciseId]\` 为 \`{ completedSets: number, totalSets: number }\`。

- [ ] **Step 1: Write the failing domain test**

\`\`\`ts
it("counts only current-workout completed logs", () => {
  expect(buildCurrentWorkoutProgress(
    [{ id: "squat" }, { id: "rdl" }],
    [
      { workout_exercise_id: "squat", completed: true },
      { workout_exercise_id: "squat", completed: true },
      { workout_exercise_id: "squat", completed: true },
      { workout_exercise_id: "rdl", completed: false },
      { workout_exercise_id: "older", completed: true }
    ]
  )).toEqual({
    completedSets: 3,
    totalSets: 4,
    byExerciseId: {
      squat: { completedSets: 3, totalSets: 3 },
      rdl: { completedSets: 0, totalSets: 1 }
    }
  });
});
\`\`\`

- [ ] **Step 2: Verify RED**

Run: \`pnpm vitest run src/domain/current-workout-progress.test.ts\`

Expected: FAIL because \`buildCurrentWorkoutProgress\` does not exist.

- [ ] **Step 3: Implement the minimal domain helper**

\`\`\`ts
export function buildCurrentWorkoutProgress(exercises, logs) {
  const ids = new Set(exercises.map((exercise) => exercise.id));
  const byExerciseId = Object.fromEntries(exercises.map((exercise) => [exercise.id, { completedSets: 0, totalSets: 0 }]));
  for (const log of logs) {
    if (!ids.has(log.workout_exercise_id)) continue;
    const progress = byExerciseId[log.workout_exercise_id];
    progress.totalSets += 1;
    if (log.completed) progress.completedSets += 1;
  }
  const values = Object.values(byExerciseId);
  return {
    byExerciseId,
    completedSets: values.reduce((sum, progress) => sum + progress.completedSets, 0),
    totalSets: values.reduce((sum, progress) => sum + progress.totalSets, 0)
  };
}
\`\`\`

- [ ] **Step 4: Verify GREEN**

Run: \`pnpm vitest run src/domain/current-workout-progress.test.ts\`

Expected: PASS.

- [ ] **Step 5: Write a failing dashboard source-contract**

In \`home-dashboard-next-workout.test.mjs\`, require an import of \`buildCurrentWorkoutProgress\`, a \`DB_TABLE.setLogs\` query scoped by current workout exercise IDs, and rendered total/action strings \`已完成 X/Y 组\`.

- [ ] **Step 6: Verify dashboard RED**

Run: \`pnpm vitest run src/components/dashboard/home-dashboard-next-workout.test.mjs\`

Expected: FAIL because the dashboard has no current-workout set-log read or progress UI.

- [ ] **Step 7: Implement dashboard read and display**

Add \`nextWorkoutSetLogs\` state and cache field. After \`loadNextWorkoutExercises(nextWorkoutRow.id)\`, query:

\`\`\`ts
supabase
  .from(DB_TABLE.setLogs)
  .select("workout_exercise_id,completed")
  .in("workout_exercise_id", nextWorkoutExerciseRows.map((exercise) => exercise.id));
\`\`\`

On query error, use \`[]\` and retain the current CTA. Use \`buildCurrentWorkoutProgress\` to render total progress under the card metadata and action-level \`X/Y 组已完成\` labels; all-complete text uses \`text-action\`, all other progress uses \`text-muted\`.

- [ ] **Step 8: Verify dashboard GREEN**

Run: \`pnpm vitest run src/domain/current-workout-progress.test.ts src/components/dashboard/home-dashboard-next-workout.test.mjs\`

Expected: PASS; old workout logs do not affect squat or total progress.

- [ ] **Step 9: Commit Task 1**

\`\`\`bash
git add src/domain/current-workout-progress.ts src/domain/current-workout-progress.test.ts src/components/dashboard/home-dashboard.tsx src/components/dashboard/home-dashboard-next-workout.test.mjs
git commit -m "fix: show current workout progress on home"
\`\`\`

### Task 2: 历史页只显示所选日期详情

**Files:**

- Create: \`src/domain/history-calendar.ts\`
- Create: \`src/domain/history-calendar.test.ts\`
- Create: \`src/components/history/history-calendar.test.tsx\`
- Modify: \`src/components/history/training-history.tsx\`

**Interfaces:**

- \`buildHistoryCalendarDays(month, workouts)\` builds month day cells.
- \`selectHistoryDetailWorkouts(selectedDate, calendarDays, workouts)\` returns selected-day, \`status === "completed"\` records only.

- [ ] **Step 1: Write the failing selected-date test**

\`\`\`ts
it("returns only completed workouts on the selected date", () => {
  const days = buildHistoryCalendarDays(new Date(2026, 6, 1), [
    { id: "jul-18", scheduledDate: "2026-07-18", status: "completed", dayType: "training", completedVolume: 845 },
    { id: "jul-31", scheduledDate: "2026-07-31", status: "completed", dayType: "training", completedVolume: 0 },
    { id: "jul-31-plan", scheduledDate: "2026-07-31", status: "scheduled", dayType: "training", completedVolume: 0 }
  ]);
  expect(selectHistoryDetailWorkouts("2026-07-31", days, [
    { id: "jul-18", status: "completed" },
    { id: "jul-31", status: "completed" },
    { id: "jul-31-plan", status: "scheduled" }
  ])).toEqual([{ id: "jul-31", status: "completed" }]);
});
\`\`\`

- [ ] **Step 2: Verify RED**

Run: \`pnpm vitest run src/domain/history-calendar.test.ts\`

Expected: FAIL because the current production base has no calendar module or selected-detail filter.

- [ ] **Step 3: Selectively port and implement the domain module**

Copy only month grid and boundary logic from \`ecbd3f5bbea0ce1152ec75cbf00de40eb155dd12\`; do not cherry-pick the branch. Implement:

\`\`\`ts
export function selectHistoryDetailWorkouts(selectedDate, calendarDays, workouts) {
  const selectedDay = selectedDate ? calendarDays.find((day) => day.date === selectedDate) : null;
  const selectedIds = new Set(selectedDay?.workouts.map((workout) => workout.id) ?? []);
  return workouts.filter((workout) => selectedIds.has(workout.id) && workout.status === "completed");
}
\`\`\`

- [ ] **Step 4: Verify domain GREEN**

Run: \`pnpm vitest run src/domain/history-calendar.test.ts\`

Expected: PASS; 2026-07-31 never returns 2026-07-18 or a scheduled item.

- [ ] **Step 5: Write a failing history component source-contract**

Require \`selectedDate\` initial \`null\`, \`detailWorkouts = selectHistoryDetailWorkouts(...)\`, and \`detailWorkouts.map(...)\`. Reject the unconditional completed list pattern \`workouts.filter((workout) => workout.status === "completed").map\`.

- [ ] **Step 6: Verify history RED**

Run: \`pnpm vitest run src/components/history/history-calendar.test.tsx\`

Expected: FAIL because the current base has no selected-date detail list.

- [ ] **Step 7: Implement history component integration**

Selectively port month state, user-scoped \`[monthStart, nextMonthStart)\` query, date cells, daily summary and safe focus URL behavior from \`ecbd3f5\`. Preserve current set validation and save code. Create:

\`\`\`ts
const detailWorkouts = useMemo(
  () => selectHistoryDetailWorkouts(selectedDate, calendarDays, workouts),
  [calendarDays, selectedDate, workouts]
);
\`\`\`

Render detail cards from \`detailWorkouts\` only. With no selected date, render no details; on a selected date with no completed workout, retain only the day summary. Month navigation clears \`selectedDate\` before loading.

- [ ] **Step 8: Verify history GREEN**

Run: \`pnpm vitest run src/domain/history-calendar.test.ts src/components/history/history-calendar.test.tsx src/components/history/history-workout-focus.test.ts\`

Expected: PASS; no cross-date details, month switch clears selection, inaccessible focus IDs do not leak.

- [ ] **Step 9: Commit Task 2**

\`\`\`bash
git add src/domain/history-calendar.ts src/domain/history-calendar.test.ts src/components/history/history-calendar.test.tsx src/components/history/training-history.tsx
git commit -m "fix: scope history details to selected date"
\`\`\`

### Task 3: Regression, independent QA and release gate

**Files:**

- Modify: \`docs/superpowers/plans/2026-08-20-home-history-training-progress.md\`

- [ ] **Step 1: Run focused regression**

Run:

\`\`\`bash
pnpm vitest run src/domain/current-workout-progress.test.ts src/components/dashboard/home-dashboard-next-workout.test.mjs src/domain/history-calendar.test.ts src/components/history/history-calendar.test.tsx src/components/history/history-workout-focus.test.ts
\`\`\`

Expected: PASS.

- [ ] **Step 2: Run complete local gate**

Run:

\`\`\`bash
pnpm test
pnpm release:check
git diff --check
git status --short --branch
\`\`\`

Expected: full test, typecheck, production build and 14-route local smoke PASS; no uncommitted source changes.

- [ ] **Step 3: Push and request independent QA**

\`\`\`bash
git push -u origin claude/home-history-progress
\`\`\`

Send the fixed commit, scope, acceptance points and exact commands to test thread \`019fac2b-9290-72f3-88d6-5b2344a8e949\`. Do not deploy until it explicitly replies “验证通过”.

- [ ] **Step 4: Deploy only the accepted commit and smoke production**

\`\`\`powershell
vercel deploy --prod --force --yes
$env:BASE_URL = "https://strength-periodization-manager.vercel.app"
$env:SMOKE_TRANSPORT = "powershell"
pnpm smoke
\`\`\`

Verify Vercel \`meta.gitCommitSha\` equals the accepted commit and \`/api/health\` returns \`ok=true\`; notify architect thread \`019f9d55-a57d-7860-8d3d-210bafc8c3e3\` for final acceptance.

