# On-Demand Plan Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove mandatory training-profile onboarding and collect plan inputs only when a user creates or regenerates a periodized plan.

**Architecture:** Existing `athlete_profiles` and `lift_profiles` remain the persistence model, but product copy calls them plan parameters and recent main-lift working sets. Authentication enters the dashboard by default; `ProgramManager` owns collecting, validating, persisting and consuming plan parameters, while `PrGoalManager` owns the narrow one-lift data-capture fallback.

**Tech Stack:** Next.js 14 App Router, React, TypeScript, Supabase, Vitest, Testing Library, Tailwind CSS.

## Global Constraints

- Do not delete, truncate, migrate, or invalidate existing `athlete_profiles`, `lift_profiles`, programs, PR goals, workouts, or logs.
- New users must be able to record standalone workouts and use history, progress, exercise library, settings, and PR without any plan parameter record.
- The only plan-creation gate is the inline plan parameter form: weekly training days, available days, goal, session duration, and one valid recent working set.
- Keep kg as the only weight unit and retain current RLS and `auth.uid()` ownership behavior.
- `/onboarding` becomes a compatibility redirect to `/plan`; it must never block product entry or render the old form.
- Do not add database tables. Retain existing schema unless a confirmed existing database constraint prevents the inline saving path.
- Preserve legitimate `next` destinations in magic links and keep safe internal-path validation unchanged.
- Do not deploy or merge another task's work. Commit only focused changes and report migration needs if discovered.

---

## File Structure

- Modify `src/components/auth/email-login-form.tsx`: change default post-login target from `/onboarding` to `/`.
- Modify/create `src/lib/supabase/magic-link.test.ts`: protect default and explicit-next callback behavior.
- Modify `src/app/onboarding/page.tsx`: redirect legacy users to `/plan` instead of mounting `OnboardingForm`.
- Modify `scripts/smoke-check.mjs`: remove onboarding's old required markup and assert its redirect behavior.
- Modify `src/app/plan/page.tsx`: remove numbered onboarding copy and describe inline plan setup.
- Modify `src/components/plan/program-manager.tsx`: add a typed plan-parameter form, load existing values, save them, and generate in one flow.
- Create `src/domain/plan-setup.ts` and `src/domain/plan-setup.test.ts`: pure validation and conversion from form input to profile/lift upserts.
- Modify `src/components/pr/pr-goal-manager.tsx`: add a local main-lift working-set capture flow rather than linking to onboarding.
- Modify the corresponding existing PR component tests or create `src/components/pr/pr-goal-manager.test.tsx`.
- Modify `src/components/dashboard/home-dashboard.tsx`, `src/components/settings/settings-panel.tsx`, `src/components/diagnostics/supabase-diagnostics.tsx`, `src/components/today/today-workout.tsx`, `src/app/privacy/page.tsx`: remove user-facing onboarding/profile blockers and rename wording.

### Task 1: Remove onboarding as the authentication and compatibility destination

**Files:**
- Modify: `src/components/auth/email-login-form.tsx`
- Modify: `src/lib/supabase/magic-link.test.ts`
- Modify: `src/app/onboarding/page.tsx`
- Modify: `scripts/smoke-check.mjs`

**Interfaces:**
- Existing `getSafeNextFromMagicLink(url, fallback)` remains unchanged.
- Default fallback passed by `EmailLoginForm` becomes `"/"`.
- `OnboardingPage` produces a server redirect to `"/plan"`.

- [ ] **Step 1: Write failing login/default-path tests**

```ts
it("uses the dashboard when the login URL has no next parameter", () => {
  expect(getLoginNext(new URLSearchParams())).toBe("/");
});

it("keeps a safe explicit next path", () => {
  expect(getLoginNext(new URLSearchParams("next=%2Fsingle-workout"))).toBe("/single-workout");
});
```

Extract the small `getLoginNext(searchParams)` helper from `EmailLoginForm` into the magic-link module if the component cannot be tested without a browser. Its implementation must be `searchParams.get("next") || "/"`; existing safe-path validation remains responsible for pasted links and callbacks.

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm test -- src/lib/supabase/magic-link.test.ts`

Expected: FAIL because the current fallback is `/onboarding` or no testable helper exists.

- [ ] **Step 3: Implement redirect behavior**

```tsx
// src/app/onboarding/page.tsx
import { redirect } from "next/navigation";

export default function OnboardingPage() {
  redirect("/plan");
}
```

Change both uses of `"/onboarding"` in `EmailLoginForm` to the helper/default `"/"`. In `scripts/smoke-check.mjs`, replace the old `/onboarding` HTML assertion for `创建训练画像` with a redirect check that accepts the final `/plan` response.

- [ ] **Step 4: Run focused checks and commit**

Run: `pnpm test -- src/lib/supabase/magic-link.test.ts && pnpm lint`

Expected: PASS.

```bash
git add src/components/auth/email-login-form.tsx src/lib/supabase/magic-link.test.ts src/app/onboarding/page.tsx scripts/smoke-check.mjs
git commit -m "feat: remove onboarding login gate"
```

### Task 2: Define a reusable plan-parameter validation boundary

**Files:**
- Create: `src/domain/plan-setup.ts`
- Create: `src/domain/plan-setup.test.ts`

**Interfaces:**
- Produces `PlanSetupInput`, `ValidatedPlanSetup`, and `validatePlanSetup(input)`.
- `PlanSetupInput` is `{ experienceLevel: "beginner" | "novice" | "intermediate"; goal: "strength" | "hypertrophy" | "general_fitness"; trainingDaysPerWeek: number; availableWeekdays: number[]; sessionDurationMinutes: number; injuryNotes: string; lifts: Array<{ exerciseId: string; weightKg: string; reps: string }> }`.
- `validatePlanSetup` returns `{ ok: true; value: ValidatedPlanSetup } | { ok: false; fieldErrors: Record<string, string> }`.

- [ ] **Step 1: Write failing validation tests**

```ts
it("requires a valid schedule and one positive main-lift working set", () => {
  expect(validatePlanSetup(baseInput({ availableWeekdays: [], lifts: [] }))).toEqual({
    ok: false,
    fieldErrors: { availableWeekdays: "请选择可训练日", lifts: "至少录入一个主项最近工作组" }
  });
});

it("normalizes kg/reps into a safe lift profile payload", () => {
  const result = validatePlanSetup(baseInput({ lifts: [{ exerciseId: "bench", weightKg: "80", reps: "5" }] }));
  expect(result).toMatchObject({ ok: true, value: { lifts: [{ exerciseId: "bench", workingWeight: 80, reps: 5 }] } });
});
```

- [ ] **Step 2: Run the domain test and confirm it fails**

Run: `pnpm test -- src/domain/plan-setup.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement complete validation**

```ts
export function validatePlanSetup(input: PlanSetupInput): PlanSetupValidationResult {
  const fieldErrors: Record<string, string> = {};
  const weekdays = [...new Set(input.availableWeekdays)].filter((day) => Number.isInteger(day) && day >= 0 && day <= 6).sort();
  const lifts = input.lifts.flatMap((lift) => {
    const workingWeight = Number(lift.weightKg);
    const reps = Number(lift.reps);
    return lift.exerciseId && workingWeight > 0 && workingWeight <= 1000 && Number.isInteger(reps) && reps >= 1 && reps <= 30
      ? [{ exerciseId: lift.exerciseId, workingWeight, reps }]
      : [];
  });
  if (input.trainingDaysPerWeek < 1 || input.trainingDaysPerWeek > 7) fieldErrors.trainingDaysPerWeek = "每周训练天数应为 1-7 天";
  if (weekdays.length !== input.trainingDaysPerWeek) fieldErrors.availableWeekdays = "可训练日数量需与每周训练天数一致";
  if (lifts.length === 0) fieldErrors.lifts = "至少录入一个主项最近工作组";
  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true, value: { ...input, availableWeekdays: weekdays, lifts } };
}
```

Trim injury notes to 500 characters, restrict session duration to the existing option values, and preserve only valid lifts. Do not invent a working weight for an empty lift.

- [ ] **Step 4: Run tests and commit**

Run: `pnpm test -- src/domain/plan-setup.test.ts && pnpm lint`

Expected: PASS.

```bash
git add src/domain/plan-setup.ts src/domain/plan-setup.test.ts
git commit -m "feat: validate inline plan setup"
```

### Task 3: Collect and save plan parameters inside the plan page

**Files:**
- Modify: `src/components/plan/program-manager.tsx`
- Modify: `src/app/plan/page.tsx`
- Create: `src/components/plan/program-manager.plan-setup.test.tsx`

**Interfaces:**
- Consumes `validatePlanSetup` from Task 2.
- `ProgramManager` exposes an inline `计划参数` section whenever no active plan exists and before confirming a regeneration.
- It upserts the existing `athlete_profiles` and `lift_profiles` rows, then calls the existing program generation path using the resulting data.

- [ ] **Step 1: Write failing component tests**

```tsx
it("lets an account with no athlete profile create a plan without visiting onboarding", async () => {
  mockSupabaseWithoutProfile();
  render(<ProgramManager />);
  expect(await screen.findByRole("heading", { name: "创建第一个计划" })).toBeVisible();
  await completeRequiredPlanSetup();
  await userEvent.click(screen.getByRole("button", { name: "生成 4 周计划" }));
  expect(mockAthleteProfileUpsert).toHaveBeenCalledOnce();
  expect(mockLiftProfilesUpsert).toHaveBeenCalledOnce();
  expect(mockProgramInsert).toHaveBeenCalledOnce();
});

it("keeps user input and shows field errors when no lift is valid", async () => {
  render(<ProgramManager />);
  await userEvent.click(await screen.findByRole("button", { name: "生成 4 周计划" }));
  expect(screen.getByText("至少录入一个主项最近工作组")).toBeVisible();
  expect(screen.getByLabelText("深蹲重量 kg")).toHaveValue("80");
});
```

- [ ] **Step 2: Run component tests and confirm they fail**

Run: `pnpm test -- src/components/plan/program-manager.plan-setup.test.tsx`

Expected: FAIL because current generation redirects users to `/onboarding` or requires a pre-existing profile.

- [ ] **Step 3: Load defaults and render one accessible form**

Add state for `experienceLevel`, `goal`, `trainingDaysPerWeek`, `availableWeekdays`, `sessionDurationMinutes`, `injuryNotes`, and main-lift weight/reps. During `loadCurrentProgram`, query the current user's profile and lift rows in parallel with program data. Use existing stored values when present; otherwise initialize to beginner, strength, 3 days, Monday/Wednesday/Friday, 60 minutes and empty lifts. Render the form with heading `创建第一个计划` when no active program and a `调整计划参数` action in the regeneration flow.

- [ ] **Step 4: Persist then generate atomically at the UI level**

```ts
const parsed = validatePlanSetup(planSetupInput);
if (!parsed.ok) { setPlanSetupErrors(parsed.fieldErrors); return; }

const { error: profileError } = await supabase.from("athlete_profiles").upsert({
  user_id: userId,
  experience_level: parsed.value.experienceLevel,
  goal: parsed.value.goal,
  training_days_per_week: parsed.value.trainingDaysPerWeek,
  available_weekdays: parsed.value.availableWeekdays,
  session_duration_minutes: parsed.value.sessionDurationMinutes,
  injury_notes: parsed.value.injuryNotes || null
});
if (profileError) { setMessage(profileError.message); return; }
```

After the profile upsert, calculate existing `estimated_1rm`/`training_max` using the application's established strength helper for each valid lift and upsert the rows into `lift_profiles`. Only then reuse the current program-building and program-insert path. On any error, keep all state in the form and show the returned safe message. Do not navigate to `/onboarding`.

- [ ] **Step 5: Update page copy and verify**

Replace `第 2 步`, `基于你的训练画像` and equivalent copy in `src/app/plan/page.tsx` with `训练计划` and `填写本次计划需要的训练安排与主项最近工作组，即可生成 4 周周期。`.

Run: `pnpm test -- src/components/plan/program-manager.plan-setup.test.tsx src/domain/plan-setup.test.ts && pnpm lint`

Expected: PASS.

```bash
git add src/components/plan/program-manager.tsx src/components/plan/program-manager.plan-setup.test.tsx src/app/plan/page.tsx src/domain/plan-setup.ts
git commit -m "feat: collect plan inputs on demand"
```

### Task 4: Keep PR creation self-contained when a lift has no profile

**Files:**
- Modify: `src/components/pr/pr-goal-manager.tsx`
- Create: `src/components/pr/pr-goal-manager.test.tsx`

**Interfaces:**
- The missing-lift state displays an accessible inline form with `重量 kg` and `次数` for only the selected PR exercise.
- On success it upserts `lift_profiles` for the current authenticated user, refreshes the local selected profile, and permits existing PR goal creation.

- [ ] **Step 1: Write failing PR tests**

```tsx
it("captures a missing target lift in place instead of linking to onboarding", async () => {
  render(<PrGoalManager liftProfiles={[]} />);
  await userEvent.selectOptions(screen.getByLabelText("目标动作"), "bench-id");
  expect(screen.queryByRole("link", { name: /训练画像/i })).not.toBeInTheDocument();
  await userEvent.type(screen.getByLabelText("卧推重量 kg"), "80");
  await userEvent.type(screen.getByLabelText("卧推次数"), "5");
  await userEvent.click(screen.getByRole("button", { name: "保存最近工作组" }));
  expect(mockLiftProfileUpsert).toHaveBeenCalledWith(expect.objectContaining({ exercise_id: "bench-id" }));
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm test -- src/components/pr/pr-goal-manager.test.tsx`

Expected: FAIL because current missing-lift copy links to onboarding.

- [ ] **Step 3: Implement focused lift capture**

For the selected exercise with no profile, render two number inputs, use kg and reps bounds from Task 2, calculate `estimated_1rm` and `training_max` via the existing strength domain function, and upsert one row with `user_id` obtained from the current Supabase session. Display `保存最近工作组`; on failure retain both values and show the safe error. After success, update local state and restore the normal PR form. Do not require weekly frequency, available days, or other lifts.

- [ ] **Step 4: Verify and commit**

Run: `pnpm test -- src/components/pr/pr-goal-manager.test.tsx && pnpm lint`

Expected: PASS.

```bash
git add src/components/pr/pr-goal-manager.tsx src/components/pr/pr-goal-manager.test.tsx
git commit -m "feat: capture missing PR lift in place"
```

### Task 5: Remove profile wording and onboarding blockers across the product

**Files:**
- Modify: `src/components/dashboard/home-dashboard.tsx`
- Modify: `src/components/settings/settings-panel.tsx`
- Modify: `src/components/diagnostics/supabase-diagnostics.tsx`
- Modify: `src/components/today/today-workout.tsx`
- Modify: `src/app/privacy/page.tsx`
- Create: `src/components/dashboard/home-dashboard.test.tsx`
- Modify: `scripts/smoke-check.mjs`

**Interfaces:**
- User-visible primary actions direct to `/plan` with labels `创建训练计划`, `调整计划参数`, or `查看计划` according to current program state.
- No product screen renders `创建训练画像`, `修改训练画像`, or `请先创建训练画像`.

- [ ] **Step 1: Write a copy/route regression test**

```ts
it("does not render the retired onboarding call to action", () => {
  render(<HomeDashboard {...emptyDashboardProps} />);
  expect(screen.queryByText(/训练画像/)).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "创建训练计划" })).toHaveAttribute("href", "/plan");
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm test -- src/components/dashboard`

Expected: FAIL because the dashboard still links to `/onboarding`.

- [ ] **Step 3: Apply the exact copy and destination changes**

Replace dashboard/settings/diagnostics links to `/onboarding` with `/plan`. Replace `修改训练画像` with `调整计划参数`; replace training-image mentions in today empty states with `先创建训练计划`; update privacy copy from `训练画像` to `计划参数和主项最近工作组`. Do not rename database columns or analytics event names in this task.

- [ ] **Step 4: Verify no obsolete product dependency remains**

Run: `rg -n "href=\"/onboarding\"|请先创建训练画像|创建训练画像|修改训练画像" src scripts`

Expected: no matches except compatibility-route tests that explicitly assert `/onboarding` redirects to `/plan`.

Run: `pnpm test && pnpm lint && pnpm typecheck && pnpm build`

Expected: all commands exit 0.

- [ ] **Step 5: Browser smoke test and commit**

1. Sign in with a test account with no `athlete_profiles`/`lift_profiles` records and confirm the default destination is `/`.
2. Create and complete a standalone workout without visiting `/plan`.
3. Create a plan from `/plan` after entering only required parameters and one lift.
4. Open `/pr`, choose a missing lift, save weight/reps in place and create a PR goal.
5. Open `/onboarding` and verify the browser ends at `/plan`.
6. Sign in as an existing user and regenerate a plan with their saved values prefilled.

```bash
git add src/components/dashboard src/components/settings src/components/diagnostics src/components/today src/app/privacy src/app/plan scripts
git commit -m "refactor: replace training profile entry points"
git status --short --branch
```

Expected: clean feature branch ready for review; report any Supabase migration requirement rather than applying it unreviewed.
