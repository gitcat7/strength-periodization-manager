# 训练模板与排程分离 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 提供四种训练结构、三种独立排程与命名式自定义模板，并保持首页按训练序列继续执行。

**Architecture:** 领域层根据模板和排程配置生成带连续 `sequenceIndex` 的训练序列；计划页收集配置并写入 `programs` 元数据；数据库迁移只扩展既有 programs 表，历史计划保持可读。

**Tech Stack:** Next.js 14、React、TypeScript、Vitest、Supabase PostgreSQL。

## Global Constraints

- 移动端优先，全部训练重量保持 kg。
- 每个训练日只有一个清晰训练方向。
- 旧 `template_type` 数据必须继续可读。
- 不新增任意动作编排器。

---

### Task 1: 扩展训练领域与排程生成

**Files:**
- Modify: `src/domain/program.ts`
- Modify: `src/domain/program.test.ts`

- [ ] 写入四模板和练休排程的失败测试。
- [ ] 运行 `pnpm vitest run src/domain/program.test.ts`，确认因缺失类型或函数失败。
- [ ] 以最小实现增加模板元数据、`ScheduleMode`、日期生成和新处方。
- [ ] 再次运行同一测试，确认通过。

### Task 2: 持久化计划配置

**Files:**
- Create: `supabase/migrations/20260715100000_program_templates_and_scheduling.sql`
- Modify: `supabase/schema.sql`
- Modify: `scripts/sequence-scheduling-sql-contract.test.mjs`

- [ ] 写入迁移契约失败测试。
- [ ] 运行 `node scripts/sequence-scheduling-sql-contract.test.mjs`，确认失败。
- [ ] 增加只扩展 programs 表的迁移和 schema 镜像。
- [ ] 运行迁移契约测试，确认通过。

### Task 3: 计划与首页入口

**Files:**
- Modify: `src/components/plan/program-manager.tsx`
- Modify: `src/components/dashboard/home-dashboard.tsx`
- Modify: `src/app/api/agent/v1/route.ts`

- [ ] 将计划创建改为使用明确模板/排程配置，保存元数据并按 sequence 展示。
- [ ] 在无计划首页添加创建模板入口。
- [ ] 让 Agent API 的今日查询按 sequence 选取未完成训练。
- [ ] 运行 typecheck 和 build。

### Task 4: 验收与发布

**Files:**
- Modify: 本任务所列文件

- [ ] 运行全部测试、typecheck、build、release check。
- [ ] 审查 diff 并提交特性分支。
- [ ] 合并至 main，推送；在数据库迁移已执行后部署 Vercel 并运行生产 smoke。
