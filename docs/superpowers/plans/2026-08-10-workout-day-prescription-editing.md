# Workout Day Prescription Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 允许用户安全修改某个未完成训练日的动作结构，并让实际完成数据进入所有既有分析链路。

**Architecture:** 使用 workout 级 `prescription_revision` 和一个全量处方 RPC 原子保存动作列表；前端编辑器只提交本地审核动作。完成后的事实仍写入 `log_set_logs`，History、Progress、e1RM 和 Coach 继续使用现有三表读取。

**Tech Stack:** Supabase PostgreSQL/RLS/RPC、Next.js/React、TypeScript、Vitest、pgTAP。

## Global Constraints

- 只允许编辑本人当前活动计划中的 scheduled/draft 训练日。
- 已完成、已跳过、已归档或存在完成组的训练日禁止结构编辑。
- 第一版只允许本地 `cfg_exercises`，不接受外部或手工动作。
- 保存必须单事务；禁止浏览器端多次 insert/update/delete 拼接。

---

### Task 1: 建立数据库 revision、审计和原子 RPC

**Files:**
- Create: `supabase/migrations/20260810110000_revise_workout_prescription.sql`
- Modify: `supabase/schema.sql`
- Create: `supabase/tests/revise_workout_prescription.test.sql`
- Create: `scripts/workout-prescription-sql-contract.test.mjs`

**Interfaces:**
- Produces: `plan_workouts.prescription_revision`
- Produces: `revise_workout_prescription(uuid, integer, jsonb)`
- Produces: `ops_workout_revision_events`

- [ ] **Step 1: 写失败的 SQL 契约测试**

断言函数为 security definer、固定 search_path、拒绝 anon、只从 auth.uid 取用户，并包含 revision 与 completed-set 防护。

- [ ] **Step 2: 写 pgTAP 失败测试**

覆盖跨用户、rest/completed/skipped/archived、stale revision、存在完成组、空/重复/乱序/越界动作、方向不符、成功 add/delete/replace/reorder、回滚和 revision 只加一次。

- [ ] **Step 3: 实现迁移与 trigger**

动作列表验证：1–12 个；`order_index=1..N`；`target_sets=1..20`；`target_reps=1..1000`；`target_weight=0..10000`；无重复 exercise_id。

- [ ] **Step 4: 运行契约与数据库测试**

```powershell
pnpm vitest run scripts/workout-prescription-sql-contract.test.mjs
pnpm dlx supabase@2.34.3 test db supabase/tests/revise_workout_prescription.test.sql --local
```

- [ ] **Step 5: 提交**

```powershell
git add supabase scripts/workout-prescription-sql-contract.test.mjs
git commit -m "feat: revise workout prescriptions atomically"
```

### Task 2: 建立前端 payload 与验证领域层

**Files:**
- Create: `src/domain/workout-prescription-editor.ts`
- Create: `src/domain/workout-prescription-editor.test.ts`

**Interfaces:**
- Produces: `validateWorkoutPrescriptionDraft(draft)`
- Produces: `buildWorkoutPrescriptionPayload(draft)`
- Produces: `getPrescriptionChangeSummary(before, after)`

- [ ] **Step 1: 写失败测试**

覆盖连续顺序、重复动作、最后一个动作删除、数值范围、方向冲突和变更摘要。

- [ ] **Step 2: 验证 RED**

```powershell
pnpm vitest run src/domain/workout-prescription-editor.test.ts
```

- [ ] **Step 3: 实现纯函数并验证 GREEN**

```powershell
pnpm vitest run src/domain/workout-prescription-editor.test.ts
git add src/domain/workout-prescription-editor.ts src/domain/workout-prescription-editor.test.ts
git commit -m "feat: validate workout prescription edits"
```

### Task 3: 实现计划页单日编辑器

**Files:**
- Create: `src/components/plan/workout-prescription-editor.tsx`
- Create: `src/components/plan/workout-prescription-editor.test.tsx`
- Modify: `src/components/plan/program-manager.tsx`
- Modify: `src/lib/client-cache.ts`

**Interfaces:**
- Consumes: Task 2 payload/summary functions and Task 1 RPC
- Produces: “编辑本次训练”入口、编辑表单、保存预览和错误映射

- [ ] **Step 1: 写失败组件测试**

覆盖仅未完成训练显示入口、添加/替换/删除/调序、保存摘要、stale revision 提示、成功后关闭并重新加载。

- [ ] **Step 2: 验证 RED**

```powershell
pnpm vitest run src/components/plan/workout-prescription-editor.test.tsx
```

- [ ] **Step 3: 实现编辑器**

保存成功后必须调用 `clearTrainingDataCaches()` 和 `clearWorkoutDrafts([workoutId])`，随后重新读取当前计划；不得直接修改表。

- [ ] **Step 4: 验证并提交**

```powershell
pnpm vitest run src/components/plan/workout-prescription-editor.test.tsx src/components/plan/program-manager.test.tsx
git add src/components/plan src/lib/client-cache.ts
git commit -m "feat: edit a scheduled workout prescription"
```

### Task 4: 验证 Today 与分析链路

**Files:**
- Modify: `src/components/today/today-workout.test.tsx`
- Modify: `src/components/history/training-history.test.tsx`
- Modify: `src/components/progress/progress-dashboard.test.tsx`
- Modify: `src/domain/fitness-coach.test.ts`

**Interfaces:**
- Consumes: 已保存的 `plan_workout_exercises` 和后续 `log_set_logs`
- Produces: 端到端数据兼容证明

- [ ] **Step 1: 写集成回归测试**

编辑训练日后断言 Today 显示新动作与正确组数；完成后 History 显示最终动作和实际组；Progress 总量更新；新增本地主项且 1–10 次时 e1RM 更新；普通辅助动作不进入主项 e1RM；Coach 使用新增动作的实际完成数据。

- [ ] **Step 2: 运行测试并修复任何真实兼容问题**

```powershell
pnpm vitest run src/components/today/today-workout.test.tsx src/components/history/training-history.test.tsx src/components/progress/progress-dashboard.test.tsx src/domain/fitness-coach.test.ts
```

- [ ] **Step 3: 提交**

```powershell
git add src/components src/domain/fitness-coach.test.ts
git commit -m "test: verify edited workouts enter training analytics"
```

### Task 5: 完整门禁、独立测试与部署门槛

**Files:**
- Modify: `docs/12_database_release_runbook.md`
- Modify: `docs/13_vercel_deployment_handoff.md`

**Interfaces:**
- Consumes: Tasks 1–4
- Produces: 固定提交和唯一新迁移执行说明

- [ ] **Step 1: 运行完整门禁**

```powershell
pnpm test
pnpm release:check
pnpm dlx supabase@2.34.3 test db supabase/tests/revise_workout_prescription.test.sql --local
git diff --check
```

- [ ] **Step 2: 更新迁移与部署文档**

只要求用户执行 `20260810110000_revise_workout_prescription.sql`；明确旧迁移不重复执行。

- [ ] **Step 3: 提交并推送**

```powershell
git add docs
git commit -m "docs: add workout prescription release gate"
git push
```

- [ ] **Step 4: 交给测试窗口**

测试窗口必须明确验证数据库权限、编辑交互、Today 执行和 History/Progress/Coach 数据链路。用户确认新 SQL 成功且测试窗口明确“验证通过”前禁止部署。

