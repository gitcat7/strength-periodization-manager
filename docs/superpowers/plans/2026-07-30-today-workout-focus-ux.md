# Today Workout Focus UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Focus the Today page on the active exercise, show progress and elapsed time at the top, automatically collapse completed exercises, and present active rest timing without covering set inputs or the completion action.

**Architecture:** Preserve `TodayWorkout` as the owner of Supabase reads/writes, set validation, workout completion, substitution, and Coach logic. Add one pure disclosure module and two presentational components: a progress header and a rest-timer surface. Integrate them without changing database contracts or training-domain behavior.

**Tech Stack:** Next.js 14, React, TypeScript, Tailwind CSS, Vitest, React DOM test utilities.

## Global Constraints

- Mobile Web/PWA is the primary surface.
- Do not change plan generation, set validation, RPE rules, workout start/completion RPCs, exercise substitution, duration persistence, or Coach recommendation logic.
- The header shows completed sets/total sets, training direction, and elapsed time.
- The first incomplete exercise is the default active exercise.
- Completed exercises automatically collapse but remain manually reopenable.
- A manually selected exercise may be expanded without losing draft values.
- Finishing the last set of an exercise focuses the next incomplete exercise.
- The active rest timer must not cover the current set inputs or the sticky completion action.
- The bottom completion surface has one filled primary action.
- Decimal values such as `22.5` remain fully visible.
- Primary touch targets are at least 44px high.
- 375px, 390px, and 430px layouts must not horizontally overflow.
- No SQL migration is expected.
- No deployment until the independent test window explicitly reports “验证通过”.

---

## File Map

- Create `src/components/today/today-exercise-disclosure.ts`: pure current-exercise and expansion rules.
- Create `src/components/today/today-exercise-disclosure.test.ts`: disclosure transitions and edge cases.
- Create `src/components/today/today-progress-header.tsx`: progress, direction, date, focus, and elapsed-time presentation.
- Create `src/components/today/today-progress-header.test.tsx`: header content and mobile semantics.
- Create `src/components/today/rest-timer-surface.tsx`: compact inactive settings plus active floating rest prompt.
- Create `src/components/today/rest-timer-surface.test.tsx`: active/inactive controls and no-overlap contract.
- Modify `src/components/today/today-workout.tsx`: integrate the components and conditionally render exercise bodies.
- Modify `src/components/today/today-workout.test.tsx`: two-exercise focus, auto-collapse, manual reopen, decimal, rest, and sticky-action regressions.
- Preserve `src/components/today/rest-day-card.tsx` and rest-day behavior.

### Task 1: Pure active-exercise and disclosure rules

**Files:**
- Create: `src/components/today/today-exercise-disclosure.ts`
- Create: `src/components/today/today-exercise-disclosure.test.ts`

**Interfaces:**

```ts
export type ExerciseCompletion = {
  completedSets: number;
  exerciseId: string;
  totalSets: number;
};

export type ExerciseExpansionOverrides = Record<string, boolean>;

export function getActiveExerciseId(
  exercises: ExerciseCompletion[]
): string | null;

export function isExerciseExpanded({
  activeExerciseId,
  exerciseId,
  overrides
}: {
  activeExerciseId: string | null;
  exerciseId: string;
  overrides: ExerciseExpansionOverrides;
}): boolean;

export function toggleExerciseExpansion(
  overrides: ExerciseExpansionOverrides,
  exerciseId: string,
  currentExpanded: boolean
): ExerciseExpansionOverrides;

export function reconcileExerciseExpansion({
  after,
  before,
  overrides
}: {
  after: ExerciseCompletion[];
  before: ExerciseCompletion[];
  overrides: ExerciseExpansionOverrides;
}): ExerciseExpansionOverrides;
```

- [ ] **Step 1: Write failing disclosure tests**

```ts
it("selects the first exercise with an incomplete set", () => {
  expect(getActiveExerciseId([
    { exerciseId: "bench", completedSets: 4, totalSets: 4 },
    { exerciseId: "press", completedSets: 1, totalSets: 3 },
    { exerciseId: "raise", completedSets: 0, totalSets: 3 }
  ])).toBe("press");
});

it("opens only the active exercise by default", () => {
  expect(isExerciseExpanded({
    activeExerciseId: "press",
    exerciseId: "press",
    overrides: {}
  })).toBe(true);
  expect(isExerciseExpanded({
    activeExerciseId: "press",
    exerciseId: "bench",
    overrides: {}
  })).toBe(false);
});

it("collapses a just-completed exercise and lets the next incomplete exercise become active", () => {
  expect(reconcileExerciseExpansion({
    before: [
      { exerciseId: "bench", completedSets: 3, totalSets: 4 },
      { exerciseId: "press", completedSets: 0, totalSets: 3 }
    ],
    after: [
      { exerciseId: "bench", completedSets: 4, totalSets: 4 },
      { exerciseId: "press", completedSets: 0, totalSets: 3 }
    ],
    overrides: { bench: true }
  })).toEqual({ bench: false });
});
```

Also cover zero-set exercises, all-completed workouts, manual reopen, and unchecking a completed set.

- [ ] **Step 2: Run disclosure tests and verify RED**

Run:

```powershell
pnpm vitest run src/components/today/today-exercise-disclosure.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the minimal pure functions**

```ts
export function getActiveExerciseId(exercises: ExerciseCompletion[]) {
  return exercises.find(
    (exercise) =>
      exercise.totalSets > 0 &&
      exercise.completedSets < exercise.totalSets
  )?.exerciseId ?? null;
}

export function isExerciseExpanded({
  activeExerciseId,
  exerciseId,
  overrides
}: {
  activeExerciseId: string | null;
  exerciseId: string;
  overrides: ExerciseExpansionOverrides;
}) {
  return overrides[exerciseId] ?? exerciseId === activeExerciseId;
}

export function toggleExerciseExpansion(
  overrides: ExerciseExpansionOverrides,
  exerciseId: string,
  currentExpanded: boolean
) {
  return { ...overrides, [exerciseId]: !currentExpanded };
}
```

`reconcileExerciseExpansion` must set a newly completed exercise to `false` and remove a stale `false` override when that exercise becomes incomplete again, allowing it to become active.

- [ ] **Step 4: Run disclosure tests and verify GREEN**

Run:

```powershell
pnpm vitest run src/components/today/today-exercise-disclosure.test.ts
```

Expected: all disclosure tests pass.

- [ ] **Step 5: Commit the disclosure rules**

```powershell
git add src/components/today/today-exercise-disclosure.ts src/components/today/today-exercise-disclosure.test.ts
git commit -m "feat: focus today workout on active exercise"
```

### Task 2: Compact progress header

**Files:**
- Create: `src/components/today/today-progress-header.tsx`
- Create: `src/components/today/today-progress-header.test.tsx`

**Interfaces:**

```ts
export type TodayProgressHeaderProps = {
  completedSets: number;
  date: string;
  elapsedLabel: string | null;
  focus: string;
  intent: string;
  note: string;
  totalSets: number;
  workoutName: string;
};

export function TodayProgressHeader(
  props: TodayProgressHeaderProps
): JSX.Element;
```

- [ ] **Step 1: Write failing header tests**

```tsx
it("shows progress, intent, focus, and elapsed time in the workout header", () => {
  renderHeader({
    completedSets: 3,
    date: "2026-07-30",
    elapsedLabel: "已训练 42:18",
    focus: "胸 / 肩 / 三头",
    intent: "强度",
    note: "主项优先",
    totalSets: 16,
    workoutName: "推 A"
  });
  expect(view.textContent).toContain("3/16 组");
  expect(view.textContent).toContain("强度");
  expect(view.textContent).toContain("胸 / 肩 / 三头");
  expect(view.textContent).toContain("已训练 42:18");
  expect(view.querySelector("[role='progressbar']")).not.toBeNull();
});
```

Assert progressbar `aria-valuemin="0"`, `aria-valuemax="16"`, and `aria-valuenow="3"`.

- [ ] **Step 2: Run header tests and verify RED**

Run:

```powershell
pnpm vitest run src/components/today/today-progress-header.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the header**

The component contains no actions and no timer interval. Use the passed values:

```tsx
<div
  aria-label={`训练进度 ${completedSets}/${totalSets} 组`}
  aria-valuemax={totalSets}
  aria-valuemin={0}
  aria-valuenow={completedSets}
  role="progressbar"
>
  <div
    className="h-full rounded-full bg-action"
    style={{
      width: `${totalSets > 0
        ? Math.round((completedSets / totalSets) * 100)
        : 0}%`
    }}
  />
</div>
```

Keep the existing semantic intensity/completed tones and `action-surface`. Render `elapsedLabel` only when non-null.

- [ ] **Step 4: Run header tests and verify GREEN**

Run:

```powershell
pnpm vitest run src/components/today/today-progress-header.test.tsx
```

Expected: all header tests pass.

- [ ] **Step 5: Commit the header**

```powershell
git add src/components/today/today-progress-header.tsx src/components/today/today-progress-header.test.tsx
git commit -m "feat: add today workout progress header"
```

### Task 3: Non-obstructive rest timer surface

**Files:**
- Create: `src/components/today/rest-timer-surface.tsx`
- Create: `src/components/today/rest-timer-surface.test.tsx`

**Interfaces:**

```ts
export type RestTimerSurfaceProps = {
  context: string;
  enabled: boolean;
  isRunning: boolean;
  onNudge(seconds: number): void;
  onPause(): void;
  onReset(): void;
  onResume(): void;
  onSecondsChange(seconds: number): void;
  onSkip(): void;
  onToggle(enabled: boolean): void;
  options: number[];
  remaining: number;
  seconds: number;
};

export function RestTimerSurface(
  props: RestTimerSurfaceProps
): JSX.Element;
```

- [ ] **Step 1: Write failing rest-timer tests**

```tsx
it("keeps inactive settings compact and only floats while a rest is active", () => {
  renderTimer({ enabled: true, remaining: 0, seconds: 120 });
  expect(view.textContent).toContain("组间休息 120 秒");
  expect(view.querySelector("[data-rest-timer-floating]")).toBeNull();

  renderTimer({ enabled: true, remaining: 75, seconds: 120 });
  const floating = view.querySelector("[data-rest-timer-floating]");
  expect(floating).not.toBeNull();
  expect(floating?.className).toContain("bottom-[calc(10rem+env(safe-area-inset-bottom))]");
  expect(view.textContent).toContain("01:15");
});

it("offers pause, resume, nudge, reset, and skip with 44px controls", () => {
  renderTimer({ enabled: true, isRunning: true, remaining: 75, seconds: 120 });
  for (const label of ["暂停", "+15秒", "重置", "跳过"]) {
    expect(button(view, label).className).toContain("h-11");
  }
});
```

- [ ] **Step 2: Run rest-timer tests and verify RED**

Run:

```powershell
pnpm vitest run src/components/today/rest-timer-surface.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement compact and active states**

Inactive state:

- one compact row showing enable state and selected seconds;
- settings disclosure for 60/90/120/180;
- no fixed panel.

Active state:

```tsx
<aside
  aria-live="polite"
  className="fixed inset-x-4 bottom-[calc(10rem+env(safe-area-inset-bottom))] z-30 mx-auto max-w-md rounded-xl border border-action/20 bg-white/95 p-3 shadow-xl backdrop-blur"
  data-rest-timer-floating
>
```

The active surface shows context, countdown, progress, pause/resume, `+15秒`, reset, and skip. It must not use a full-screen overlay or trap focus.

- [ ] **Step 4: Run rest-timer tests and verify GREEN**

Run:

```powershell
pnpm vitest run src/components/today/rest-timer-surface.test.tsx
```

Expected: all rest-timer tests pass.

- [ ] **Step 5: Commit the rest timer**

```powershell
git add src/components/today/rest-timer-surface.tsx src/components/today/rest-timer-surface.test.tsx
git commit -m "feat: float active workout rest timer"
```

### Task 4: Integrate focus, progress, rest, and the single primary completion action

**Files:**
- Modify: `src/components/today/today-workout.tsx`
- Modify: `src/components/today/today-workout.test.tsx`
- Preserve: `src/components/today/today-workout-coach.test.tsx`
- Preserve: `src/components/today/exercise-substitution-dialog*.ts*`

**Interfaces:**
- Consumes: disclosure helpers, `TodayProgressHeader`, and `RestTimerSurface`.
- Produces: unchanged `TodayWorkout` export and unchanged persistence behavior.

- [ ] **Step 1: Extend failing Today integration tests**

Update the cache helper to support two exercises. Add:

```tsx
it("focuses the first incomplete exercise, collapses it when complete, and opens the next", async () => {
  writeTwoExerciseWorkout();
  ({ container, root } = renderTodayWorkout());
  await flushToday();

  expect(section(container, "杠铃卧推").getAttribute("data-expanded")).toBe("true");
  expect(section(container, "站姿推举").getAttribute("data-expanded")).toBe("false");

  setInputValue(
    section(container, "杠铃卧推").querySelector("input[aria-label='RPE']")!,
    "8"
  );
  act(() =>
    section(container, "杠铃卧推")
      .querySelector<HTMLInputElement>("input[aria-label='第 1 组完成']")
      ?.click()
  );

  expect(section(container, "杠铃卧推").getAttribute("data-expanded")).toBe("false");
  expect(section(container, "站姿推举").getAttribute("data-expanded")).toBe("true");

  act(() => clickButton(section(container, "杠铃卧推"), "展开"));
  expect(section(container, "杠铃卧推").getAttribute("data-expanded")).toBe("true");
});
```

Add assertions that:

- header contains elapsed time and one progressbar;
- active timer uses `data-rest-timer-floating`;
- exactly one filled-green action contains `保存并完成训练`;
- the sticky surface does not include a second filled primary button;
- a `22.5` weight input has enough width and retains `"22.5"`.

- [ ] **Step 2: Run Today tests and verify RED**

Run:

```powershell
pnpm vitest run src/components/today/today-workout.test.tsx
```

Expected: FAIL because every exercise body is always visible and rest timing is an inline card.

- [ ] **Step 3: Integrate the progress header**

Replace the existing duplicated header markup with:

```tsx
<TodayProgressHeader
  completedSets={completedSets}
  date={workout.scheduled_date}
  elapsedLabel={
    elapsedSeconds === null
      ? null
      : `已训练 ${formatElapsedTime(elapsedSeconds)}`
  }
  focus={workoutMeta.focus}
  intent={workoutMeta.intent}
  note={workoutMeta.note}
  totalSets={totalSets}
  workoutName={workout.name}
/>
```

Keep “按计划填入” and “保存记录” in a separate quiet utility row immediately below the header. Remove the duplicate elapsed-time paragraph near the bottom.

- [ ] **Step 4: Integrate exercise disclosure**

Add:

```ts
const [exerciseExpansion, setExerciseExpansion] =
  useState<ExerciseExpansionOverrides>({});
```

Build completion rows from `exercises` and `setLogs`, derive `activeExerciseId`, and calculate each `expanded` value with `isExerciseExpanded`.

Each article must have:

```tsx
data-exercise-id={exercise.id}
data-exercise-name={exercise.exercises?.name ?? "动作"}
data-expanded={expanded}
```

The exercise heading remains visible when collapsed. Add one 44px `展开`/`收起` button with `aria-expanded`. Render notes, detail launcher, substitution button, fill button, and set inputs only when `expanded`.

In `handleSetCompletionChange`, compute before/after completion rows and call `reconcileExerciseExpansion` after updating the log. Do not trigger rest when unchecking a set.

- [ ] **Step 5: Integrate the rest timer**

Replace the inline `RestTimerPanel` with `RestTimerSurface`, passing the existing callbacks unchanged. Delete the old local component only after all new tests pass.

- [ ] **Step 6: Keep one primary completion action**

The sticky completion surface retains:

- progress label and progress bar;
- one filled `保存并完成训练`/`训练已完成` button.

Move “查看完整计划” out of the sticky surface into a quiet text link above or below the exercise list. Do not remove navigation access.

- [ ] **Step 7: Run focused Today tests**

Run:

```powershell
pnpm vitest run src/components/today/today-exercise-disclosure.test.ts src/components/today/today-progress-header.test.tsx src/components/today/rest-timer-surface.test.tsx src/components/today/today-workout.test.tsx src/components/today/today-workout-coach.test.tsx src/components/today/rest-day-actions.test.ts src/components/today/rest-day-state.test.ts src/components/today/exercise-substitution-dialog-state.test.ts
```

Expected: all focused Today, rest-day, Coach, and substitution tests pass.

- [ ] **Step 8: Run full tests and release gate**

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

- [ ] **Step 9: Check mobile layouts**

At 375px, 390px, and 430px:

- header metrics fit without clipped text;
- one exercise body is open by default;
- collapsed cards remain understandable;
- `22.5` values are complete;
- active rest timer sits above the sticky completion surface;
- neither floating surface covers the current set row;
- all completion, expansion, and rest controls are at least 44px;
- there is no horizontal overflow.

- [ ] **Step 10: Commit the integration**

```powershell
git add src/components/today/today-workout.tsx src/components/today/today-workout.test.tsx
git commit -m "feat: focus today workout execution"
```

## Independent Test and Release Gate

The implementation window must provide the fixed commit, clean worktree, focused tests, full tests, and `release:check` evidence.

The independent test window must verify:

1. progress and elapsed duration are visible at the top;
2. the first incomplete exercise opens by default;
3. completing an exercise collapses it and focuses the next;
4. completed exercises can be manually reopened;
5. drafts survive collapse/reopen;
6. rest timing still starts only after newly completing a non-cardio set;
7. the active rest surface does not cover set inputs or completion action;
8. one filled primary completion action remains;
9. RPE, cardio exception, substitution, duration confirmation, and atomic completion are unchanged;
10. decimals and all three mobile widths remain valid.

Only after an explicit “验证通过” may the implementation window deploy the fixed commit. The deployment report must include commit, deployment ID, deployment URL, production URL, and 14-route production smoke results.
