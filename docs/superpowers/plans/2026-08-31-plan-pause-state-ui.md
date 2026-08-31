# 计划暂停态 UI 重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 暂停计划时以恢复导向的总览取代活动周期 CTA，且不改变任何日程或训练业务语义。

**Architecture:** 复用 `ProgramManager` 已计算的 `pauseState`、`daysInterrupted`、`recoveryAdvice` 与 `pendingTrainings`。仅提取纯展示 helper 和两个 UI 区块；恢复按钮仍调用既有对话框入口。

**Tech Stack:** Next.js、React、TypeScript、Tailwind、Lucide、Vitest。

## Global Constraints

- 不改 Supabase/RPC/schema/migration、缓存 key、训练算法、暂停/恢复日程语义、依赖或非暂停态行为。
- 不自动恢复，不默认选择恢复路线；无待训练时禁止恢复。
- 仅 paused 状态隐藏 Today CTA、暂停和额外休息操作；完整计划仍只读可查看。

## Task 1: 暂停态展示模型与 RED 测试

**Files:**
- Create: `src/domain/plan-pause-presentation.ts`
- Test: `src/domain/plan-pause-presentation.test.ts`
- Modify/Test: `src/components/plan/program-manager.test.tsx`

- [x] 写领域 RED 测试，断言暂停第 1 天/第 N 天、原因标签、恢复日期状态与无 pending 的禁用说明。
- [x] 运行 `pnpm vitest run src/domain/plan-pause-presentation.test.ts`，预期因模块不存在失败。
- [x] 实现无副作用 helper：输入 effective date、today、reason、resume date、pending training，返回所有暂停文案与是否可恢复。
- [x] 重跑领域测试为 GREEN。
- [x] 在 ProgramManager 测试先加入 paused RED 覆盖：无“查看今日训练”，有总览和“恢复训练”；有/无/已过恢复日期；无 pending 禁用；恢复打开路线但不预选；非暂停态回归保留入口。

## Task 2: ProgramManager 暂停态总览与恢复中心

**Files:**
- Modify: `src/components/plan/program-manager.tsx`
- Test: `src/components/plan/program-manager.test.tsx`

- [x] 先运行 ProgramManager paused 测试，确认旧活动卡/通用日程调整 UI 导致 RED。
- [x] 用暂停态总览条件替换活动周期卡；保留非暂停卡不变。
- [x] 将 paused 的日程调整卡替换为恢复中心；复用 `openAdjustmentDialog("resume")`、`getRecoveryLoadAdvice`、`pendingTrainings` 与现有 `ScheduleAdjustmentDialog`。
- [x] 添加计划内容只读锚点，确保暂停态没有 `/today` CTA、额外休息或暂停操作。
- [x] 重跑领域和组件 focused tests 为 GREEN；静态核对 h-11、whitespace-nowrap、min-w-0 与无训练录入入口。

## Task 3: 验证与发布门禁

- [x] 运行 focused：`pnpm vitest run src/domain/plan-pause-presentation.test.ts src/components/plan/program-manager.test.tsx src/components/plan/schedule-adjustment-dialog.test.tsx src/domain/schedule-adjustment.test.ts`。
- [x] 运行 `pnpm test`、`pnpm release:check`、`git diff --check`；记录真实结果。
- [x] 追加真实 RED/GREEN 与验证记录到本计划。
- [ ] 提交并推送固定 SHA 到 `codex/pause-state-ui`。
- [ ] 发送固定 SHA、无 SQL 声明、测试证据和暂停态验收点给测试任务 `019fac2b-9290-72f3-88d6-5b2344a8e949`；在其明确“验证通过”前禁止部署。
- [ ] 测试通过后，从干净 detached worktree 仅部署该 SHA，运行正式域名 14 路由和无缓存 `/api/health`，再通知架构师最终验收。

## Execution record

- RED: `pnpm vitest run src/domain/plan-pause-presentation.test.ts` initially failed because the presentation module did not exist; the component RED then failed 3 assertions because the active-cycle CTA and generic schedule card still rendered.
- Additional RED: the paused complete-plan render exposed “调整本日动作”; the paused plan is now read-only. A legacy unknown reason also initially produced an empty label and now safely falls back to “未说明原因”.
- GREEN focused: `pnpm vitest run src/domain/plan-pause-presentation.test.ts src/components/plan/program-manager.test.tsx src/components/plan/schedule-adjustment-dialog.test.tsx src/domain/schedule-adjustment.test.ts` — 4 files, 31 tests passed.
- Full: `pnpm test` — 80 files passed, 377 tests passed, 2 skipped. The pre-existing React `act(...)` warning remains in the loading-state test.
- Release: `pnpm release:check` — typecheck, production build, and all 14 local routes including `/api/health` passed after supplying the ignored local `.env.local` to the isolated worktree.
- Static: `git diff --check` passed. This batch has no SQL migration, RPC, schema, cache-key, algorithm, or dependency changes.
