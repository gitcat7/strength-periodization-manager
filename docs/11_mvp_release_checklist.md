# MVP 发布验收清单

用途：把本地 MVP 推到可给 3-5 个熟人内测的状态。每一项都要有明确证据，不能只凭“应该可以”。

## 1. 本地构建验收

- `pnpm typecheck` 通过。
- `pnpm build` 通过。
- `pnpm smoke` 通过。
- `pnpm release:check` 通过。
- 线上部署后执行 `BASE_URL=https://你的-vercel-默认域名 pnpm smoke` 通过。
- 本地开发服务可访问：
  - `/`
  - `/login`
  - `/diagnostics`
  - `/onboarding`
  - `/plan`
  - `/today`
  - `/history`
  - `/progress`
  - `/pr`
  - `/settings`
  - `/feedback`
  - `/api/health`
- 移动端宽度下底部导航不遮挡主要按钮。
- 登录页不显示底部导航。

## 2. Vercel 部署

在 Vercel 创建项目并导入代码仓库。

环境变量：

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

部署后记录：

```text
Vercel 默认域名：
部署时间：
部署版本：
```

## 3. Supabase Auth 配置

在 Supabase 项目后台配置：

Site URL：

```text
https://你的-vercel-默认域名
```

Redirect URLs：

```text
http://127.0.0.1:3000/auth/callback
http://localhost:3000/auth/callback
https://你的-vercel-默认域名/auth/callback
```

验收：

- 本地邮箱登录可完成。
- 线上邮箱登录可完成。
- 登录后刷新页面仍保持登录态。
- 邮件链接过期时页面显示明确错误，不白屏。

## 4. Supabase 数据库

确认已经执行最新 SQL：

- `supabase/schema.sql`
- `supabase/migrations/20260703_push_pull_squat.sql`
- `supabase/migrations/20260704_feedback_reports.sql`
- `supabase/migrations/20260704_analytics_events.sql`

验收：

- `exercises` 可读。
- `athlete_profiles` 只读写本人数据。
- `programs`、`workouts`、`workout_exercises`、`set_logs` 只读写本人数据。
- `recommendations` 只读写本人数据。
- `pr_goals` 只读写本人数据。
- `feedback_reports` 可提交并只读本人反馈。
- `analytics_events` 可写入本人关键行为事件。

### 休息日与计划重建追加验收

- 执行 `20260715110000_rest_day_schedule_and_program_replacement.sql` 前完成备份，并在 SQL Editor 记录 UTC 时间。
- cadence 与固定星期计划同时存在 `day_type='training'` 与 `day_type='rest'`；自由排程不产生虚构休息日。
- 用以下查询按排程模式确认两种日程类型（`cadence` 与 `fixed_weekdays` 均必须返回两种 `day_type`）：

```sql
select p.schedule_mode, w.day_type, count(*) as schedule_items
from public.programs p
join public.workouts w on w.program_id = p.id
where p.schedule_mode in ('cadence', 'fixed_weekdays')
group by p.schedule_mode, w.day_type
order by p.schedule_mode, w.day_type;
```
- 验证休息日没有动作处方：

```sql
select count(*) as rest_exercise_rows
from public.workout_exercises we
join public.workouts w on w.id = we.workout_id
where w.day_type = 'rest';
```

结果必须为 `0`。

- 重新生成在确认前不写入；有效确认后新计划先完整插入再归档旧计划；无效载荷后旧活动计划仍可用。
- 休息日只能由本人、在当天、且状态为 `scheduled` 或 `draft` 时完成一次；完成休息不改变训练量、e1RM、PR、推荐或力量完成率。
- 线上执行 `BASE_URL=https://你的-vercel-默认域名 pnpm vitest run scripts/rest-day-smoke.test.mjs`。

## 5. 邮件发送

MVP 内测早期可以先用 Supabase 默认邮件，但如果继续出现 `email rate limit exceeded`，必须配置自定义 SMTP。

推荐路径：

- Resend
- Postmark
- SendGrid

验收：

- 连续 3 个测试邮箱能收到登录邮件。
- 邮件链接能跳回线上 `/auth/callback`。
- Gmail 复制跳转链接后，粘贴登录入口也能完成登录。

## 6. 功能冒烟测试

用一个全新测试邮箱从头跑：

1. 登录。
2. 创建训练画像。
3. 生成 4 周计划。
4. 打开今日训练。
5. 填写并保存草稿。
6. 刷新页面，确认草稿恢复。
7. 完成训练。
8. 查看历史记录。
9. 修改一组历史记录并保存。
10. 查看进展页，确认训练量和 e1RM 更新。
11. 打开计划页，应用或修改后应用 Coach 建议。
12. 创建多个 PR 目标。
13. 导出 CSV，确认只包含已完成训练。
14. 提交一条内测反馈。
15. 退出登录。

## 7. 错误监控

MVP 最低要求：

- Next.js 全局错误页已存在。
- Vercel 部署日志可查看。
- `/api/health` 返回 `ok: true`。
- `analytics_events` 至少记录生成计划、保存/完成训练、PR、CSV 导出、反馈提交这些关键事件。

建议内测前接入：

- Sentry 免费项目。
- 记录前端异常和页面路径。

## 8. 备份策略

Supabase 免费项目需要主动确认备份能力。内测期间最低策略：

- 每周手动导出一次数据库快照。
- 每次大改 SQL 前导出一次快照。
- 用户训练记录可通过 `/settings` 导出 CSV。
- 数据库发布按 `docs/12_database_release_runbook.md` 执行。

记录：

```text
最近一次数据库备份时间：
备份文件位置：
负责人：
```

## 9. 内测发布标准

全部满足后才算 MVP 可内测：

- 本地构建通过。
- Vercel 部署通过。
- 线上登录通过。
- 线上完整冒烟测试通过。
- CSV 导出正确。
- 免责声明可见。
- 至少有一套备份流程。
- 发现错误时能通过 Vercel 日志定位。
