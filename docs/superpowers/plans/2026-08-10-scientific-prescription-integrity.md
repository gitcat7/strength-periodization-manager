# Scientific Prescription Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让用户目标、经验、能力、频率、时长、限制和真实训练结果真实参与计划与 Coach 计算。

**Architecture:** 建立纯领域层 `training-prescription` 和 `training-analysis`，先计算周容量预算与能力基线，再生成每节处方；Coach 更新能力基线并重算未来 A/B 目标。组件只收集结构化输入并展示预览，数据库 RPC 原子保存画像、能力和计划。

**Tech Stack:** TypeScript 纯函数、Vitest、Supabase PostgreSQL RPC、React。

## Global Constraints

- 核心训练数值不得依赖大模型。
- 新手允许无主项基线；半年以上训练经验至少一个主项基线必填。
- 所有处方改变必须先预览，再由用户确认。
- 不做医疗诊断；结构化限制只用于动作冲突过滤。

---

### Task 1: 定义处方输入和周预算

**Files:**
- Create: `src/domain/training-prescription.ts`
- Create: `src/domain/training-prescription.test.ts`
- Modify: `src/domain/plan-setup.ts`
- Test: `src/domain/plan-setup.test.ts`

**Interfaces:**
- Produces: `buildPrescriptionContext(input): PrescriptionContext`
- Produces: `getWeeklySetBudget(context): Record<MuscleGroup, number>`
- Produces: `validateCapabilitySet(input): CapabilityValidationResult`

- [ ] **Step 1: 写失败测试**

覆盖五个目标处方不同、初学者无主项可通过、novice/intermediate 至少一个基线、频率增加不提高周总量、45 分钟动作/组数预算低于 90 分钟。

- [ ] **Step 2: 验证 RED**

```powershell
pnpm vitest run src/domain/training-prescription.test.ts src/domain/plan-setup.test.ts
```

- [ ] **Step 3: 实现最小纯函数**

输入必须包含 `goal`、`experienceLevel`、`trainingDaysPerWeek`、`sessionDurationMinutes`、`capabilities`、`movementRestrictions`；输出包含强度区间、次数区间、周组数预算、单节组数上限和是否需要首课校准。

- [ ] **Step 4: 验证 GREEN 并提交**

```powershell
pnpm vitest run src/domain/training-prescription.test.ts src/domain/plan-setup.test.ts
git add src/domain/training-prescription.ts src/domain/training-prescription.test.ts src/domain/plan-setup.ts src/domain/plan-setup.test.ts
git commit -m "feat: model goal driven prescription budgets"
```

### Task 2: 生成目标与经验驱动的训练日

**Files:**
- Modify: `src/domain/program.ts`
- Test: `src/domain/program.test.ts`
- Modify: `src/components/plan/program-manager.tsx`
- Test: `src/components/plan/program-manager.plan-setup.test.tsx`

**Interfaces:**
- Consumes: `PrescriptionContext`
- Produces: 保留 `PlannedScheduleItem[]` 的兼容生成结果

- [ ] **Step 1: 写失败测试**

断言相同基线下力量与增肌组次不同、初学者动作更少、频率变化后周总组数在预算内、时长上限生效、缺失辅助动作基线时目标重量为待校准而不是伪造公斤数。

- [ ] **Step 2: 验证 RED**

```powershell
pnpm vitest run src/domain/program.test.ts src/components/plan/program-manager.plan-setup.test.tsx
```

- [ ] **Step 3: 实现生成器并使用 training max**

计划重量从 `trainingMax` 与训练日强度系数计算；辅助器械没有真实基线时使用次数区间和目标 RPE，不使用主项公斤比例推算。

- [ ] **Step 4: 验证 GREEN 并提交**

```powershell
pnpm vitest run src/domain/program.test.ts src/components/plan/program-manager.plan-setup.test.tsx
git add src/domain/program.ts src/domain/program.test.ts src/components/plan/program-manager.tsx src/components/plan/program-manager.plan-setup.test.tsx
git commit -m "feat: generate experience aware training plans"
```

### Task 3: 结构化动作限制和恢复执行

**Files:**
- Create: `supabase/migrations/20260810090000_structured_movement_restrictions.sql`
- Modify: `supabase/schema.sql`
- Modify: `src/domain/training-prescription.ts`
- Test: `src/domain/training-prescription.test.ts`
- Modify: `src/components/plan/program-manager.tsx`

**Interfaces:**
- Produces: `movement_restrictions jsonb` 结构化字段
- Produces: `filterRestrictedExercises(...)`
- Produces: 恢复训练的临时负荷预览和 1–2 次训练抑制加重标记

- [ ] **Step 1: 写 SQL 与领域失败测试**

覆盖禁用过顶推举、没有安全替代时阻断、恢复倍率真实改变目标重量、恢复窗口内 Coach 不得加重。

- [ ] **Step 2: 实现迁移和纯函数**

迁移必须幂等、添加 JSON shape check，并为字段写中文注释；不得从自由文本自动推断医疗限制。

- [ ] **Step 3: 运行测试并提交**

```powershell
pnpm vitest run src/domain/training-prescription.test.ts src/domain/fitness-coach.test.ts
git add supabase src/domain src/components/plan
git commit -m "feat: enforce movement and recovery constraints"
```

### Task 4: 用真实完成数据驱动 Coach 并保留 A/B

**Files:**
- Modify: `src/domain/fitness-coach.ts`
- Test: `src/domain/fitness-coach.test.ts`
- Create: `src/domain/recommendation-application.ts`
- Test: `src/domain/recommendation-application.test.ts`
- Modify: `src/components/plan/program-manager.tsx`
- Modify: `src/components/today/today-workout.tsx`

**Interfaces:**
- Produces: `buildExerciseCoachRecommendation` 使用实际重量、次数、全部有效 RPE
- Produces: `recalculateFutureTargetsFromBaseline(...)`

- [ ] **Step 1: 写失败测试**

必须覆盖：计划 100kg 但实际 80kg 不建议 102.5kg；未达到目标次数不加重；异常高 RPE 不加重；接受卧推建议后 A 日和 B 日保持不同重量；恢复窗口阻止加重。

- [ ] **Step 2: 验证 RED**

```powershell
pnpm vitest run src/domain/fitness-coach.test.ts src/domain/recommendation-application.test.ts
```

- [ ] **Step 3: 实现并验证 GREEN**

```powershell
pnpm vitest run src/domain/fitness-coach.test.ts src/domain/recommendation-application.test.ts
git add src/domain src/components/plan/program-manager.tsx src/components/today/today-workout.tsx
git commit -m "fix: base coaching on actual completed performance"
```

### Task 5: 修正进展统计语义

**Files:**
- Create: `src/domain/progress-range.ts`
- Test: `src/domain/progress-range.test.ts`
- Modify: `src/components/progress/progress-dashboard.tsx`
- Test: `src/components/progress/progress-dashboard.test.tsx`

**Interfaces:**
- Produces: `selectRecentCompletedWorkouts(rows, limit)`
- Produces: 连续周时间轴和计划依从率

- [ ] **Step 1: 写失败测试**

用 61 条数据断言包含最新 60 条；覆盖停训周保留为 0、计划日进入依从率分母、e1RM 只使用本地主项 1–10 次有效组。

- [ ] **Step 2: 改为数据库降序取 60 后客户端升序**

不得继续使用 `.order(... ascending: true).limit(60)`。

- [ ] **Step 3: 验证并提交**

```powershell
pnpm vitest run src/domain/progress-range.test.ts src/components/progress/progress-dashboard.test.tsx
git add src/domain/progress-range.ts src/domain/progress-range.test.ts src/components/progress
git commit -m "fix: analyze recent and continuous training progress"
```

### Task 6: 原子保存画像并完成发布门禁

**Files:**
- Create: `supabase/migrations/20260810100000_save_plan_profile_atomically.sql`
- Modify: `supabase/schema.sql`
- Modify: `src/components/plan/program-manager.tsx`
- Create: `scripts/save-plan-profile-sql-contract.test.mjs`

**Interfaces:**
- Produces: `save_plan_profile_atomically(profile jsonb, lifts jsonb)` RPC

- [ ] **Step 1: 写 RED 契约和数据库测试**

断言 RPC 使用 `auth.uid()`、锁定归属、任一 lift 失败时 profile 与 lifts 全部回滚。

- [ ] **Step 2: 实现迁移并接入组件**

- [ ] **Step 3: 完整验证**

```powershell
pnpm test
pnpm release:check
git diff --check
```

- [ ] **Step 4: 提交并推送固定分支**

```powershell
git add supabase src scripts
git commit -m "feat: save scientific plan inputs atomically"
git push
```

测试窗口明确通过且用户执行两个新迁移成功前禁止部署。

