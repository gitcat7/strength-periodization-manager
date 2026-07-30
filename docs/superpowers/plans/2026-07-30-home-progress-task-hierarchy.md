# Home and Progress Task Hierarchy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the next workout the home screen's single primary task and make progress metrics, conclusions, and charts respond consistently to a 4/8/12-week range.

**Architecture:** Keep Supabase loading and existing domain calculations in `HomeDashboard` and `ProgressDashboard`. Add a pure progress-range module plus small presentational controls, then simplify the two page compositions without changing database contracts, training algorithms, authentication, or cache keys.

**Tech Stack:** Next.js 14, React, TypeScript, Tailwind CSS, Vitest, React DOM test utilities.

## Global Constraints

- Mobile Web/PWA is the primary surface.
- Preserve all Supabase queries, authentication redirects, cache keys, plan generation, Coach recommendation semantics, PR calculations, and training-domain rules.
- No SQL migration, RPC, schema, or environment change.
- The home screen has one filled training action above the fold.
- “自由训练” remains available as a secondary outlined or text action.
- Recent training, Coach recommendations, and PR goals show summaries and navigation, not complete datasets.
- Progress ranges are exactly `4`, `8`, and `12` weeks; default is `8`.
- Changing range updates completed workouts, total volume, completion rate, weekly bars, e1RM trends, and the natural-language insight from the same filtered dataset.
- Weekly rows show volume, completed/planned sets, and change from the previous displayed week.
- e1RM trends visibly expose date, value, best value, and range change.
- Trend copy describes recorded data and does not make medical claims.
- Primary touch targets are at least 44px high.
- 375px, 390px, and 430px layouts must not horizontally overflow.

---

### Task 1: Pure progress range and comparison rules

**Files:**
- Create: `src/domain/progress-range.ts`
- Create: `src/domain/progress-range.test.ts`

**Interfaces:**
- Produces: `ProgressRangeWeeks`, `progressRangeOptions`, `isDateInProgressRange`, and `formatPeriodChange`.
- Consumes: ISO `YYYY-MM-DD` dates already used by completed workouts.

- [ ] **Step 1: Write failing range tests**

```ts
import { describe, expect, it } from "vitest";
import {
  formatPeriodChange,
  isDateInProgressRange,
  progressRangeOptions
} from "./progress-range";

describe("progress range", () => {
  it("offers only 4, 8, and 12 weeks", () => {
    expect(progressRangeOptions).toEqual([4, 8, 12]);
  });

  it("includes the reference day and the first day of the selected window", () => {
    const reference = new Date("2026-07-30T12:00:00+08:00");
    expect(isDateInProgressRange("2026-07-30", 4, reference)).toBe(true);
    expect(isDateInProgressRange("2026-07-03", 4, reference)).toBe(true);
    expect(isDateInProgressRange("2026-07-02", 4, reference)).toBe(false);
  });

  it("formats increase, decrease, unchanged, and unavailable comparisons", () => {
    expect(formatPeriodChange(1200, 1000)).toBe("较上周 +20.0%");
    expect(formatPeriodChange(800, 1000)).toBe("较上周 -20.0%");
    expect(formatPeriodChange(1000, 1000)).toBe("较上周 0.0%");
    expect(formatPeriodChange(1000, 0)).toBe("暂无上周基线");
  });
});
```

- [ ] **Step 2: Verify RED**

Run:

```powershell
pnpm vitest run src/domain/progress-range.test.ts
```

Expected: FAIL because `progress-range.ts` does not exist.

- [ ] **Step 3: Implement the pure rules**

```ts
export type ProgressRangeWeeks = 4 | 8 | 12;

export const progressRangeOptions: ProgressRangeWeeks[] = [4, 8, 12];

export function isDateInProgressRange(
  isoDate: string,
  weeks: ProgressRangeWeeks,
  referenceDate = new Date()
) {
  const end = new Date(referenceDate);
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(start.getDate() - weeks * 7 + 1);
  start.setHours(0, 0, 0, 0);
  const value = new Date(`${isoDate}T12:00:00`);
  return value >= start && value <= end;
}

export function formatPeriodChange(current: number, previous: number) {
  if (previous <= 0) return "暂无上周基线";
  const percent = ((current - previous) / previous) * 100;
  return `较上周 ${percent >= 0 ? "+" : ""}${percent.toFixed(1)}%`;
}
```

- [ ] **Step 4: Verify GREEN**

Run:

```powershell
pnpm vitest run src/domain/progress-range.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```powershell
git add src/domain/progress-range.ts src/domain/progress-range.test.ts
git commit -m "feat: add progress range rules"
```

### Task 2: Accessible range switcher

**Files:**
- Create: `src/components/progress/progress-range-switcher.tsx`
- Create: `src/components/progress/progress-range-switcher.test.tsx`

**Interfaces:**
- Consumes: `ProgressRangeWeeks` and `progressRangeOptions`.
- Produces: `ProgressRangeSwitcher({ value, onChange })`.

- [ ] **Step 1: Write the failing component test**

```tsx
/* @vitest-environment jsdom */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ProgressRangeSwitcher } from "./progress-range-switcher";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("shows three 44px range buttons and reports selection", () => {
  const onChange = vi.fn();
  const view = document.createElement("div");
  const root = createRoot(view);
  act(() => root.render(<ProgressRangeSwitcher onChange={onChange} value={8} />));
  const buttons = [...view.querySelectorAll("button")];
  expect(buttons.map((button) => button.textContent)).toEqual(["4周", "8周", "12周"]);
  expect(buttons.every((button) => button.className.includes("h-11"))).toBe(true);
  expect(buttons[1]?.getAttribute("aria-pressed")).toBe("true");
  act(() => buttons[0]?.click());
  expect(onChange).toHaveBeenCalledWith(4);
  act(() => root.unmount());
});
```

- [ ] **Step 2: Verify RED**

Run:

```powershell
pnpm vitest run src/components/progress/progress-range-switcher.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the switcher**

Use a three-column `role="group"` with `aria-label="进展时间范围"`. Each button must use `h-11`, `aria-pressed`, and stable selected/unselected color classes. Do not use a native select or hide the labels on mobile.

- [ ] **Step 4: Verify GREEN and commit**

```powershell
pnpm vitest run src/components/progress/progress-range-switcher.test.tsx
git add src/components/progress/progress-range-switcher.tsx src/components/progress/progress-range-switcher.test.tsx
git commit -m "feat: add progress range switcher"
```

### Task 3: Apply one filtered dataset to every progress result

**Files:**
- Modify: `src/components/progress/progress-dashboard.tsx`
- Create: `src/components/progress/progress-dashboard.test.tsx`

**Interfaces:**
- Consumes: `ProgressRangeSwitcher`, `ProgressRangeWeeks`, `isDateInProgressRange`, and `formatPeriodChange`.
- Preserves: existing Supabase queries, cache hydration, `buildWeeklyTrends`, `buildLiftTrends`, and `buildProgressInsight`.

- [ ] **Step 1: Write failing integration tests**

Hydrate the existing progress cache with completed workouts inside and outside an 8-week window. Assert:

```tsx
expect(view.textContent).toContain("8周");
expect(view.textContent).toContain("完成训练 2 次");
expect(view.textContent).not.toContain("99,999 kg");
```

Then click the unique `4周` button and assert that the metric values, weekly rows, e1RM point count, and insight text all update from the 4-week subset. Add a second assertion that `12周` includes the older in-range workout.

- [ ] **Step 2: Verify RED**

Run:

```powershell
pnpm vitest run src/components/progress/progress-dashboard.test.tsx
```

Expected: FAIL because the page has no range state or range switcher.

- [ ] **Step 3: Add range state and a single filtering boundary**

Add:

```ts
const [rangeWeeks, setRangeWeeks] = useState<ProgressRangeWeeks>(8);
```

Inside the existing memo, filter `trainingWorkouts` first with `isDateInProgressRange`. Derive the workout ID set, exercises, logs, totals, weekly trends, lift trends, and insight only from that filtered list. Return `filteredWorkoutCount` from the memo and use it for “完成训练”; do not keep using the unfiltered `workouts.length`.

- [ ] **Step 4: Add range and comparison presentation**

Place `ProgressRangeSwitcher` before `ProgressInsightCard`. Pass each weekly row its previous displayed week's volume and render:

```tsx
note={`${week.completedSets}/${week.plannedSets} 组 · ${formatPeriodChange(week.volume, previousVolume)}`}
```

For the first displayed week, show `暂无上周基线`.

Update `LiftTrendCard` so each point has visible date and e1RM text, while retaining best e1RM and start-to-latest change in the card header. Use horizontal scrolling inside the chart card only if required; the page itself must never overflow.

- [ ] **Step 5: Preserve empty and error behavior**

The page-level empty state remains for no completed workouts at all. When a selected range contains no workouts, show an inline range-specific empty state with the switcher still available, so the user can choose a larger range.

- [ ] **Step 6: Verify and commit**

```powershell
pnpm vitest run src/domain/progress-range.test.ts src/components/progress/progress-range-switcher.test.tsx src/components/progress/progress-dashboard.test.tsx
git add src/components/progress/progress-dashboard.tsx src/components/progress/progress-dashboard.test.tsx
git commit -m "feat: filter progress by selected range"
```

### Task 4: Make the next workout the home screen's only primary task

**Files:**
- Modify: `src/components/dashboard/home-dashboard.tsx`
- Create: `src/components/dashboard/home-dashboard-priority.test.tsx`
- Preserve: `src/components/dashboard/home-dashboard-next-workout.test.mjs`

**Interfaces:**
- Consumes existing `nextWorkout`, `nextWorkoutExercises`, `recentTraining`, `recommendations`, `summary`, and `prGoals`.
- Produces no new persistence or data-fetching behavior.

- [ ] **Step 1: Write failing home hierarchy tests**

Hydrate the current dashboard cache with a next workout, recent training, multiple recommendations, and a PR goal. Assert:

1. the “下一次训练” card appears before “最近一次训练”;
2. exactly one filled link above the management section points to `/today`;
3. “自由训练” remains an outlined/text link to `/single-workout`;
4. only one Coach recommendation detail is rendered, plus a remaining-count summary;
5. the metric strip has three columns at mobile width through `grid-cols-3`;
6. both training actions are at least `h-11`.

- [ ] **Step 2: Verify RED**

Run:

```powershell
pnpm vitest run src/components/dashboard/home-dashboard-priority.test.tsx src/components/dashboard/home-dashboard-next-workout.test.mjs
```

Expected: FAIL because recent training currently precedes the next workout and the mobile metric strip is not three columns.

- [ ] **Step 3: Reorder and simplify the home composition**

Render in this order:

1. page header;
2. compact three-column metric strip;
3. next workout action surface;
4. recent training summary;
5. Coach summary and PR summary;
6. management navigation.

The next-workout card owns the only filled training CTA, labeled `继续训练`, linking to `/today`. Keep `自由训练` as an `h-11` outlined/text action. If no plan exists, the one filled CTA may instead be `创建周期计划`; the free-training entry remains secondary.

- [ ] **Step 4: Compress summaries without dropping navigation**

Use `recommendations.slice(0, 1)` and show `另有 N 条待处理建议` when more exist. Keep only the nearest PR and existing recent-training aggregate. Do not duplicate full set logs, plan weeks, trend charts, or the full recommendation list on home.

- [ ] **Step 5: Verify and commit**

```powershell
pnpm vitest run src/components/dashboard/home-dashboard-priority.test.tsx src/components/dashboard/home-dashboard-next-workout.test.mjs
git add src/components/dashboard/home-dashboard.tsx src/components/dashboard/home-dashboard-priority.test.tsx
git commit -m "feat: prioritize next workout on home"
```

### Task 5: Full regression, release gate, and mobile acceptance

**Files:**
- Modify only files already listed if verification reveals an in-scope issue.

- [ ] **Step 1: Run the focused suite**

```powershell
pnpm vitest run src/domain/progress-range.test.ts src/components/progress/progress-range-switcher.test.tsx src/components/progress/progress-dashboard.test.tsx src/components/dashboard/home-dashboard-priority.test.tsx src/components/dashboard/home-dashboard-next-workout.test.mjs
```

Expected: all focused tests pass with no unhandled React update warnings in newly created tests.

- [ ] **Step 2: Run full tests**

```powershell
pnpm test
```

Expected: no failures; the existing intentionally skipped smoke test may remain skipped.

- [ ] **Step 3: Run the release gate**

```powershell
pnpm release:check
```

Expected: typecheck, production build, and local 14-route smoke pass.

- [ ] **Step 4: Check mobile acceptance**

At 375px, 390px, and 430px verify:

- home has no horizontal overflow and the metric strip remains readable;
- the next workout and `继续训练` are visible before recent/management summaries;
- there is only one filled training CTA in the home first task area;
- progress range buttons remain on one row and are at least 44px high;
- changing each range updates metrics, weekly comparison text, e1RM values, and insight;
- long kg values and dates do not force page-level horizontal scrolling.

- [ ] **Step 5: Confirm change boundary**

```powershell
git diff --check
git status --short
git diff --name-only HEAD~4..HEAD
```

Reject any migration, schema, RPC, plan-generation, Coach algorithm, PR algorithm, or unrelated page change.

## Independent Test and Release Gate

The implementation task must provide a fixed commit, clean worktree, focused/full/release evidence, and explicitly notify the existing “测试” task.

The independent test task must verify:

1. home places the next workout before recent/history/management summaries;
2. home has one filled primary training action and a secondary free-training entry;
3. home summaries do not expand into full recommendation/history/PR datasets;
4. progress defaults to 8 weeks;
5. 4/8/12-week changes update all metrics, weekly bars, e1RM, and insight together;
6. weekly change and visible e1RM date/value/best/change are correct;
7. cache hydration, auth redirects, empty states, and errors remain valid;
8. all three mobile widths have no page overflow;
9. no SQL/RPC/algorithm changes exist.

Only after an explicit “验证通过” may the implementation task deploy the fixed commit. The deployment report must include the commit, deployment ID, deployment URL, production URL, and 14-route production smoke results, then notify the architect task for final acceptance.
