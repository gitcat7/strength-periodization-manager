# 动感训练界面优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Give the mobile-first strength-training app clearer training-state hierarchy, a more energetic visual rhythm and restrained feedback motion without changing any business behavior.

**Architecture:** Add a small, testable presentation domain for semantic workout states, then apply it through existing Tailwind components rather than introducing a new UI framework. The core execution screens are refined first, followed by dashboard/supporting screens; visual acceptance is browser-based and treats existing workflows as regression constraints.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS, Lucide, Vitest, existing in-app browser checks.

## Global Constraints

- Preserve the current routes, database schema, training algorithms, existing copy meaning and five-item bottom navigation.
- The page style is energetic and lightly motivational, not gamified; do not add badges, ranks, streaks, avatars, media or illustrations.
- Keep green as primary action/completed state; use orange for intensity/PR, blue-gray for recovery, red only for errors.
- Do not use large gradients, gradient orbs, blur decorations, oversized hero areas or nested floating cards.
- Cards stay compact with an 8px-or-less radius unless an existing modal/sheet pattern needs its current radius.
- Use Lucide icons for all new symbolic controls; all icon-only controls need an accessible label and tooltip/title.
- Respect prefers-reduced-motion; only use 120-180ms state transitions and never use looping or layout-shifting animation.
- Every changed page must work at 320x568, 390x844, 768x1024 and 1440x900 without overlap or horizontal overflow.
- Start from the branch that already contains the approved rest-day/regeneration implementation; do not overwrite concurrent changes to program-manager.tsx or today-workout.tsx.

---

## File Structure

- src/domain/workout-presentation.ts: pure mapping from schedule/workout state to visual semantics.
- src/domain/workout-presentation.test.ts: test coverage for training, rest, completed, intensity and error presentation.
- src/app/globals.css: semantic CSS tokens, focus ring and reduced-motion rules.
- src/components/dashboard/home-dashboard.tsx: next action and compact status summary hierarchy.
- src/components/today/today-workout.tsx: execution header, set-completion, progress and rest-timer hierarchy.
- src/components/today/rest-day-card.tsx: recovery presentation aligned with today training surface.
- src/components/plan/program-manager.tsx: schedule differentiation and regeneration confirmation state polish.
- src/components/progress/progress-dashboard.tsx and src/components/pr/pr-goal-manager.tsx: metric hierarchy and intensity/PR treatment.
- src/components/history/training-history.tsx and src/components/settings/settings-panel.tsx: compact scan-friendly secondary surfaces.
- src/components/navigation/bottom-nav.tsx: selected-state and touch feedback refinement.
- docs/verification/2026-07-15-motivational-ui-evidence.md: viewport screenshots, workflow and console evidence.

### Task 1: Establish semantic visual states and motion guardrails

**Files:**
- Create: src/domain/workout-presentation.ts
- Create: src/domain/workout-presentation.test.ts
- Modify: src/app/globals.css

**Interfaces:**
~~~ts
export type WorkoutPresentationTone =
  | 'completed'
  | 'error'
  | 'intensity'
  | 'neutral'
  | 'recovery'
  | 'upcoming';

export function getWorkoutPresentation(input: {
  dayType?: 'rest' | 'training';
  status: 'completed' | 'draft' | 'scheduled' | 'skipped';
  variant?: 'pr' | 'standard';
}): {
  accentClass: string;
  icon: 'check' | 'dumbbell' | 'moon' | 'target';
  label: string;
  tone: WorkoutPresentationTone;
};
~~~

- [ ] **Step 1: Write the failing presentation tests**

~~~ts
it('uses recovery semantics for a scheduled rest day', () => {
  expect(getWorkoutPresentation({ dayType: 'rest', status: 'scheduled' })).toEqual({
    accentClass: 'ui-recovery',
    icon: 'moon',
    label: '休息/恢复日',
    tone: 'recovery'
  });
});

it('uses intensity semantics for an active PR target', () => {
  expect(getWorkoutPresentation({ status: 'scheduled', variant: 'pr' })).toMatchObject({
    icon: 'target',
    tone: 'intensity'
  });
});
~~~

Add cases for completed training, scheduled training, skipped and draft states.

- [ ] **Step 2: Run test to verify RED**

Run: pnpm vitest run src/domain/workout-presentation.test.ts

Expected: FAIL because the presentation module does not exist.

- [ ] **Step 3: Implement the mapping and global semantic tokens**

~~~ts
export function getWorkoutPresentation(input: {
  dayType?: 'rest' | 'training';
  status: 'completed' | 'draft' | 'scheduled' | 'skipped';
  variant?: 'pr' | 'standard';
}) {
  if (input.status === 'completed') {
    return { accentClass: 'ui-completed', icon: 'check', label: '已完成', tone: 'completed' as const };
  }
  if (input.dayType === 'rest') {
    return { accentClass: 'ui-recovery', icon: 'moon', label: '休息/恢复日', tone: 'recovery' as const };
  }
  if (input.variant === 'pr') {
    return { accentClass: 'ui-intensity', icon: 'target', label: 'PR 目标', tone: 'intensity' as const };
  }
  return { accentClass: 'ui-upcoming', icon: 'dumbbell', label: '待执行', tone: 'upcoming' as const };
}
~~~

In globals.css define semantic color variables/classes, a visible focus ring, short transition utilities and:

~~~css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
  }
}
~~~

Do not change typography families or add runtime dependencies.

- [ ] **Step 4: Verify GREEN**

Run:
~~~powershell
pnpm vitest run src/domain/workout-presentation.test.ts
pnpm typecheck
~~~

Expected: PASS.

- [ ] **Step 5: Commit**

~~~powershell
git add src/domain/workout-presentation.ts src/domain/workout-presentation.test.ts src/app/globals.css
git commit -m "feat: add semantic workout visual states"
~~~

### Task 2: Refine the home, today and rest-day execution surfaces

**Files:**
- Modify: src/components/dashboard/home-dashboard.tsx
- Modify: src/components/today/today-workout.tsx
- Modify: src/components/today/rest-day-card.tsx
- Modify: src/components/navigation/bottom-nav.tsx

**Interfaces:**
- Consume getWorkoutPresentation() from Task 1 for completed/recovery/upcoming styling.
- Keep existing TodayWorkout props, queries, set-log actions, rest timer behavior and completion flow unchanged.

- [ ] **Step 1: Write failing state-usage tests**

Create or extend component-adjacent pure tests that assert:
~~~ts
it('keeps the next action ahead of secondary metrics', () => {
  const view = buildTodayHeaderView({ completedSets: 3, totalSets: 16, workoutName: '推 A · 强度' });
  expect(view.primaryActionLabel).toBe('继续完成训练');
  expect(view.progressLabel).toBe('3/16 组');
});
~~~

Define buildTodayHeaderView in src/domain/workout-presentation.ts if no existing pure projection can be reused. Add a recovery case whose primary action is 完成休息 and whose secondary action is 查看下一节训练.

- [ ] **Step 2: Run test to verify RED**

Run: pnpm vitest run src/domain/workout-presentation.test.ts

Expected: FAIL because the header view projection does not exist.

- [ ] **Step 3: Implement hierarchy and feedback polish**

Apply these changes without changing event handlers:
- Home: one prominent next-action band with semantic icon, action label and a compact secondary metric row; reduce equal-weight metric cards.
- Today: make date, workout name, prescription/progress and primary save/complete action a single coherent execution header. Use completion tone per completed set and preserve stable grid dimensions.
- Rest card: use recovery blue-gray, Moon icon and a single clear 完成休息 action; keep it quieter than a training day.
- Bottom navigation: use a compact selected indicator, stronger icon/text contrast and 120-180ms press feedback; keep five equal columns and current routes.
- Buttons use active:scale-[0.98] only where reduced-motion CSS neutralizes it; loading state preserves button dimensions.
- Remove redundant borders where a background layer already conveys grouping; do not place cards inside cards.

- [ ] **Step 4: Verify the changed workflow**

Run:
~~~powershell
pnpm vitest run src/domain/workout-presentation.test.ts src/components/today/rest-day-state.test.ts
pnpm typecheck
pnpm build
~~~

Expected: PASS.

- [ ] **Step 5: Commit**

~~~powershell
git add src/components/dashboard/home-dashboard.tsx src/components/today/today-workout.tsx src/components/today/rest-day-card.tsx src/components/navigation/bottom-nav.tsx src/domain/workout-presentation.ts src/domain/workout-presentation.test.ts
git commit -m "feat: refine training execution visual hierarchy"
~~~

### Task 3: Refine plan, progress, PR, history and settings surfaces

**Files:**
- Modify: src/components/plan/program-manager.tsx
- Modify: src/components/progress/progress-dashboard.tsx
- Modify: src/components/pr/pr-goal-manager.tsx
- Modify: src/components/history/training-history.tsx
- Modify: src/components/settings/settings-panel.tsx

**Interfaces:**
- Consume getWorkoutPresentation() for schedule/PR/recovery tones.
- Preserve every existing Supabase query, mutation, form field, action copy and route.

- [ ] **Step 1: Write failing display-model tests**

Add pure display projections in src/domain/workout-presentation.ts:

~~~ts
it('makes upcoming strength and completed recovery visually distinct', () => {
  const training = getWorkoutPresentation({ dayType: 'training', status: 'scheduled' });
  const rest = getWorkoutPresentation({ dayType: 'rest', status: 'completed' });

  expect(training.tone).toBe('upcoming');
  expect(rest.tone).toBe('completed');
  expect(training.accentClass).not.toBe(rest.accentClass);
});
~~~

Add a PR projection assertion that selects intensity orange rather than completed green.

- [ ] **Step 2: Run test to verify RED**

Run: pnpm vitest run src/domain/workout-presentation.test.ts

Expected: FAIL until the new variants are added.

- [ ] **Step 3: Implement page-specific polish**

- Plan: render training, recovery, completed and upcoming schedule rows with semantic accent bars/icons, dense date/status line and clearer primary action. Make the regeneration dialog/loading surface visually consistent with the execution header.
- Progress: elevate the current trend and concise insight; keep charts legible, use orange only for meaningful strength/PR emphasis and blue-gray for recovery/deload context.
- PR: give active target, readiness and attempt phases a clear progression hierarchy without score gamification.
- History: tighten date/status scanning and render completed recovery as a lower-emphasis non-editable row.
- Settings: regroup existing controls into Account, Data and Experience sections using section headings, not nested cards.
- Ensure all status colors still have readable text contrast and never convey status by color alone.

- [ ] **Step 4: Verify GREEN**

Run:
~~~powershell
pnpm vitest run src/domain/workout-presentation.test.ts
pnpm typecheck
pnpm build
~~~

Expected: PASS.

- [ ] **Step 5: Commit**

~~~powershell
git add src/components/plan/program-manager.tsx src/components/progress/progress-dashboard.tsx src/components/pr/pr-goal-manager.tsx src/components/history/training-history.tsx src/components/settings/settings-panel.tsx src/domain/workout-presentation.ts src/domain/workout-presentation.test.ts
git commit -m "feat: polish training dashboard surfaces"
~~~

### Task 4: Perform responsive visual and workflow acceptance

**Files:**
- Create: docs/verification/2026-07-15-motivational-ui-evidence.md
- Modify: docs/11_mvp_release_checklist.md only if a missing UI acceptance item is discovered.

**Interfaces:**
- Produce screenshot paths, viewport results, console status and workflow regression evidence without recording secrets or personal data.

- [ ] **Step 1: Start the verified local application**

Run:
~~~powershell
pnpm test
pnpm typecheck
pnpm build
pnpm dev
~~~

Expected: tests, typecheck and production build pass before browser review.

- [ ] **Step 2: Capture four viewport checks**

At 320x568, 390x844, 768x1024 and 1440x900 inspect /, /today, /plan, /progress, /pr, /history and /settings. For each viewport verify:
- first action is visible without scrolling when the page has a current action;
- no horizontal overflow, overlapping text, clipped bottom navigation or shifted input controls;
- every button has legible text/icon contrast;
- reduced-motion emulation leaves no looping/large movement;
- console has no uncaught error and network has no failed required asset.

- [ ] **Step 3: Exercise non-visual regression flows**

Verify:
~~~text
today: edit a set -> save -> complete
rest: complete a rest day once
plan: open regeneration -> cancel -> no mutation
plan: open regeneration -> confirm -> existing safeguards remain active
pr: create/view existing target
settings: export data and clear local cache controls remain reachable
~~~

Do not run destructive regeneration against production unless using an approved test account and recording sanitized evidence.

- [ ] **Step 4: Record evidence and final gate**

Write exact UTC timestamps, route, viewport, screenshot path, result and any resolved defect to the evidence file. Then run:
~~~powershell
pnpm release:check
git status --short
~~~

Expected: release check passes and only planned evidence changes remain.

- [ ] **Step 5: Commit**

~~~powershell
git add docs/verification/2026-07-15-motivational-ui-evidence.md docs/11_mvp_release_checklist.md
git commit -m "docs: verify motivational UI refinement"
~~~
