# 科学建议保护条件与计划日编辑事实校验 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让完成训练后的建议只在真实完成质量、恢复间隔和可用画像条件都安全时才允许加重，并让计划页在已有完成组时不提供结构编辑入口。

**Architecture:** 领域层定义可测试的保守阈值与优先级；生产 RPC 在单个补丁迁移中用同一阈值生成建议、记录 `source_metrics`，并扩展处方预览警告。计划页显式读取已完成组事实，作为 UX 预防层；数据库仍为最终权限与状态边界。

**Tech Stack:** Next.js/React、TypeScript、Vitest、Supabase PostgreSQL/PLpgSQL、pgTAP。

## Global Constraints

- 基线固定为已部署的 `ab7aaa1`；不回退既有完成功能。
- 不做医疗诊断；缺少可用的结构化画像或完成数据时只保持处方。
- 仅一个新、幂等的生产补丁迁移 `20260821020000_scientific_review_protection_rules.sql`，同步 `supabase/schema.sql`。
- 不静默改未来处方；建议仍需用户确认后应用。
- TDD：每项先观察 RED，再写最小 GREEN；测试窗口通过和用户确认迁移前禁止部署。

---

### Task 1: 科学建议规则的领域契约

**Files:**
- Modify: `src/domain/scientific-review.ts`
- Test: `src/domain/scientific-review.test.ts`, `src/domain/fitness-coach.test.ts`

- [x] **Step 1: Write failing tests** for actual weight/reps below target, 0/1 天间隔、营养/体重保护条件，并断言它们均不能返回 `increase`。
- [x] **Step 2: Run RED**

Run: `pnpm vitest run src/domain/scientific-review.test.ts src/domain/fitness-coach.test.ts`

Expected: fail because the current rule still returns `progression_ready` or lacks the new reason codes.

- [x] **Step 3: Implement the smallest shared TypeScript rule** with named constants: 完成数据有效性、实际表现达标、恢复/营养/体重保护、短间隔、长间隔、高 RPE、主项加重的优先级。
- [x] **Step 4: Run GREEN** with the same command.

### Task 2: 生产 RPC 与处方预览补丁

**Files:**
- Create: `supabase/migrations/20260821020000_scientific_review_protection_rules.sql`
- Modify: `supabase/schema.sql`, `supabase/tests/scientific_review_guardrails.test.sql`, `scripts/scientific-review-sql-contract.test.mjs`

- [x] **Step 1: Write failing SQL contract and pgTAP assertions** for真实重量/次数、恢复/营养/体重字段进入 `source_metrics`、短间隔保护、相邻日恢复警告、目标/经验警告与阈值。
- [x] **Step 2: Run RED**

Run: `pnpm vitest run scripts/scientific-review-sql-contract.test.mjs` and `pnpm test:db:science`

Expected: contract fails against the old migration/function; pgTAP has no assertions for the patch until it is applied.

- [x] **Step 3: Create an idempotent patch migration** that updates the existing functions, leaves accepted/modified/rejected audit rows untouched, and mirrors the final definitions in schema.
- [x] **Step 4: Apply only to local QA database and run GREEN** with the same commands.

### Task 3: 计划页已完成组事实

**Files:**
- Modify: `src/components/plan/program-manager.tsx`
- Test: `src/components/plan/program-manager.test.tsx`

- [x] **Step 1: Write a failing UI/data-loading contract** proving scheduled/draft days with a completed set do not render the editor and instead show a Chinese reason.
- [x] **Step 2: Run RED**

Run: `pnpm vitest run src/components/plan/program-manager.test.tsx`

Expected: fail because the old rendering condition uses status only.

- [x] **Step 3: Load completed log facts with workouts and gate the editor** while retaining the RPC’s server-side completed-set protection.
- [x] **Step 4: Run GREEN** with the same command.

### Task 4: Full verification and handoff

**Files:**
- Modify: `docs/12_database_release_runbook.md`

- [x] **Step 1: Add the patch-migration execution/rollback verification note** without secrets.
- [x] **Step 2: Run** focused tests, `pnpm test:db:science`, `pnpm test:db`, `pnpm test:db:sequence`, `pnpm test`, `pnpm release:check`, and `git diff --check`.
- [ ] **Step 3: Commit and push the fixed SHA**; send the precise SHA, migration path, RED→GREEN evidence, and known boundary to the independent test window. Do not deploy.
