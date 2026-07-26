-- Reorganize public tables without copying rows so deployed projects retain every UUID,
-- foreign key, RLS rule, and training record.
do $$
declare
  mapping record;
begin
  for mapping in
    select *
    from (values
      ('athlete_profiles', 'usr_athlete_profiles'),
      ('exercises', 'cfg_exercises'),
      ('lift_profiles', 'usr_lift_profiles'),
      ('programs', 'plan_programs'),
      ('workouts', 'plan_workouts'),
      ('workout_exercises', 'plan_workout_exercises'),
      ('set_logs', 'log_set_logs'),
      ('recommendations', 'log_recommendations'),
      ('pr_goals', 'log_pr_goals'),
      ('feedback_reports', 'ops_feedback_reports'),
      ('analytics_events', 'ops_analytics_events'),
      ('agent_access_tokens', 'ops_agent_access_tokens')
    ) as names(old_name, new_name)
  loop
    if to_regclass('public.' || mapping.old_name) is not null
      and exists (
        select 1 from pg_class
        where oid = to_regclass('public.' || mapping.old_name)
          and relkind = 'r'
      )
      and to_regclass('public.' || mapping.new_name) is null then
      execute format('alter table public.%I rename to %I', mapping.old_name, mapping.new_name);
    end if;
  end loop;
end;
$$;

-- Older deployed databases can predate this audit column. Preserve the original
-- creation time for historical rows, then let the common trigger maintain it.
alter table public.plan_workout_exercises
  add column if not exists updated_at timestamptz;

update public.plan_workout_exercises
set updated_at = created_at
where updated_at is null;

alter table public.plan_workout_exercises
  alter column updated_at set default now(),
  alter column updated_at set not null;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  relation_name text;
begin
  foreach relation_name in array array[
    'usr_athlete_profiles', 'usr_lift_profiles', 'plan_programs',
    'plan_workouts', 'plan_workout_exercises', 'log_set_logs',
    'log_recommendations', 'log_pr_goals', 'ops_feedback_reports'
  ]
  loop
    if to_regclass('public.' || relation_name) is not null
      and exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = relation_name
          and column_name = 'updated_at'
      ) then
      execute format('drop trigger if exists %I on public.%I', relation_name || '_set_updated_at', relation_name);
      execute format(
        'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
        relation_name || '_set_updated_at',
        relation_name
      );
    end if;
  end loop;
end;
$$;

create index if not exists plan_programs_user_status_idx
  on public.plan_programs (user_id, status);
create index if not exists plan_workouts_user_status_scheduled_idx
  on public.plan_workouts (user_id, status, scheduled_date desc);
create index if not exists plan_workouts_program_schedule_idx
  on public.plan_workouts (program_id, schedule_index);
create unique index if not exists plan_workout_exercises_workout_order_key
  on public.plan_workout_exercises (workout_id, order_index);
create index if not exists log_recommendations_user_status_created_idx
  on public.log_recommendations (user_id, status, created_at desc);
create index if not exists log_pr_goals_user_status_target_idx
  on public.log_pr_goals (user_id, status, target_date);
create index if not exists ops_analytics_events_user_created_idx
  on public.ops_analytics_events (user_id, created_at desc);

comment on function public.set_updated_at() is '统一维护含 updated_at 字段记录的最后更新时间（带时区的完整年月日时分秒）。';

comment on table public.cfg_exercises is '共享动作目录：系统审核的动作定义，不存储个人训练事实。';
comment on table public.usr_athlete_profiles is '用户训练画像：用于生成计划的个人偏好与训练背景。';
comment on table public.usr_lift_profiles is '用户动作能力基线：估算 1RM 与训练最大重量。';
comment on table public.plan_programs is '训练计划主表：一个用户的一段周期化计划。';
comment on table public.plan_workouts is '计划日程：计划内、休息日或自由训练的单次训练单元。';
comment on table public.plan_workout_exercises is '训练动作处方：一个训练单元内的动作及目标。';
comment on table public.log_set_logs is '训练组日志：每个动作组的目标与实际完成情况。';
comment on table public.log_recommendations is '训练建议日志：基于训练表现生成的重量调整建议。';
comment on table public.log_pr_goals is '个人纪录目标：动作的目标重量与日期。';
comment on table public.ops_feedback_reports is '运营反馈：用户提交的产品问题与建议。';
comment on table public.ops_analytics_events is '运营埋点：匿名或已登录用户的产品事件。';
comment on table public.ops_agent_access_tokens is '代理访问令牌元数据：仅保存 SHA-256 哈希，绝不保存原始令牌。';

comment on column public.cfg_exercises.id is '动作主键 UUID。';
comment on column public.cfg_exercises.slug is '稳定的动作机器标识，目录内唯一。';
comment on column public.cfg_exercises.name is '面向用户展示的动作名称。';
comment on column public.cfg_exercises.category is '动作训练类别。';
comment on column public.cfg_exercises.default_increment is '默认加重步长，单位 kg。';
comment on column public.cfg_exercises.is_main_lift is '是否为计划中的主要力量动作。';
comment on column public.cfg_exercises.catalog_external_id is '外部动作目录标识；为空表示无外部映射。';
comment on column public.cfg_exercises.training_direction is '训练方向：push、pull、squat 或 cardio。';
comment on column public.cfg_exercises.movement_pattern is '动作模式，例如 horizontal_press。';
comment on column public.cfg_exercises.substitution_enabled is '是否允许在计划中用作动作替代项。';
comment on column public.cfg_exercises.created_at is '目录记录创建时刻，timestamptz，精确到年月日时分秒并保留时区。';

comment on column public.usr_athlete_profiles.id is '训练画像主键 UUID。';
comment on column public.usr_athlete_profiles.user_id is '所属 auth.users 用户 UUID。';
comment on column public.usr_athlete_profiles.experience_level is '训练经验等级。';
comment on column public.usr_athlete_profiles.goal is '训练目标分类。';
comment on column public.usr_athlete_profiles.training_days_per_week is '每周计划训练天数。';
comment on column public.usr_athlete_profiles.available_weekdays is '可训练星期数组，1 至 7。';
comment on column public.usr_athlete_profiles.session_duration_minutes is '单次训练可用分钟数。';
comment on column public.usr_athlete_profiles.injury_notes is '用户主动提供的伤病或限制说明。';
comment on column public.usr_athlete_profiles.unit is '重量单位；产品固定为 kg。';
comment on column public.usr_athlete_profiles.created_at is '画像创建时刻，timestamptz。';
comment on column public.usr_athlete_profiles.updated_at is '画像最后更新时刻，timestamptz，由触发器维护。';

comment on column public.usr_lift_profiles.id is '能力基线主键 UUID。';
comment on column public.usr_lift_profiles.user_id is '所属 auth.users 用户 UUID。';
comment on column public.usr_lift_profiles.exercise_id is '关联 cfg_exercises 动作 UUID。';
comment on column public.usr_lift_profiles.estimated_1rm is '估算单次最大重量，单位 kg。';
comment on column public.usr_lift_profiles.training_max is '计划计算使用的训练最大重量，单位 kg。';
comment on column public.usr_lift_profiles.source_type is '能力数据来源类型。';
comment on column public.usr_lift_profiles.created_at is '能力基线创建时刻，timestamptz。';
comment on column public.usr_lift_profiles.updated_at is '能力基线最后更新时刻，timestamptz。';

comment on column public.plan_programs.id is '训练计划主键 UUID。';
comment on column public.plan_programs.user_id is '计划所属 auth.users 用户 UUID。';
comment on column public.plan_programs.name is '用户可见的计划名称。';
comment on column public.plan_programs.template_type is '计划模板或分化类型。';
comment on column public.plan_programs.schedule_mode is '日程生成模式。';
comment on column public.plan_programs.schedule_config is '日程配置 JSON 对象，结构由 schedule_mode 决定。';
comment on column public.plan_programs.custom_template_name is '自定义模板名称；非自定义计划可为空。';
comment on column public.plan_programs.status is '计划状态：draft、active、completed 或 archived。';
comment on column public.plan_programs.start_date is '计划开始日，date，仅表示年月日，不含时分秒。';
comment on column public.plan_programs.end_date is '计划结束日，date，仅表示年月日，不含时分秒。';
comment on column public.plan_programs.created_at is '计划创建时刻，timestamptz。';
comment on column public.plan_programs.updated_at is '计划最后更新时刻，timestamptz。';

comment on column public.plan_workouts.id is '训练单元主键 UUID。';
comment on column public.plan_workouts.program_id is '所属 plan_programs UUID；自由训练可为空。';
comment on column public.plan_workouts.user_id is '训练单元所属 auth.users 用户 UUID。';
comment on column public.plan_workouts.scheduled_date is '训练安排日，date，仅表示年月日；不是事件时刻。';
comment on column public.plan_workouts.sequence_index is '训练日顺序；休息日为空。';
comment on column public.plan_workouts.schedule_index is '计划日程顺序，包含休息日。';
comment on column public.plan_workouts.day_type is '日程类型：training 或 rest。';
comment on column public.plan_workouts.name is '用户可见的训练名称。';
comment on column public.plan_workouts.status is '训练状态：scheduled、draft、completed 或 skipped。';
comment on column public.plan_workouts.completed_at is '训练实际完成时刻，timestamptz，精确到年月日时分秒并保留时区。';
comment on column public.plan_workouts.created_at is '训练单元创建时刻，timestamptz。';
comment on column public.plan_workouts.updated_at is '训练单元最后更新时刻，timestamptz。';

comment on column public.plan_workout_exercises.id is '训练动作处方主键 UUID。';
comment on column public.plan_workout_exercises.workout_id is '所属 plan_workouts 训练单元 UUID。';
comment on column public.plan_workout_exercises.exercise_id is '本地 cfg_exercises 动作 UUID；外部动作快照时为空。';
comment on column public.plan_workout_exercises.exercise_provider is '外部动作提供方，例如 wger、reviewed 或 manual。';
comment on column public.plan_workout_exercises.external_exercise_id is '外部或快照动作的提供方标识。';
comment on column public.plan_workout_exercises.exercise_name_snapshot is '外部或手动动作在记录时的名称快照。';
comment on column public.plan_workout_exercises.exercise_metadata_snapshot is '外部或手动动作的经验证元数据 JSON 对象快照。';
comment on column public.plan_workout_exercises.order_index is '动作在该训练单元内的显示与执行顺序。';
comment on column public.plan_workout_exercises.target_sets is '目标训练组数。';
comment on column public.plan_workout_exercises.target_reps is '每组目标次数。';
comment on column public.plan_workout_exercises.target_weight is '每组目标重量，单位 kg。';
comment on column public.plan_workout_exercises.created_at is '训练动作处方创建时刻，timestamptz。';
comment on column public.plan_workout_exercises.updated_at is '训练动作处方最后更新时刻，timestamptz。';

comment on column public.log_set_logs.id is '训练组日志主键 UUID。';
comment on column public.log_set_logs.workout_exercise_id is '所属 plan_workout_exercises UUID。';
comment on column public.log_set_logs.set_index is '动作内训练组序号，从 1 开始。';
comment on column public.log_set_logs.target_weight is '目标重量，单位 kg。';
comment on column public.log_set_logs.target_reps is '目标次数。';
comment on column public.log_set_logs.actual_weight is '实际完成重量，单位 kg；未完成可为空。';
comment on column public.log_set_logs.actual_reps is '实际完成次数；未完成可为空。';
comment on column public.log_set_logs.rpe is '主观用力程度，1 到 10；允许为空。';
comment on column public.log_set_logs.completed is '该训练组是否确认完成。';
comment on column public.log_set_logs.created_at is '训练组日志创建时刻，timestamptz。';
comment on column public.log_set_logs.updated_at is '训练组日志最后更新时刻，timestamptz。';

comment on column public.log_recommendations.id is '训练建议主键 UUID。';
comment on column public.log_recommendations.user_id is '建议所属 auth.users 用户 UUID。';
comment on column public.log_recommendations.exercise_id is '关联 cfg_exercises 动作 UUID。';
comment on column public.log_recommendations.workout_id is '触发建议的 plan_workouts UUID；可为空。';
comment on column public.log_recommendations.recommendation_type is '建议类型：increase、hold、decrease 或 deload。';
comment on column public.log_recommendations.previous_weight is '调整前参考重量，单位 kg。';
comment on column public.log_recommendations.suggested_weight is '建议使用的重量，单位 kg。';
comment on column public.log_recommendations.reason is '建议生成原因说明。';
comment on column public.log_recommendations.status is '用户处理状态。';
comment on column public.log_recommendations.created_at is '建议生成时刻，timestamptz。';
comment on column public.log_recommendations.updated_at is '建议最后更新时刻，timestamptz。';

comment on column public.log_pr_goals.id is '个人纪录目标主键 UUID。';
comment on column public.log_pr_goals.user_id is '目标所属 auth.users 用户 UUID。';
comment on column public.log_pr_goals.exercise_id is '目标关联 cfg_exercises 动作 UUID。';
comment on column public.log_pr_goals.current_estimated_1rm is '设定目标时的估算 1RM，单位 kg。';
comment on column public.log_pr_goals.target_weight is '目标重量，单位 kg。';
comment on column public.log_pr_goals.target_date is '目标日期，date，仅表示年月日。';
comment on column public.log_pr_goals.status is '目标状态：active、completed 或 cancelled。';
comment on column public.log_pr_goals.created_at is '目标创建时刻，timestamptz。';
comment on column public.log_pr_goals.updated_at is '目标最后更新时刻，timestamptz。';

comment on column public.ops_feedback_reports.id is '反馈主键 UUID。';
comment on column public.ops_feedback_reports.user_id is '提交反馈的 auth.users 用户 UUID；匿名反馈可为空。';
comment on column public.ops_feedback_reports.email is '用户主动填写的联系邮箱。';
comment on column public.ops_feedback_reports.category is '反馈分类。';
comment on column public.ops_feedback_reports.message is '反馈正文。';
comment on column public.ops_feedback_reports.page_path is '反馈提交时的页面路径。';
comment on column public.ops_feedback_reports.user_agent is '反馈提交时的浏览器标识。';
comment on column public.ops_feedback_reports.status is '运营处理状态。';
comment on column public.ops_feedback_reports.created_at is '反馈创建时刻，timestamptz。';
comment on column public.ops_feedback_reports.updated_at is '反馈最后更新时刻，timestamptz。';

comment on column public.ops_analytics_events.id is '埋点事件主键 UUID。';
comment on column public.ops_analytics_events.user_id is '事件关联的 auth.users 用户 UUID；匿名事件可为空。';
comment on column public.ops_analytics_events.event_name is '事件机器名称。';
comment on column public.ops_analytics_events.properties is '事件属性 JSON 对象。';
comment on column public.ops_analytics_events.page_path is '事件发生页面路径。';
comment on column public.ops_analytics_events.created_at is '事件发生时刻，timestamptz。';

comment on column public.ops_agent_access_tokens.id is '令牌元数据主键 UUID。';
comment on column public.ops_agent_access_tokens.user_id is '令牌所属 auth.users 用户 UUID。';
comment on column public.ops_agent_access_tokens.name is '用户设置的令牌名称。';
comment on column public.ops_agent_access_tokens.token_hash is '原始令牌的 SHA-256 哈希；绝不存储原始令牌。';
comment on column public.ops_agent_access_tokens.last_used_at is '令牌最后使用时刻，timestamptz。';
comment on column public.ops_agent_access_tokens.expires_at is '令牌过期时刻，timestamptz。';
comment on column public.ops_agent_access_tokens.revoked_at is '令牌撤销时刻，timestamptz；未撤销为空。';
comment on column public.ops_agent_access_tokens.created_at is '令牌创建时刻，timestamptz。';

create or replace view public.athlete_profiles with (security_invoker = true) as select * from public.usr_athlete_profiles;
create or replace view public.exercises with (security_invoker = true) as select * from public.cfg_exercises;
create or replace view public.lift_profiles with (security_invoker = true) as select * from public.usr_lift_profiles;
create or replace view public.programs with (security_invoker = true) as select * from public.plan_programs;
create or replace view public.workouts with (security_invoker = true) as select * from public.plan_workouts;
create or replace view public.workout_exercises with (security_invoker = true) as select * from public.plan_workout_exercises;
create or replace view public.set_logs with (security_invoker = true) as select * from public.log_set_logs;
create or replace view public.recommendations with (security_invoker = true) as select * from public.log_recommendations;
create or replace view public.pr_goals with (security_invoker = true) as select * from public.log_pr_goals;
create or replace view public.feedback_reports with (security_invoker = true) as select * from public.ops_feedback_reports;
create or replace view public.analytics_events with (security_invoker = true) as select * from public.ops_analytics_events;
create or replace view public.agent_access_tokens with (security_invoker = true) as select * from public.ops_agent_access_tokens;

comment on view public.athlete_profiles is '兼容读取视图；新代码必须使用 usr_athlete_profiles。';
comment on view public.exercises is '兼容读取视图；新代码必须使用 cfg_exercises。';
comment on view public.lift_profiles is '兼容读取视图；新代码必须使用 usr_lift_profiles。';
comment on view public.programs is '兼容读取视图；新代码必须使用 plan_programs。';
comment on view public.workouts is '兼容读取视图；新代码必须使用 plan_workouts。';
comment on view public.workout_exercises is '兼容读取视图；新代码必须使用 plan_workout_exercises。';
comment on view public.set_logs is '兼容读取视图；新代码必须使用 log_set_logs。';
comment on view public.recommendations is '兼容读取视图；新代码必须使用 log_recommendations。';
comment on view public.pr_goals is '兼容读取视图；新代码必须使用 log_pr_goals。';
comment on view public.feedback_reports is '兼容读取视图；新代码必须使用 ops_feedback_reports。';
comment on view public.analytics_events is '兼容读取视图；新代码必须使用 ops_analytics_events。';
comment on view public.agent_access_tokens is '兼容读取视图；新代码必须使用 ops_agent_access_tokens。';

revoke insert, update, delete on public.athlete_profiles, public.exercises, public.lift_profiles,
  public.programs, public.workouts, public.workout_exercises, public.set_logs,
  public.recommendations, public.pr_goals, public.feedback_reports,
  public.analytics_events, public.agent_access_tokens from authenticated, anon;
