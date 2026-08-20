# 历史页按日期查看实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让历史页默认只显示日期选择器，点击日期后才显示该日期训练内容。

**Architecture:** 保留 `TrainingHistory` 的月历查询、缓存、日期摘要和历史详情渲染，仅调整 `selectedDate` 的初始化和月份切换状态；以组件测试锁定默认无详情、点击显示和切月清空。

**Tech Stack:** Next.js App Router、React、TypeScript、Vitest、Testing Library、Tailwind。

## Global Constraints

- 不新增数据库迁移、schema、RPC 或依赖。
- 不改变 Supabase 查询范围、RLS、缓存 key、历史编辑保存语义。
- 保留 `workout` 查询参数的当前用户校验与聚焦行为。
- 保持移动端日历和详情布局。

### Task 1: 固化历史页选择状态契约

**Files:**
- Modify: `src/components/history/training-history.tsx`
- Test: `src/components/history/history-calendar.test.tsx`（如当前测试文件不存在则创建）

- [ ] **Step 1: 写失败测试**

覆盖：加载当前月份后 `selectedDate` 为空且不出现日期详情；点击日期后出现对应摘要；切换月份后详情消失。

- [ ] **Step 2: 运行测试确认 RED**

运行：`pnpm vitest run src/components/history/history-calendar.test.tsx`

预期：默认详情测试失败，原因是当前代码会自动选择今天。

- [ ] **Step 3: 最小实现**

删除月份加载完成时依据 `today` 调用 `setSelectedDate` 的逻辑；保留 `setSelectedDate(null)` 的月份切换行为；保留 workout 查询参数对有效记录的显式选中。

- [ ] **Step 4: 运行定向测试确认 GREEN**

运行：`pnpm vitest run src/components/history/history-calendar.test.tsx src/components/history/history-workout-focus.test.ts`

预期：全部通过。

### Task 2: 回归验证与发布交接

- [ ] **Step 1:** 运行历史页 focused tests 并记录 RED→GREEN。
- [ ] **Step 2:** 运行 `pnpm test`。
- [ ] **Step 3:** 运行 `pnpm release:check`，确认 typecheck、生产构建和本地 14 路由 smoke 通过。
- [ ] **Step 4:** `git diff --check`、确认只改历史页测试/实现与本计划文档。
- [ ] **Step 5:** 提交并推送固定 commit，通知测试窗口独立验收。
- [ ] **Step 6:** 测试窗口明确“验证通过”后部署固定提交，跑正式域名 14 路由和 `/api/health`，通知架构窗口最终验收。
