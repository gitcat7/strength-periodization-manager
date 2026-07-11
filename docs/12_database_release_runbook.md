# 数据库发布与备份手册

用途：每次修改 Supabase 数据库前后按这个流程执行，降低一个人维护时误操作风险。

## 1. 发布前备份

在 Supabase Dashboard 执行任一方式：

- Table Editor 逐表导出 CSV。
- SQL Editor 导出核心表。
- 如果项目已升级到支持 Point-in-Time Recovery 的套餐，确认恢复点可用。

核心表：

- `athlete_profiles`
- `lift_profiles`
- `programs`
- `workouts`
- `workout_exercises`
- `set_logs`
- `recommendations`
- `pr_goals`
- `feedback_reports`
- `analytics_events`
- `agent_access_tokens`

备份记录：

```text
备份时间：
备份方式：
备份文件位置：
执行人：
```

## 2. SQL 执行顺序

首次部署或重建：

1. 执行 `supabase/schema.sql`
2. 执行 `supabase/migrations/20260703_push_pull_squat.sql`
3. 执行 `supabase/migrations/20260704_feedback_reports.sql`
4. 执行 `supabase/migrations/20260704_analytics_events.sql`
5. 执行 `supabase/migrations/20260711_agent_access_tokens.sql`

日常发布：

1. 先读 SQL，确认是否含 destructive 操作。
2. 先在 Supabase SQL Editor 手动执行。
3. 执行后立即打开 `/diagnostics`。

## 3. 发布后验收

基础验收：

- `/diagnostics` 环境变量通过。
- 登录状态通过。
- `exercises` 至少可读 10 个动作。

功能验收：

- 新用户可以创建训练画像。
- 可以生成计划。
- 今日训练可以保存草稿。
- 完成训练后写入 `set_logs`。
- 完成训练后生成 `recommendations`。
- PR 目标可以创建多个不同动作。
- CSV 只导出已完成训练。
- 反馈问题可以写入 `feedback_reports`。
- 关键行为可以写入 `analytics_events`，包括生成计划、保存训练、完成训练、PR 和导出。

## 4. RLS 验收

确认以下表已开启 RLS：

- `athlete_profiles`
- `lift_profiles`
- `programs`
- `workouts`
- `workout_exercises`
- `set_logs`
- `recommendations`
- `pr_goals`
- `feedback_reports`
- `analytics_events`
- `exercises`
- `agent_access_tokens`

策略原则：

- `exercises` 允许已登录用户读取。
- 所有用户数据表只允许 `auth.uid() = user_id` 的用户访问。
- `workout_exercises` 和 `set_logs` 通过所属 workout 间接判断用户。
- `feedback_reports` 允许登录用户创建和读取自己的反馈。
- `analytics_events` 允许登录用户创建和读取自己的行为事件。
- `agent_access_tokens` 只允许用户管理自己的令牌元数据，匿名角色无权读取；数据库只保存 SHA-256 哈希，不保存原始令牌。

## 5. 回滚策略

如果发布后出现严重错误：

1. 暂停继续使用应用。
2. 记录错误页面、时间、用户邮箱、操作路径。
3. 用最近备份恢复受影响表。
4. 如仅是前端错误，优先回滚 Vercel 部署。
5. 恢复后重新执行 `/api/health`、`pnpm smoke` 或线上 `BASE_URL=... pnpm smoke`。

## 6. 内测期间节奏

- 每次改 schema 前备份。
- 每周固定备份一次。
- 每次内测用户批量导入或清理数据前备份。
- 不在疲劳或赶时间时执行数据库结构变更。
