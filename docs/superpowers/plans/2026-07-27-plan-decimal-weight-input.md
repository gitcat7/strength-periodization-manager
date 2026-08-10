# PLAN-03 Decimal Weight Input Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure main-lift weight inputs display and preserve decimal values such as `22.5` and `102.5` on 320px mobile screens.

**Architecture:** Keep the existing `PlanSetupForm` data flow and numeric validation intact. Adjust only its CSS grid width and input text alignment, protected by a component test that supplies a decimal weight and asserts the input keeps the exact string.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Vitest.

## Global Constraints

- kg only; retain `step="0.5"`, `inputMode="decimal"`, and existing validation.
- The mobile form must retain a readable exercise name, weight input, and reps input at 320px.
- No database, plan-generation, or training-prescription behavior changes.

---

### Task 1: Preserve decimal working-weight rendering

**Files:**
- Modify: `src/components/plan/program-manager.plan-setup.test.tsx`
- Modify: `src/components/plan/program-manager.tsx:1591-1606`

**Interfaces:**
- Consumes `PlanSetupInput.lifts[].weightKg: string`.
- Produces the same exact decimal string through `input[aria-label="<动作>重量 kg"]`.

- [ ] **Step 1: Write the failing test**

```tsx
it("keeps decimal working weights readable in the compact mobile row", () => {
  renderPlanSetup({ lifts: [{ exerciseId: "bench", weightKg: "22.5", reps: "5" }] });
  const weight = container.querySelector('input[aria-label="卧推重量 kg"]')!;
  expect(weight).toHaveProperty("value", "22.5");
  expect(weight.className).toContain("text-right");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/components/plan/program-manager.plan-setup.test.tsx`

Expected: FAIL because the weight field is not right-aligned for the compact mobile row.

- [ ] **Step 3: Write minimal implementation**

```tsx
<div className="grid grid-cols-[minmax(0,1fr)_96px_64px] items-end gap-2" key={exercise.id}>
  <input
    className="h-10 w-full rounded-md border border-line bg-white px-2 text-right text-sm tabular-nums"
    step="0.5"
    type="number"
    value={lift.weightKg}
  />
</div>
```

- [ ] **Step 4: Run focused tests and typecheck**

Run: `pnpm vitest run src/components/plan/program-manager.plan-setup.test.tsx && pnpm typecheck`

Expected: PASS, and the decimal assertion preserves `22.5`.

- [ ] **Step 5: Commit**

```bash
git add src/components/plan/program-manager.tsx src/components/plan/program-manager.plan-setup.test.tsx
git commit -m "fix: keep decimal working weights visible"
```

### Task 2: Release verification

**Files:**
- No source files beyond Task 1.

**Interfaces:**
- Consumes the tested input layout.
- Produces a verified production release.

- [ ] **Step 1: Run release gate**

Run: `pnpm release:check`

Expected: typecheck, production build, and local route smoke checks all pass.

- [ ] **Step 2: Publish and smoke-test**

```bash
git push origin codex/p0-remediation
pnpm dlx vercel deploy --prod --yes
$env:BASE_URL='https://strength-periodization-manager.vercel.app'; $env:SMOKE_TRANSPORT='powershell'; pnpm smoke
```

Expected: deployment is READY and the production smoke script reports every route as `ok`.

