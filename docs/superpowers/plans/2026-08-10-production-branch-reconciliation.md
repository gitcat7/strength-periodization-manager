# Production Branch Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立同时包含完整 P0/体验优化与新排程/OTP/近期修复的唯一生产分支。

**Architecture:** 从固定生产提交 `7778ccdb52f8e0652949a31a95be2322aaed0226` 创建独立集成 worktree，合并 `origin/codex/p0-remediation`，通过行为契约而不是按文件整边选择解决冲突。先恢复数据库迁移和领域能力，再恢复组件体验，最后重放 checkpoint 独有行为。

**Tech Stack:** Git worktree、Next.js 15、React 19、TypeScript、Vitest、Supabase SQL/pgTAP、Vercel。

## Global Constraints

- 禁止 force push，禁止直接修改 `main`。
- 保留用户原有未跟踪 `.claude/` 和 phase-2 计划文件。
- 不部署未通过独立测试窗口的提交。
- 旧 SQL 迁移恢复到仓库，但只有全新的迁移才要求用户执行。

---

### Task 1: 建立行为矩阵与集成 worktree

**Files:**
- Create: `docs/qa/2026-08-10-production-capability-matrix.md`
- Modify: none

**Interfaces:**
- Consumes: `7778ccd`、`origin/codex/p0-remediation`
- Produces: 每项能力对应的源码、测试、迁移和验收状态矩阵

- [ ] **Step 1: 创建独立 worktree**

```powershell
git worktree add "D:\力量训练周期管理\strength-periodization-manager\.worktrees\production-reconciliation" -b codex/production-reconciliation 7778ccdb52f8e0652949a31a95be2322aaed0226
```

- [ ] **Step 2: 写能力矩阵**

矩阵必须逐项列出 OTP、排程、暂停/恢复、未来训练、严格画像处方、训练时长、原子完成、历史读改、计划/今日/首页/进展/设置体验、完成弹窗和小数重量，并给出 `checkpoint`、`p0-remediation`、合并后测试三列。

- [ ] **Step 3: 提交矩阵**

```powershell
git add docs/qa/2026-08-10-production-capability-matrix.md
git commit -m "docs: define production reconciliation matrix"
```

### Task 2: 合并并恢复数据库与领域能力

**Files:**
- Restore: `supabase/migrations/20260726120000_complete_training_workout_atomically.sql`
- Restore: `supabase/migrations/20260726200000_profile_driven_goal_prescriptions.sql`
- Restore: `supabase/migrations/20260729233000_workout_duration_tracking.sql`
- Restore: `supabase/migrations/20260730010000_atomic_training_completion_and_recommendations.sql`
- Restore: `supabase/migrations/20260730123000_history_read_edit_workflow.sql`
- Merge: `supabase/schema.sql`
- Merge: `src/domain/program.ts`
- Merge: `src/domain/plan-setup.ts`
- Merge: `src/domain/fitness-coach.ts`
- Preserve: `src/domain/sequence-calendar.ts`
- Preserve: `src/domain/schedule-rule.ts`

**Interfaces:**
- Consumes: migration/RPC contracts from p0-remediation and schedule contracts from checkpoint
- Produces: schema and domain layer containing both capability sets

- [ ] **Step 1: 启动非自动提交合并**

```powershell
git merge --no-commit --no-ff origin/codex/p0-remediation
```

- [ ] **Step 2: 先解决 SQL 与领域冲突**

不得使用整边 `--ours`/`--theirs` 覆盖 `schema.sql`、`program.ts` 或 `plan-setup.ts`。合并结果必须同时包含 sequence scheduling、goal-driven prescription、duration、atomic completion 和 history revision RPC。

- [ ] **Step 3: 写/恢复 SQL 契约测试并运行 RED/GREEN**

```powershell
pnpm vitest run scripts/atomic-training-closure-sql-contract.test.mjs scripts/history-read-edit-sql-contract.test.mjs scripts/profile-driven-prescription-sql-contract.test.mjs scripts/workout-duration-sql-contract.test.mjs scripts/sequence-calendar-schema-contract.test.mjs
```

期望：全部通过，且迁移文件中不得重命名 `save_standalone_workout_legacy`。

- [ ] **Step 4: 运行领域组合测试**

```powershell
pnpm vitest run src/domain/program.test.ts src/domain/plan-setup.test.ts src/domain/fitness-coach.test.ts src/domain/sequence-calendar.test.ts src/domain/schedule-rule.test.ts
```

- [ ] **Step 5: 提交数据库与领域合并**

```powershell
git add supabase src/domain scripts
git commit -m "fix: reconcile training domain and database releases"
```

### Task 3: 恢复 UI 能力并保留近期修复

**Files:**
- Merge: `src/components/today/today-workout.tsx`
- Merge: `src/components/plan/program-manager.tsx`
- Restore: `src/components/history/history-workout-card.tsx`
- Merge: `src/components/history/training-history.tsx`
- Merge: `src/components/progress/progress-dashboard.tsx`
- Merge: `src/components/dashboard/home-dashboard.tsx`
- Merge: `src/components/settings/settings-panel.tsx`
- Preserve: `src/components/auth/email-login-form.tsx`
- Preserve: `src/app/login/page.tsx`

**Interfaces:**
- Consumes: reconciled domain/RPC interfaces from Task 2
- Produces: complete UI with all previously accepted behavior

- [ ] **Step 1: 解决组件冲突**

Today 必须同时具有：原子完成、训练时长、聚焦折叠、休息提示、未来训练阻断、完成弹窗关闭和桌面小数重量列宽。Plan 必须同时具有：严格处方、任务化概览、新排程管理和已有计划默认隐藏生成表单。

- [ ] **Step 2: 运行组件回归测试**

```powershell
pnpm vitest run src/components/today src/components/plan src/components/history src/components/progress src/components/dashboard src/components/settings src/components/auth
```

- [ ] **Step 3: 运行登录与路由契约**

```powershell
pnpm vitest run scripts/email-otp-login-contract.test.mjs scripts/smoke-check.test.mjs
```

- [ ] **Step 4: 提交 UI 对账**

```powershell
git add src/components src/app scripts
git commit -m "fix: reconcile production training interfaces"
```

### Task 4: 完整发布门禁与独立测试交接

**Files:**
- Modify: `docs/qa/2026-08-10-production-capability-matrix.md`

**Interfaces:**
- Consumes: Tasks 1–3
- Produces: 可供独立测试窗口固定验收的 commit

- [ ] **Step 1: 运行全量测试**

```powershell
pnpm test
pnpm release:check
git diff --check
```

- [ ] **Step 2: 运行可用的数据库测试**

```powershell
pnpm test:db
pnpm test:db:sequence
```

若本地 Supabase 不可用，必须明确记录“未执行”，禁止写成通过。

- [ ] **Step 3: 完成能力矩阵并提交**

```powershell
git add docs/qa/2026-08-10-production-capability-matrix.md
git commit -m "test: verify reconciled production capabilities"
git push -u origin codex/production-reconciliation
```

- [ ] **Step 4: 通知测试窗口**

发送固定 commit、能力矩阵、全量测试结果和数据库测试边界。测试窗口明确“验证通过”前禁止部署。

