# History Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the History page native date picker with a mobile-first monthly calendar that shows completed, scheduled, and rest training days and filters details by date.

**Architecture:** Extract pure calendar date and status aggregation utilities from the History screen into `src/domain/history-calendar.ts`. Keep Supabase queries and editable workout details in `TrainingHistory`, while a focused `HistoryCalendar` component receives normalized calendar entries and only emits date/filter actions.

**Tech Stack:** Next.js 15, React 19, TypeScript, Vitest, Tailwind CSS, lucide-react, Supabase.

## Global Constraints

- Mobile Web/PWA is the primary surface; month navigation and day controls must be comfortably tappable.
- Use friendly Chinese UI copy and kg-only training volume.
- Completed workouts alone affect completed-count, volume, and average-RPE metrics.
- Calendar states are mutually exclusive: completed training, scheduled training, rest day, or empty.
- No native `input[type=date]` remains on the History page.
- Existing history editing, saving, recommendations, and all-history filtering must remain functional.

---

### Task 1: Calendar domain model and date-grid utility

**Files:**
- Create: `src/domain/history-calendar.ts`
- Create: `src/domain/history-calendar.test.ts`

**Interfaces:**
- Produces `HistoryCalendarEntry`, `HistoryCalendarDay`, `buildHistoryCalendarDays`, `getMonthLabel`, and `shiftCalendarMonth`.
- Consumes workout values with `id`, `scheduled_date`, `status`, `day_type`, `name`, and completed `volume`.

- [ ] **Step 1: Write the failing test**

```ts
it("builds Monday-first calendar days and gives completed training priority", () => {
  const days = buildHistoryCalendarDays({
    month: "2026-07",
    selectedDate: "2026-07-27",
    workouts: [
      { day_type: "training", id: "done", name: "推 A", scheduled_date: "2026-07-27", status: "completed", volume: 845 },
      { day_type: "training", id: "next", name: "拉 B", scheduled_date: "2026-07-28", status: "scheduled", volume: 0 },
      { day_type: "rest", id: "rest", name: "恢复日", scheduled_date: "2026-07-29", status: "scheduled", volume: 0 }
    ]
  });
  expect(days).toHaveLength(42);
  expect(days.find((day) => day.date === "2026-07-27")).toMatchObject({ state: "completed", volume: 845, selected: true });
  expect(days.find((day) => day.date === "2026-07-28")).toMatchObject({ state: "scheduled" });
  expect(days.find((day) => day.date === "2026-07-29")).toMatchObject({ state: "rest" });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/domain/history-calendar.test.ts`

Expected: FAIL because `history-calendar.ts` does not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
export type HistoryCalendarState = "completed" | "scheduled" | "rest" | "empty";
export type HistoryCalendarEntry = {
  id: string; scheduled_date: string; status: string;
  day_type: "training" | "rest"; name: string; volume: number;
};
export function buildHistoryCalendarDays(args: {
  month: string; selectedDate: string; workouts: HistoryCalendarEntry[];
}): HistoryCalendarDay[] {
  // Build a 42-cell Monday-first grid and select the highest-priority entry per date.
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/domain/history-calendar.test.ts`

Expected: PASS with the calendar grid and year-boundary test.

- [ ] **Step 5: Commit**

```bash
git add src/domain/history-calendar.ts src/domain/history-calendar.test.ts
git commit -m "feat: add history calendar domain model"
```

### Task 2: Load calendar-visible workout states

**Files:**
- Modify: `src/components/history/training-history.tsx`
- Test: `src/components/history/training-history.test.tsx`

**Interfaces:**
- Consumes `HistoryCalendarEntry`.
- Produces `calendarEntries`, whose volume is calculated only from completed set logs; existing `summary` remains completed-training-only.

- [ ] **Step 1: Write the failing test**

```tsx
it("renders scheduled and rest calendar entries without counting them as completed", async () => {
  renderHistoryWithWorkouts([
    { id: "done", day_type: "training", scheduled_date: "2026-07-27", status: "completed" },
    { id: "next", day_type: "training", scheduled_date: "2026-07-28", status: "scheduled" },
    { id: "rest", day_type: "rest", scheduled_date: "2026-07-29", status: "scheduled" }
  ]);
  expect(await screen.findByRole("button", { name: /2026年7月28日.*待训练/ })).toBeInTheDocument();
  expect(screen.getByText("已完成")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/components/history/training-history.test.tsx`

Expected: FAIL because the calendar is not rendered and the existing query excludes non-completed workouts.

- [ ] **Step 3: Write minimal implementation**

```ts
const calendarEntries = useMemo(() => workouts.map((workout) => ({
  day_type: workout.day_type, id: workout.id, name: workout.name,
  scheduled_date: workout.scheduled_date, status: workout.status,
  volume: workout.status === "completed" ? getWorkoutCompletedVolume(workout.id) : 0
})), [workouts, setLogsByExerciseId, workoutExercises]);
```

Update the workout query to load completed historical workouts plus all dates in the active plan, while retaining the completed-only summary filter.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/components/history/training-history.test.tsx`

Expected: PASS with new calendar visibility assertions and existing history tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/history/training-history.tsx src/components/history/training-history.test.tsx
git commit -m "feat: load schedule states for history calendar"
```

### Task 3: Replace the date input with accessible monthly calendar UI

**Files:**
- Create: `src/components/history/history-calendar.tsx`
- Modify: `src/components/history/training-history.tsx`
- Test: `src/components/history/history-calendar.test.tsx`

**Interfaces:**
- Consumes `HistoryCalendarEntry[]`, `month`, `selectedDate`, `onMonthChange`, and `onSelectedDateChange`.
- Produces a 42-button monthly calendar; day buttons use `aria-label="YYYY年M月D日，<状态>"` and emit their ISO date.

- [ ] **Step 1: Write the failing test**

```tsx
it("changes month, selects a day, and restores all history", async () => {
  render(<HistoryCalendar entries={entries} month="2026-07" onMonthChange={onMonthChange} onSelectedDateChange={onSelectedDateChange} selectedDate="" />);
  await userEvent.click(screen.getByRole("button", { name: "查看 2026年6月" }));
  expect(onMonthChange).toHaveBeenCalledWith("2026-06");
  await userEvent.click(screen.getByRole("button", { name: /2026年7月27日，已完成训练/ }));
  expect(onSelectedDateChange).toHaveBeenCalledWith("2026-07-27");
  await userEvent.click(screen.getByRole("button", { name: "全部历史" }));
  expect(onSelectedDateChange).toHaveBeenLastCalledWith("");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/components/history/history-calendar.test.tsx`

Expected: FAIL because `HistoryCalendar` does not exist.

- [ ] **Step 3: Write minimal implementation**

```tsx
export function HistoryCalendar({ entries, month, onMonthChange, onSelectedDateChange, selectedDate }: HistoryCalendarProps) {
  const days = buildHistoryCalendarDays({ month, selectedDate, workouts: entries });
  return <section aria-label="训练月历">{/* controls, weekday row, days, 全部历史 */}</section>;
}
```

Use compact mobile chips: completed days show rounded volume in kg, scheduled days show “待训练”, rest days show “休息”, and empty days only show the date.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/components/history/history-calendar.test.tsx src/components/history/training-history.test.tsx`

Expected: PASS with all calendar and history assertions.

- [ ] **Step 5: Commit**

```bash
git add src/components/history/history-calendar.tsx src/components/history/history-calendar.test.tsx src/components/history/training-history.tsx
git commit -m "feat: show history in monthly calendar"
```

### Task 4: End-to-end verification and release

**Files:**
- Modify: `docs/superpowers/plans/2026-07-27-history-calendar.md` only to tick completed steps.

**Interfaces:**
- Consumes all completed calendar functionality.
- Produces verified production deployment with the monthly History calendar.

- [ ] **Step 1: Run focused tests**

Run: `pnpm vitest run src/domain/history-calendar.test.ts src/components/history/history-calendar.test.tsx src/components/history/training-history.test.tsx`

Expected: PASS with no unhandled rejections or warnings.

- [ ] **Step 2: Run full release gate**

Run: `pnpm release:check`

Expected: PASS for typecheck, production build, and local smoke checks.

- [ ] **Step 3: Commit implementation plan completion**

```bash
git add docs/superpowers/plans/2026-07-27-history-calendar.md
git commit -m "docs: complete history calendar plan"
```

- [ ] **Step 4: Publish and verify production**

```bash
git push origin codex/p0-remediation
pnpm dlx vercel deploy --prod --yes
$env:BASE_URL='https://strength-periodization-manager.vercel.app'; $env:SMOKE_TRANSPORT='powershell'; pnpm smoke
```

Expected: push succeeds, Vercel deployment reaches READY, and all production smoke routes return `ok`.
