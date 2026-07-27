# 存量用户画像数据入口 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable existing-plan users to update body, nutrition, and recovery context without regenerating their training plan.

**Architecture:** Extract the profile-context inputs into a reusable form section within the plan component. A dedicated save path updates only `usr_athlete_profiles`; plan regeneration continues to use the full setup save path.

**Tech Stack:** Next.js, React, TypeScript, Supabase browser client, Vitest.

## Global Constraints

- Mobile-first Chinese UI; kg only.
- Do not change active programs, workouts, or workout logs when saving profile context.
- Reuse `validatePlanSetup` validation semantics.
- Keep target body-weight conversion based on selected plan weeks.

---

### Task 1: Add a regression test for the standalone context entry

**Files:**
- Modify: `src/components/plan/program-manager.test.tsx`
- Test: `src/components/plan/program-manager.test.tsx`

- [ ] **Step 1: Write the failing test**

Render a manager state with an active program and assert it exposes text `更新体重、饮食与恢复` without requiring `调整周期并重新生成`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/components/plan/program-manager.test.tsx`

Expected: FAIL because the standalone action does not exist.

- [ ] **Step 3: Commit**

Defer commit until Task 2 completes.

### Task 2: Save profile context without rebuilding the program

**Files:**
- Modify: `src/components/plan/program-manager.tsx`
- Modify: `src/components/plan/program-manager.plan-setup.test.tsx`

**Interfaces:**
- Consumes: `PlanSetupInput`, `validatePlanSetup`, `DB_TABLE.athleteProfiles`.
- Produces: `saveProfileContext(): Promise<void>` and an active-plan context entry.

- [ ] **Step 1: Write the failing form test**

Assert the standalone form has `当前体重 kg`, `目标体重 kg`, and a `保存画像数据` action.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/components/plan/program-manager.plan-setup.test.tsx`

Expected: FAIL because the standalone save action is absent.

- [ ] **Step 3: Write minimal implementation**

Add a compact context-only form and a save handler that updates only these columns: `current_body_weight_kg`, `target_weight_change_kg_per_week`, `weight_change_last_14_days_kg`, `nutrition_adherence`, `protein_target_met`, `recovery_status`, and `updated_at`.

- [ ] **Step 4: Run focused tests**

Run: `pnpm vitest run src/components/plan/program-manager.test.tsx src/components/plan/program-manager.plan-setup.test.tsx src/domain/plan-setup.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/components/plan/program-manager.tsx src/components/plan/program-manager.test.tsx src/components/plan/program-manager.plan-setup.test.tsx
git commit -m "feat: add standalone profile context entry"
```

### Task 3: Release verification and deployment

**Files:**
- Verify: repository release gate and production site

- [ ] **Step 1: Run release gate**

Run: `pnpm release:check`

Expected: typecheck, build, and local smoke pass.

- [ ] **Step 2: Push and deploy**

```powershell
git push origin codex/p0-remediation
pnpm dlx vercel deploy --prod --yes
```

- [ ] **Step 3: Run production smoke**

Run: `$env:BASE_URL='https://strength-periodization-manager.vercel.app'; pnpm smoke`

Expected: all configured routes pass.
