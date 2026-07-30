# Plan Page Task-Centered UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the plan page open on a concise current-cycle management view for existing users, with one primary training action, secondary controls inside a disclosure, and the current week/current structure cycle expanded by default.

**Architecture:** Keep plan generation, Supabase queries, recommendation mutations, and regeneration safety in `ProgramManager`. Move deterministic current-week/current-cycle selection into `src/domain/plan-outline.ts`, and move the two large presentational regions into focused components with primitive callback props. Preserve the existing plan form and regeneration dialog unchanged.

**Tech Stack:** Next.js 14 App Router, React, TypeScript, Tailwind CSS, Vitest, React DOM test utilities.

## Global Constraints

- Mobile Web/PWA is the primary surface.
- Preserve the existing green, white, card-based visual direction.
- Do not change plan generation, coaching logic, database schema, RPC signatures, or cache ownership.
- Existing users must not see the first-plan generation form unless they explicitly enter adjustment mode.
- The plan page must have one visual primary action in its overview.
- Default disclosure depth is current week plus current training-structure cycle.
- 375px, 390px, and 430px layouts must not horizontally overflow.
- Primary touch targets must be at least 44px high.
- Legacy plan rows and rest days remain readable.
- No production deployment until the independent test task explicitly reports “验证通过”.

---

## File Map

- Modify `src/domain/plan-outline.ts`: expose plan outline types and deterministic default week/cycle selection.
- Modify `src/domain/plan-outline.test.ts`: unit-test current cycle selection, all-complete fallback, and rest-only behavior.
- Create `src/components/plan/current-program-overview.tsx`: current-cycle summary, one primary CTA, and disclosed management actions.
- Create `src/components/plan/current-program-overview.test.tsx`: component behavior and accessibility checks.
- Create `src/components/plan/plan-schedule-outline.tsx`: week/cycle disclosures and workout rendering shell.
- Create `src/components/plan/plan-schedule-outline.test.tsx`: default/all/collapsed expansion tests.
- Modify `src/components/plan/program-manager.tsx`: integrate extracted components and retain mutation ownership.
- Modify `src/components/plan/program-manager.test.tsx`: existing-plan page regression and management-entry tests.

### Task 1: Deterministic current week and structure cycle

**Files:**
- Modify: `src/domain/plan-outline.ts`
- Modify: `src/domain/plan-outline.test.ts`

**Interfaces:**
- Consumes: `PlanOutlineWorkout[]` and the grouped output of `groupPlanOutline`.
- Produces:

```ts
export type PlanOutline = ReturnType<typeof groupPlanOutline>;

export type DefaultPlanPosition = {
  cycleIndex: number | null;
  week: number;
};

export function getDefaultPlanPosition(
  outline: PlanOutline,
  startDate: string,
  now: Date
): DefaultPlanPosition;
```

- [ ] **Step 1: Add failing unit tests**

Append tests that prove the default position chooses the calendar week when present, selects the first cycle with an unfinished training day, falls back to a later unfinished week when the calendar week is outside the plan, and returns the final cycle for an entirely completed plan.

```ts
import { getDefaultPlanPosition, groupPlanOutline } from "./plan-outline";

it("opens the current week and its first unfinished training cycle", () => {
  const outline = groupPlanOutline([
    { id: "a", day_type: "training", name: "推 A", schedule_index: 0, sequence_index: 0, scheduled_date: "2026-07-27", status: "completed" },
    { id: "b", day_type: "training", name: "拉 B", schedule_index: 1, sequence_index: 1, scheduled_date: "2026-07-28", status: "completed" },
    { id: "c", day_type: "training", name: "推 A", schedule_index: 2, sequence_index: 2, scheduled_date: "2026-07-29", status: "scheduled" }
  ], "2026-07-27");

  expect(getDefaultPlanPosition(outline, "2026-07-27", new Date("2026-07-28T08:00:00")))
    .toEqual({ week: 1, cycleIndex: 2 });
});

it("falls back to the first week and cycle with unfinished training", () => {
  const outline = groupPlanOutline([
    { id: "a", day_type: "training", name: "推 A", schedule_index: 0, sequence_index: 0, scheduled_date: "2026-07-01", status: "completed" },
    { id: "b", day_type: "training", name: "拉 B", schedule_index: 8, sequence_index: 1, scheduled_date: "2026-07-09", status: "scheduled" }
  ], "2026-07-01");

  expect(getDefaultPlanPosition(outline, "2026-07-01", new Date("2026-08-20T08:00:00")))
    .toEqual({ week: 2, cycleIndex: 1 });
});
```

- [ ] **Step 2: Run the unit tests and verify RED**

Run:

```powershell
pnpm vitest run src/domain/plan-outline.test.ts
```

Expected: FAIL because `getDefaultPlanPosition` is not exported.

- [ ] **Step 3: Implement the minimal selector**

Add explicit exported types and a selector that never mutates the outline:

```ts
export type PlanOutline = ReturnType<typeof groupPlanOutline>;

export type DefaultPlanPosition = {
  cycleIndex: number | null;
  week: number;
};

export function getDefaultPlanPosition(
  outline: PlanOutline,
  startDate: string,
  now: Date
): DefaultPlanPosition {
  const start = new Date(`${startDate}T00:00:00`);
  const currentWeek = Math.max(
    1,
    Math.floor((now.getTime() - start.getTime()) / 86_400_000 / 7) + 1
  );
  const calendarWeek = outline.find((item) => item.week === currentWeek);
  const unfinishedWeek = outline.find(
    (item) => item.completedTrainingDays < item.totalTrainingDays
  );
  const selectedWeek = calendarWeek ?? unfinishedWeek ?? outline.at(-1);
  const unfinishedCycle = selectedWeek?.cycles.find(
    (cycle) => cycle.completedTrainingDays < cycle.totalTrainingDays
  );

  return {
    week: selectedWeek?.week ?? 1,
    cycleIndex: unfinishedCycle?.index ?? selectedWeek?.cycles.at(-1)?.index ?? null
  };
}
```

If a cycle contains only rest rows, it must not be selected ahead of an unfinished training cycle.

- [ ] **Step 4: Run the unit tests and verify GREEN**

Run:

```powershell
pnpm vitest run src/domain/plan-outline.test.ts
```

Expected: all `plan-outline` tests pass.

- [ ] **Step 5: Commit the selector**

```powershell
git add src/domain/plan-outline.ts src/domain/plan-outline.test.ts
git commit -m "feat: select current plan structure cycle"
```

### Task 2: Current program overview and disclosed management controls

**Files:**
- Create: `src/components/plan/current-program-overview.tsx`
- Create: `src/components/plan/current-program-overview.test.tsx`

**Interfaces:**
- Consumes:

```ts
export type CurrentProgramOverviewProps = {
  currentCycleLabel: string | null;
  currentWeek: number;
  endDate: string;
  isBusy: boolean;
  managementOpen: boolean;
  name: string;
  nextWorkout: {
    date: string;
    focus: string;
    intent: string;
    name: string;
    stateLabel: string;
  } | null;
  onAdjustPlan: () => void;
  onRegenerate: () => void;
  onToggleManagement: () => void;
  onToggleProfile: () => void;
  profileOpen: boolean;
  startDate: string;
};
```

- Produces: a presentational `<CurrentProgramOverview />` with no Supabase access and no mutation logic.

- [ ] **Step 1: Write failing component tests**

Cover:

```tsx
it("shows one primary training action and keeps management controls disclosed", () => {
  renderOverview();
  expect(view.querySelectorAll("a[href='/today']")).toHaveLength(1);
  expect(view.textContent).toContain("第 1 周");
  expect(view.textContent).toContain("循环 2");
  expect(view.textContent).not.toContain("按当前参数重新生成");
  clickButton(view, "计划管理");
  expect(view.textContent).toContain("调整计划");
  expect(view.textContent).toContain("按当前参数重新生成");
  expect(view.textContent).toContain("更新体重、饮食与恢复");
});

it("uses a 44px minimum height for primary and management triggers", () => {
  renderOverview();
  expect(buttonOrLink(view, "继续训练").className).toContain("h-11");
  expect(buttonOrLink(view, "计划管理").className).toContain("h-11");
});
```

Use the existing React `createRoot`/`act` test pattern; do not add Testing Library.

- [ ] **Step 2: Run the component tests and verify RED**

Run:

```powershell
pnpm vitest run src/components/plan/current-program-overview.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the overview**

Build:

```tsx
export function CurrentProgramOverview(props: CurrentProgramOverviewProps) {
  return (
    <section className="action-surface p-4">
      <p className="page-kicker">当前周期</p>
      <div className="mt-1 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-xl font-bold">{props.name}</h2>
          <p className="mt-1 text-sm text-muted">
            第 {props.currentWeek} 周
            {props.currentCycleLabel ? ` · ${props.currentCycleLabel}` : ""}
          </p>
          <p className="text-sm text-muted">{props.startDate} 至 {props.endDate}</p>
        </div>
      </div>
      {props.nextWorkout ? (
        <div className="mt-4 rounded-lg border border-action/15 bg-white p-3">
          <p className="page-kicker">{props.nextWorkout.stateLabel}</p>
          <p className="mt-1 font-semibold">{props.nextWorkout.name}</p>
          <p className="mt-1 text-sm text-muted">
            {props.nextWorkout.intent} · {props.nextWorkout.focus} · {props.nextWorkout.date}
          </p>
        </div>
      ) : null}
      <Link className="pressable mt-4 flex h-11 w-full items-center justify-center rounded-md bg-action px-4 font-semibold text-white" href="/today">
        继续训练
      </Link>
      <button
        aria-expanded={props.managementOpen}
        className="pressable mt-2 flex h-11 w-full items-center justify-center rounded-md border border-line bg-white px-4 font-semibold"
        onClick={props.onToggleManagement}
        type="button"
      >
        计划管理
      </button>
      {props.managementOpen ? (
        <div className="mt-3 grid gap-2 rounded-lg bg-field p-3">
          <button onClick={props.onAdjustPlan} type="button">调整计划</button>
          <button onClick={props.onRegenerate} type="button">按当前参数重新生成</button>
          <button onClick={props.onToggleProfile} type="button">
            {props.profileOpen ? "收起画像更新" : "更新体重、饮食与恢复"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
```

Secondary controls must share one quiet visual treatment and retain disabled states while `isBusy`.

- [ ] **Step 4: Run the component tests and verify GREEN**

Run:

```powershell
pnpm vitest run src/components/plan/current-program-overview.test.tsx
```

Expected: both tests pass with no React `act` warning from this file.

- [ ] **Step 5: Commit the overview**

```powershell
git add src/components/plan/current-program-overview.tsx src/components/plan/current-program-overview.test.tsx
git commit -m "feat: add current program overview"
```

### Task 3: Week and structure-cycle disclosure component

**Files:**
- Create: `src/components/plan/plan-schedule-outline.tsx`
- Create: `src/components/plan/plan-schedule-outline.test.tsx`
- Modify: `src/domain/plan-outline.ts`

**Interfaces:**
- Consumes:

```ts
export type PlanScheduleOutlineProps = {
  defaultCycleIndex: number | null;
  defaultWeek: number;
  mode: "all" | "collapsed" | "default";
  onModeChange: (mode: "all" | "collapsed" | "default") => void;
  outline: PlanOutline;
  renderWorkout: (workout: PlanOutlineWorkout, index: number) => React.ReactNode;
};
```

- Produces: a schedule disclosure UI with current week/current cycle defaults and no training-domain rendering logic.

- [ ] **Step 1: Write failing disclosure tests**

Assert against native `<details open>` state:

```tsx
it("opens only the selected week and selected structure cycle by default", () => {
  renderOutline({ defaultWeek: 2, defaultCycleIndex: 1, mode: "default" });
  const weeks = view.querySelectorAll("[data-plan-week]");
  expect(weeks[0]).not.toHaveAttribute("open");
  expect(weeks[1]).toHaveAttribute("open");
  const cycles = weeks[1].querySelectorAll("[data-plan-cycle]");
  expect(cycles[0]).toHaveAttribute("open");
  expect(cycles[1]).not.toHaveAttribute("open");
});

it("supports all and collapsed without changing the selected defaults", () => {
  renderOutline({ defaultWeek: 2, defaultCycleIndex: 1, mode: "all" });
  expect([...view.querySelectorAll("details")].every((node) => node.open)).toBe(true);
  renderOutline({ defaultWeek: 2, defaultCycleIndex: 1, mode: "collapsed" });
  expect([...view.querySelectorAll("details")].every((node) => !node.open)).toBe(true);
});
```

Use DOM property assertions if `toHaveAttribute` matchers are unavailable.

- [ ] **Step 2: Run the disclosure tests and verify RED**

Run:

```powershell
pnpm vitest run src/components/plan/plan-schedule-outline.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the disclosure shell**

Use stable `data-plan-week` and `data-plan-cycle` attributes and remount on mode changes so native `<details>` receives the new initial `open` state:

```tsx
<div className="space-y-3" key={mode}>
  {outline.map((week) => (
    <details
      data-plan-week={week.week}
      key={week.week}
      open={mode === "all" || (mode === "default" && week.week === defaultWeek)}
    >
      <summary>第 {week.week} 周 · 已完成 {week.completedTrainingDays}/{week.totalTrainingDays}</summary>
      {week.cycles.map((cycle) => (
        <details
          data-plan-cycle={cycle.index}
          key={cycle.index}
          open={
            mode === "all" ||
            (mode === "default" &&
              week.week === defaultWeek &&
              cycle.index === defaultCycleIndex)
          }
        >
          <summary>循环 {cycle.index} · {cycle.label}</summary>
          {cycle.workouts.map(renderWorkout)}
        </details>
      ))}
    </details>
  ))}
</div>
```

Buttons must include “当前进度”“全部展开”“全部收起”; “当前进度” restores `mode="default"`.

- [ ] **Step 4: Run the disclosure tests and verify GREEN**

Run:

```powershell
pnpm vitest run src/components/plan/plan-schedule-outline.test.tsx
```

Expected: all disclosure tests pass.

- [ ] **Step 5: Commit the disclosure component**

```powershell
git add src/domain/plan-outline.ts src/components/plan/plan-schedule-outline.tsx src/components/plan/plan-schedule-outline.test.tsx
git commit -m "feat: focus plan outline on current cycle"
```

### Task 4: Integrate the task-centered page without changing mutations

**Files:**
- Modify: `src/components/plan/program-manager.tsx`
- Modify: `src/components/plan/program-manager.test.tsx`

**Interfaces:**
- Consumes: `getDefaultPlanPosition`, `CurrentProgramOverview`, and `PlanScheduleOutline`.
- Produces: the existing exported `ProgramManager` API and unchanged plan mutation behavior.

- [ ] **Step 1: Extend failing integration tests**

Update the existing “keeps an existing plan in management view” test:

```tsx
expect(container.textContent).toContain("当前周期");
expect(container.textContent).toContain("计划管理");
expect(container.textContent).not.toContain("按当前参数重新生成");
expect(container.querySelectorAll("a[href='/today']")).toHaveLength(1);

await act(async () => clickButton(container!, "计划管理"));
expect(container.textContent).toContain("按当前参数重新生成");
expect(container.textContent).toContain("更新体重、饮食与恢复");
expect(container.textContent).not.toContain("生成 4 周训练计划");
```

Extend the mock active program with at least two weeks and two same-name cycle boundaries so the test can assert:

```ts
expect(container.querySelector("[data-plan-week='1']")?.hasAttribute("open")).toBe(true);
expect(container.querySelector("[data-plan-cycle='1']")?.hasAttribute("open")).toBe(true);
```

Also verify selecting “全部收起” closes all week and cycle details.

- [ ] **Step 2: Run integration tests and verify RED**

Run:

```powershell
pnpm vitest run src/components/plan/program-manager.test.tsx
```

Expected: FAIL because management controls remain visible and current-cycle disclosure is not integrated.

- [ ] **Step 3: Integrate components**

In `ProgramManager`:

```ts
const defaultPosition = useMemo(
  () => getDefaultPlanPosition(planOutline, program?.start_date ?? "", new Date()),
  [planOutline, program?.start_date]
);
const [managementOpen, setManagementOpen] = useState(false);
```

Derive `currentCycleLabel` from `defaultPosition`, and derive the next workout summary from the existing `nextPlanWorkoutId`, `getPlanWorkoutState`, and `getWorkoutMeta`. Pass existing callbacks without moving their mutation logic:

- `setShowPlanSetup(true)`
- `openRegenerationDialog`
- `setShowProfileContext`

Replace the existing four-button current-cycle card with `CurrentProgramOverview`. Replace only the week/cycle disclosure shell with `PlanScheduleOutline`; preserve the existing workout article rendering and `firstScheduleItemRef`.

When the user enters “调整计划”, close the management disclosure. When regeneration completes and current program data reloads, reset outline mode to `"default"`.

- [ ] **Step 4: Run focused plan tests**

Run:

```powershell
pnpm vitest run src/domain/plan-outline.test.ts src/components/plan/current-program-overview.test.tsx src/components/plan/plan-schedule-outline.test.tsx src/components/plan/program-manager.test.tsx src/components/plan/program-manager.plan-setup.test.tsx src/components/plan/program-regeneration-dialog.test.tsx
```

Expected: all focused plan tests pass.

- [ ] **Step 5: Run the full release gate**

Run:

```powershell
pnpm release:check
```

Expected:

- TypeScript exits `0`;
- production build exits `0`;
- local 14-route smoke reports all routes and `/api/health` as OK.

- [ ] **Step 6: Check mobile layout**

At 375px, 390px, and 430px:

- no horizontal scrollbar;
- current program name and next workout do not collide with controls;
- only “继续训练” uses the filled green primary style;
- management controls remain at least 44px high;
- decimal prescriptions such as `22.5kg` remain fully visible;
- bottom navigation does not cover the final schedule card.

- [ ] **Step 7: Commit the integration**

```powershell
git add src/components/plan/program-manager.tsx src/components/plan/program-manager.test.tsx
git commit -m "feat: streamline existing plan management"
```

## Independent Test and Release Gate

The implementation window must provide the final fixed commit and a clean `git status`. The independent test window must verify:

1. existing users see current-cycle management, not first-plan generation;
2. one primary training CTA is visible before expanding management;
3. management controls appear only after explicit disclosure;
4. current week and current structure cycle are open by default;
5. all/default/collapsed controls work;
6. regeneration confirmation and profile update behavior are unchanged;
7. Coach recommendations remain before plan detail;
8. no mobile overflow at 375px, 390px, or 430px;
9. all automated tests and release checks pass.

Only after an explicit “验证通过” may the implementation window deploy the fixed commit. The deployment report must include commit, deployment ID, deployment URL, production URL, and the 14-route production smoke result.
