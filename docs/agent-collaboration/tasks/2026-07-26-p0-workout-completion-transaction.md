# CC 任务：P0 统一服务端完成训练事务

## 背景与目标

Web 端通过多次独立写入完成训练，Agent API 又可绕过组记录直接标记完成；中断会留下半完成数据，且数据库允许 0kg/0 次。这是数据一致性与权限边界 P0。

目标：建立一个服务端原子入口，统一验证记录、完成训练与生成建议，Web 和 Agent 共用该入口。

## 基线与范围

- 基线：已合并前两项整改后的 `main`。
- 分支：`claude/p0-workout-completion-transaction`。
- 允许修改：新增一个 Supabase migration；`supabase/schema.sql`；相关 SQL 契约测试；`src/app/api/agent/v1/route.ts`；`src/components/today/today-workout.tsx`；完成训练所需的最小 Supabase 类型/客户端封装。
- 禁止修改：训练计划生成、建议应用算法、RLS 放宽、依赖版本、生产数据库与部署。

## 行为与接口

- 新增单一 RPC（名称由实现者确定但需文档化），由已认证用户调用。
- RPC 必须验证 `auth.uid()` 对 workout 的所有权；不得信任客户端传入 `user_id`。
- 在同一事务中：验证所有必需 completed 组的实际值、写入/确认状态、将 workout 标记 completed、生成或撤销对应建议。
- 对力量组，完成值必须为正重量、正次数、合法 RPE；有计划目标时应用 Coach 的目标达成语义。心肺动作沿用其明确的例外规则。
- 任一步失败必须回滚，Web 与 Agent 得到一致错误；Agent 不得再直接更新 completed 状态。

## TDD 与验收

先增加 SQL/路由失败测试，至少覆盖：

1. 非所有者无法完成训练。
2. 0kg、0 次、非法 RPE 被拒绝。
3. 缺失必填完成组被拒绝。
4. 成功调用同时得到 completed 状态与正确建议结果。
5. Web 与 Agent 使用相同 RPC；任一失败不留下半完成记录。

运行：

```powershell
pnpm vitest run src/app/api/agent/v1/route.test.ts scripts/*sql-contract.test.mjs
pnpm test
pnpm typecheck
pnpm release:check
git diff --check
```

本地 Supabase 若未启动，不得伪造通过；保留迁移与契约测试结果，并在交付中说明限制。

## Git 与交付

提交信息：`fix: complete workouts through an atomic server transaction`。禁止推送；按模板交付。
