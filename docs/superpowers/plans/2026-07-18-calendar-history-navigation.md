# Calendar History Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a five-item History tab and an authenticated month calendar that opens the same focused workout detail used by completed-training success flows.

**Architecture:** Keep `TrainingHistory` as the sole record-detail renderer. Add a pure calendar aggregation module and a bounded month query/read model; the history page renders the calendar, selected-day summary, then existing details. Navigation changes replace the mobile PR tab with History while retaining PR links in dashboard/progress.

**Tech Stack:** Next.js App Router, React, TypeScript, Supabase, Vitest, Testing Library, Tailwind.

## Global Constraints

- Bottom navigation has exactly five items: Today, Plan, History, Progress, Settings.
- No user can read or infer another user's workouts through month queries or `workout` URL parameters.
- Free workouts are visible in history but never alter periodized-plan state.
- Month queries are bounded to the displayed calendar range; no unbounded full-history fetch.
- Reuse `/history?workout=<id>` and existing `getHistoryWorkoutFocusId` for all workout detail entry points.
- Do not delete PR data, routes, or dashboard access.

---

### Task 1: Navigation and calendar-domain aggregation

**Files:**
- Modify: `src/components/navigation/bottom-nav.tsx`
- Create: `src/domain/history-calendar.ts`
- Create: `src/domain/history-calendar.test.ts`
- Modify: existing bottom-nav test or create `src/components/navigation/bottom-nav.test.tsx`

**Interfaces:**
- `buildHistoryCalendarDays(month: Date, workouts: CalendarWorkout[]): CalendarDay[]` returns 42 Monday-first cells.
- `CalendarDay` is `{ date: string; inMonth: boolean; workouts: CalendarWorkout[]; completedVolume: number; status: "empty" | "planned" | "completed" | "rest" }`.

- [ ] **Step 1: Write failing calendar and nav tests**

```ts
it("builds a Monday-first July grid and aggregates two completed workouts on one date", () => {
  const days = buildHistoryCalendarDays(new Date(2026, 6, 1), [completed("2026-07-15", 845), completed("2026-07-15", 500)]);
  expect(days).toHaveLength(42);
  expect(days.find((day) => day.date === "2026-07-15")).toMatchObject({ completedVolume: 1345, status: "completed" });
});

it("renders History and omits PR from the bottom navigation", () => {
  render(<BottomNav />);
  expect(screen.getByRole("link", { name: "历史" })).toHaveAttribute("href", "/history");
  expect(screen.queryByRole("link", { name: "PR" })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `pnpm test -- src/domain/history-calendar.test.ts src/components/navigation/bottom-nav.test.tsx`

Expected: FAIL because the calendar module and History tab do not exist.

- [ ] **Step 3: Implement the pure formatter and five navigation entries**

```ts
export const bottomNavItems = [
  { href: "/", label: "今日", icon: Dumbbell },
  { href: "/plan", label: "计划", icon: CalendarDays },
  { href: "/history", label: "历史", icon: History },
  { href: "/progress", label: "进展", icon: BarChart3 },
  { href: "/settings", label: "设置", icon: Settings }
] as const;
```

For aggregation, include only completed training in `completedVolume`; rest days have `status: "rest"`; planned-but-uncompleted workouts have `status: "planned"`; a completed record wins visual status for a date with mixed data. Do not use color as the only state signal.

- [ ] **Step 4: Verify and commit**

Run: `pnpm test -- src/domain/history-calendar.test.ts src/components/navigation/bottom-nav.test.tsx && pnpm lint`

Expected: PASS.

```bash
git add src/domain/history-calendar.ts src/domain/history-calendar.test.ts src/components/navigation/bottom-nav.tsx src/components/navigation/bottom-nav.test.tsx
git commit -m "feat: add history to primary navigation"
```

### Task 2: Bounded month read model and calendar UI

**Files:**
- Modify: `src/components/history/training-history.tsx`
- Create: `src/components/history/history-calendar.test.tsx`

**Interfaces:**
- `TrainingHistory` reads only `monthStart <= scheduled_date < nextMonthStart` for visible calendar data.
- Date selection sets `selectedDate: string | null`; selected-day cards link to `/history?workout=<id>`.

- [ ] **Step 1: Write failing component tests**

```tsx
it("changes month using bounded date filters and shows completed volume in the selected day", async () => {
  render(<TrainingHistory />);
  await userEvent.click(await screen.findByRole("button", { name: "下个月" }));
  expect(mockWorkoutQuery.gte).toHaveBeenCalledWith("scheduled_date", "2026-08-01");
  expect(mockWorkoutQuery.lt).toHaveBeenCalledWith("scheduled_date", "2026-09-01");
});

it("does not display an unauthorized focused workout", async () => {
  setHistorySearch("?workout=other-user-workout");
  render(<TrainingHistory />);
  expect(await screen.findByText("训练历史")).toBeVisible();
  expect(screen.queryByLabelText("当前查看的训练记录")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `pnpm test -- src/components/history/history-calendar.test.tsx`

Expected: FAIL because the month grid and bounded query do not exist.

- [ ] **Step 3: Implement month navigation and rendering**

Use a `visibleMonth` state normalized to the first day of month and disable the next-month button when it would exceed the current month. Preserve current user authentication and RLS-backed Supabase queries. Render a seven-column Monday-first semantic button grid with accessible labels like `2026-07-15，自由训练，845 kg`. Limit each cell to two compact labels, display aggregate count/volume for multiple workouts, and make only dates with records interactive. Keep selected-day summary below the grid with type, status, completed sets, volume, and e1RM or `不适用`.

- [ ] **Step 4: Reuse focused record behavior**

Keep the existing query parser. When `workout` resolves to a loaded user workout, make its date selected, render its summary, use the existing focus/highlight/scroll behavior, and do not issue a separate unrestricted query. Invalid IDs leave selected date unset and show normal user history.

- [ ] **Step 5: Verify and commit**

Run: `pnpm test -- src/components/history/history-calendar.test.tsx src/components/history/history-workout-focus.test.ts && pnpm lint`

Expected: PASS.

```bash
git add src/components/history/training-history.tsx src/components/history/history-calendar.test.tsx
git commit -m "feat: browse training history by month"
```

### Task 3: Integrate completion and dashboard entry points, then verify

**Files:**
- Modify: `src/components/single-workout/single-workout-recorder.tsx`
- Modify: `src/components/dashboard/home-dashboard.tsx`
- Modify: their existing component tests

**Interfaces:**
- Completed free workout routes to `/history?workout=<id>`.
- Dashboard recent-workout link uses the same URL and is rendered only for a completed current-user workout.

- [ ] **Step 1: Write failing integration tests**

```tsx
it("links the finished workout to the focused history URL", async () => {
  renderCompletedRecorder({ workoutId: "workout-1" });
  expect(screen.getByRole("link", { name: "查看本次记录" })).toHaveAttribute("href", "/history?workout=workout-1");
});

it("renders a recent training summary only when a completed workout exists", () => {
  render(<HomeDashboard completedWorkout={completed("2026-07-18", 845)} />);
  expect(screen.getByRole("link", { name: /最近一次训练/i })).toHaveAttribute("href", "/history?workout=workout-1");
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `pnpm test -- src/components/single-workout src/components/dashboard`

Expected: FAIL until links and recent summary are wired to the common detail URL.

- [ ] **Step 3: Implement only the shared-entry integration**

After successful completion retain the saved workout ID in success state and use it for the existing success-page action. Query the most recent completed workout for the dashboard through the current user session, calculate its completed set count and volume from owned records, and clear/revalidate dashboard cache after completion. Do not create a second detail page and do not modify period plan state.

- [ ] **Step 4: Full verification and browser smoke**

Run: `pnpm test && pnpm lint && pnpm typecheck && pnpm build`

Expected: all commands exit 0.

Browser smoke:
1. Complete a free workout and open `查看本次记录`.
2. Confirm the current month calendar selects/highlights the saved record.
3. Change to a prior month and back; verify no future month selection.
4. Confirm a planned workout, completed workout and rest day render distinct labels.
5. Return home and open the recent-workout card.
6. Open `/history?workout=` with an invalid ID; verify normal user data only.

```bash
git add src/components/single-workout src/components/dashboard src/components/history
git commit -m "feat: connect recent workouts to calendar history"
git status --short --branch
```
