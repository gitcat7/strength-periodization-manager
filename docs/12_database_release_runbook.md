# 数据库发布与备份手册

用途：每次修改 Supabase 数据库前后按这个流程执行，降低一个人维护时误操作风险。

## 1. 发布前备份

在 Supabase Dashboard 执行任一方式：

- Table Editor 逐表导出 CSV。
- SQL Editor 导出核心表。
- 如果项目已升级到支持 Point-in-Time Recovery 的套餐，确认恢复点可用。

核心表：

- `cfg_exercises`
- `usr_athlete_profiles`
- `usr_lift_profiles`
- `plan_programs`
- `plan_workouts`
- `plan_workout_exercises`
- `log_set_logs`
- `log_recommendations`
- `log_pr_goals`
- `ops_feedback_reports`
- `ops_analytics_events`
- `ops_agent_access_tokens`

备份记录：

```text
备份时间：
备份方式：
备份文件位置：
执行人：
```

## 2. SQL 执行顺序

### 云端结构变更与迁移同步

任何在 Supabase Dashboard、SQL Editor 或运维工具执行的表、索引、RLS、函数或 RPC 优化，都必须先写入或同步写入仓库的 `supabase/migrations/<唯一版本>_<说明>.sql`。禁止只在云端修改而不留下 migration；这会造成环境漂移，后续本地、预览和生产无法可靠复现。

执行前后在 Supabase Dashboard 的 SQL Editor 或 CLI migration history 核对已应用版本，并与仓库迁移文件列表逐项比对。发现云端版本缺失时，先补充描述该实际变更的 migration 并代码审查，再继续任何依赖该结构的发布；不要猜测数据库状态或直接修改用户业务数据。

首次部署或重建：

1. 执行 `supabase/schema.sql`
2. 执行 `supabase/migrations/20260703_push_pull_squat.sql`
3. 执行 `supabase/migrations/20260704_feedback_reports.sql`
4. 执行 `supabase/migrations/20260704_analytics_events.sql`
5. 执行 `supabase/migrations/20260711_agent_access_tokens.sql`
6. 执行 `supabase/migrations/20260715090000_sequence_scheduling_foundation.sql`
7. 执行 `supabase/migrations/20260715100000_program_templates_and_scheduling.sql`
8. 执行 `supabase/migrations/20260715110000_rest_day_schedule_and_program_replacement.sql`

日常发布：

1. 先读 SQL，确认是否含 destructive 操作。
2. 对 `20260725120000_database_schema_organization.sql`，先完成备份并安排短维护窗口：表改名会获取对象锁，但不会复制或删除数据。
3. 先在 Supabase SQL Editor 手动执行。
4. 执行后立即打开 `/diagnostics`。

### 顺序日历排程第一期（20260730100000）

该期迁移文件为 `supabase/migrations/20260730100000_sequence_calendar_scheduling.sql`。它新增排程版本、节假日策略、日历/不可训练日/审计事件表，并更新 `replace_active_program` 与 `reflow_program_schedule`。发布顺序必须如下：

1. 完成第 1 节备份并记录备份时间；本次至少应能恢复 `plan_programs`、`plan_workouts`、`plan_workout_exercises`、`usr_unavailable_dates` 和 `ops_schedule_events`。
2. 在生产 SQL Editor 一次执行该唯一迁移；保存 SQL Editor 成功记录。若执行失败，停止前端部署，保留报错和备份，不要手工执行迁移中的部分语句。
3. 确认迁移成功后部署与该迁移匹配的固定前端提交；未确认前禁止部署依赖新排程字段/RPC 的前端。

随后执行 `supabase/migrations/20260809010000_defer_reflow_schedule_index_constraint.sql`。该补丁将 `(program_id, schedule_index)` 的唯一约束设为 `DEFERRABLE INITIALLY DEFERRED`，使一次原子 reflow 中的相邻索引互换不会在中间更新时触发重复键；事务结束时仍严格保证唯一。执行后可用以下查询确认：

```sql
select conname, condeferrable, condeferred
from pg_constraint
where conrelid = 'public.plan_workouts'::regclass
  and contype = 'u'
  and pg_get_constraintdef(oid) like 'UNIQUE (program_id, schedule_index)%';
```

预期 `condeferrable` 与 `condeferred` 均为 `true`。若不符合，停止部署，先恢复该约束的正确状态；不要删除已有训练记录。
4. 部署后用普通权限的专用 QA 账号，按 `docs/11_mvp_release_checklist.md` 运行 `scripts/sequence-calendar-smoke.test.mjs`。缺少 QA 凭据时必须标记为未完成，不能用 service-role 或 SQL Editor 身份替代。
5. 在本地 Docker/Supabase 已就绪时运行 `pnpm test:db:sequence` 验证本期 pgTAP。该专用脚本固定指向 `supabase/tests/sequence_calendar_scheduling.test.sql`；不要执行 `pnpm test:db -- --file ...`，旧命令的位置参数不接受 `--file`。

迁移后验证（在 SQL Editor 运行；查询不输出用户训练组明细）：

```sql
-- 活动计划具备并递增排程版本，节假日策略和时区受约束。
select id, schedule_revision, holiday_policy, timezone, status
from public.plan_programs
where status = 'active'
order by updated_at desc
limit 20;

-- 恢复策略跳过只允许使用明确原因，且不会混入已完成记录。
select status, skip_reason, count(*) as workout_count
from public.plan_workouts
where skip_reason is not null
group by status, skip_reason
order by status, skip_reason;

-- 每次重排只产生一条可审计事件；版本与计划当前版本可关联核验。
select e.program_id, e.event_type, e.schedule_revision, e.effective_date, e.created_at
from public.ops_schedule_events e
order by e.created_at desc
limit 50;

-- 浏览器角色只能读法定日历，用户数据表都启用 RLS。
select c.relname, c.relrowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('cfg_cn_calendar_dates', 'usr_unavailable_dates', 'ops_schedule_events')
order by c.relname;

select tablename, policyname, roles, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('cfg_cn_calendar_dates', 'usr_unavailable_dates', 'ops_schedule_events')
order by tablename, policyname;
```

预期：三个表均 `relrowsecurity = true`；`cfg_cn_calendar_dates` 仅有已登录用户的 `select` 策略，`usr_unavailable_dates` 和 `ops_schedule_events` 的读写策略均以 `auth.uid() = user_id` 隔离。

### P1 单次训练时长（30 分钟）迁移

在发布包含 30 分钟训练预算的前端前，先在 SQL Editor 执行
`supabase/migrations/20260729000000_session_duration_30_minutes.sql`。该迁移只替换时长校验，保留已有的 45、60、75、90 分钟资料；75 分钟资料会在应用中按 60 分钟标准预算兼容处理。执行后验证：

```sql
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.usr_athlete_profiles'::regclass
  and conname = 'usr_athlete_profiles_session_duration_minutes_check';
```

### 生产分支对账时长约束（20260810010000）

两条生产分支都曾调整单次训练时长约束。发布对账版本前，必须执行唯一新迁移
`supabase/migrations/20260810010000_reconcile_session_duration_choices.sql`，使 30 分钟处方预算与
checkpoint 的 45–180 分钟档位同时有效。迁移会兼容删除两种历史约束名，再建立统一约束。

```sql
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.usr_athlete_profiles'::regclass
  and conname = 'athlete_profiles_session_duration_minutes_check';
```

预期允许 `30, 45, 60, 75, 90, 120, 150, 180`。用户未确认该迁移成功前，禁止部署对账前端。

表前缀迁移后，旧表名保留为仅供读取的兼容视图；新应用代码必须只访问带前缀的物理表。不要向旧名称写入，也不要在验证完成前删除这些兼容视图。

结构与备注验收（不读取用户训练数据）：

```sql
select c.relname, c.relkind, obj_description(c.oid, 'pg_class') as description
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('cfg_exercises', 'plan_workouts', 'log_set_logs', 'ops_agent_access_tokens', 'exercises', 'workouts')
order by c.relname;
```

预期：带前缀的对象 `relkind` 为 `r`（表）且有说明；旧名称的对象 `relkind` 为 `v`（兼容视图）。

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

休息日与原子重建验收（使用两个无邮箱、无令牌、无原始 UUID 的测试账号）：

- 提交不合法 `replace_active_program` 载荷，确认旧 `active` 计划未归档。
- 提交有效载荷，确认新计划、训练处方和休息日先出现，旧计划随后为 `archived`。
- 对休息日打卡一次后状态为 `completed`，第二次更新返回零行；另一账号无法更新该日程。
- 确认 cadence 或固定星期计划有两种 `day_type`，且休息日动作数为零：

```sql
select p.schedule_mode, w.day_type, count(*) as schedule_items
from public.programs p
join public.workouts w on w.program_id = p.id
where p.schedule_mode in ('cadence', 'fixed_weekdays')
group by p.schedule_mode, w.day_type
order by p.schedule_mode, w.day_type;

select count(*)
from public.workout_exercises we
join public.workouts w on w.id = we.workout_id
where w.day_type = 'rest';
```

- 完成休息日前后比较训练量、e1RM、PR、推荐和 CSV 的训练汇总；它们不得变化。

## 4. RLS 验收

确认以下带前缀物理表已开启 RLS：

- `usr_athlete_profiles`
- `usr_lift_profiles`
- `plan_programs`
- `plan_workouts`
- `plan_workout_exercises`
- `log_set_logs`
- `log_recommendations`
- `log_pr_goals`
- `ops_feedback_reports`
- `ops_analytics_events`
- `cfg_exercises`
- `ops_agent_access_tokens`

策略原则：

- `cfg_exercises` 允许已登录用户读取。
- 所有用户数据表只允许 `auth.uid() = user_id` 的用户访问。
- `plan_workout_exercises` 和 `log_set_logs` 通过所属训练单元间接判断用户。
- `ops_feedback_reports` 允许登录用户创建和读取自己的反馈。
- `ops_analytics_events` 允许登录用户创建和读取自己的行为事件。
- `ops_agent_access_tokens` 只允许用户管理自己的令牌元数据，匿名角色无权读取；数据库只保存 SHA-256 哈希，不保存原始令牌。

## 5. 回滚策略

如果发布后出现严重错误：

1. 暂停继续使用应用。
2. 记录错误页面、时间、用户邮箱、操作路径。
3. 用最近备份恢复受影响表。
4. 如仅是前端错误，优先回滚 Vercel 部署。
5. 恢复后重新执行 `/api/health`、`pnpm smoke` 或线上 `BASE_URL=... pnpm smoke`。

顺序日历排程的回滚补充：该迁移涉及已创建的计划和审计记录，不能通过删除列或删除表“回滚”。若生产出现问题，先将 Vercel 回退到最后一个不依赖排程 RPC 的稳定前端版本，并暂停新的排程调整；随后基于本次发布前备份和已记录的 `ops_schedule_events` 制定数据修复方案。任何数据恢复或补偿均需先在非生产环境演练，并保留用户已完成训练记录。

## 6. 内测期间节奏

- 每次改 schema 前备份。
- 每周固定备份一次。
- 每次内测用户批量导入或清理数据前备份。
- 不在疲劳或赶时间时执行数据库结构变更。

## 7. 结构化动作限制迁移（2026-07-29）

1. 在 Supabase SQL Editor 执行 `supabase/migrations/20260729150000_add_structured_movement_restrictions.sql`。
2. 迁移只向 `usr_athlete_profiles` 追加 `movement_restrictions text[]`，默认空数组；不会解读或改写既有 `injury_notes`。
3. 迁移后创建或更新一份训练画像，选择一项动作限制并确认保存成功；自由文本备注仍应只显示为备注。
4. 再部署前端。若未执行迁移，前端会因缺少列无法安全保存画像，应先完成本迁移而非绕过限制字段。
## 8. 计划日动作编辑迁移（2026-08-10）

迁移文件：`supabase/migrations/20260810110000_revise_workout_prescription.sql`。

1. 先在非生产环境执行并运行 `pnpm test:db:prescription`（或直接执行 `pnpm dlx supabase@2.34.3 test db supabase/tests/revise_workout_prescription.test.sql --local`），确认 pgTAP 全部通过。
2. 在 Supabase SQL Editor 一次执行该唯一迁移；它新增 `plan_workouts.prescription_revision`、`ops_workout_revision_events` 及 `revise_workout_prescription(uuid, integer, jsonb)`，不回填或改写既有训练记录。
3. 迁移成功后用 SQL 验证：

```sql
select column_name, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'plan_workouts'
  and column_name = 'prescription_revision';

select has_function_privilege('anon', 'public.revise_workout_prescription(uuid, integer, jsonb)', 'execute') as anon_can_execute,
       has_function_privilege('authenticated', 'public.revise_workout_prescription(uuid, integer, jsonb)', 'execute') as authenticated_can_execute;
```

预期 `anon_can_execute=false`、`authenticated_can_execute=true`。浏览器只调用该 RPC；不得直接拼接多次动作表写入。RPC 会锁定当前用户 active program 的 scheduled/draft training day，检查版本、动作方向、本地 cfg_exercises、动作数量/顺序/组次/次数/重量，并在任一校验失败时整事务回滚。

4. 用户确认迁移成功且测试窗口明确“验证通过”前，禁止部署依赖该 RPC 的前端。迁移没有向后兼容的降级写路径；如发布异常，先回滚 Vercel 到不展示编辑入口的固定前端，再保留新增列/审计表和历史数据，禁止直接删除列或表。

# wger 外部动作引用发布顺序（2026-07-16）

1. 在 Supabase SQL Editor 执行 `supabase/migrations/20260716130000_wger_external_exercise_references.sql`；它仅追加字段、约束和 RPC，不会复制第三方动作目录。
2. 在 Vercel Production 与 Preview 设置可选环境变量 `WGER_API_BASE_URL=https://wger.de/api/v2/`；不需要 wger token。未设置时使用同一官方默认地址。
3. 部署代码后，登录并在“记录今日训练”中搜索、添加一个 wger 动作，保存草稿、刷新并完成；确认历史与 CSV 显示名称和 `wger` provider/ID。
4. 临时阻断上游时，确认动作搜索可重试，且已选动作和训练组仍保留；再确认本地推/拉/蹲计划、替代和 PR 不依赖 wger。

# 本地 QA 浏览器登录（不属于发布配置）

仅为本机内置浏览器验收时，可在未提交的 `.env.local` 中设置 `DEV_BROWSER_QA_EMAIL` 与 `DEV_BROWSER_QA_PASSWORD`，用 `pnpm dev` 启动后再访问 `/qa-login?next=/history`。该命令只绑定 `127.0.0.1`，不可改为 `--hostname 0.0.0.0`。两项变量绝不填入 Vercel、Supabase Dashboard 或仓库；该入口仅 localhost/127.0.0.1 的 development 服务有效，生产与 Preview 会返回 404。QA 账号保持普通用户权限，仍由 RLS 隔离数据。
