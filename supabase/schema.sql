create extension if not exists "pgcrypto";

create table if not exists public.usr_athlete_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  experience_level text not null check (experience_level in ('beginner', 'novice', 'intermediate')),
  goal text not null check (goal in ('strength', 'hypertrophy', 'hypertrophy_strength', 'fat_loss', 'body_recomposition')),
  training_days_per_week integer not null check (training_days_per_week in (3, 4, 7)),
  available_weekdays integer[] not null default '{}',
  session_duration_minutes integer not null check (session_duration_minutes in (45, 60, 75, 90)),
  injury_notes text,
  unit text not null default 'kg' check (unit = 'kg'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create table if not exists public.cfg_exercises (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  category text not null,
  default_increment numeric(5, 2) not null,
  is_main_lift boolean not null default false,
  catalog_external_id text unique,
  training_direction text constraint exercises_training_direction_check check (
    training_direction is null
    or training_direction in ('push', 'pull', 'squat', 'cardio')
  ),
  movement_pattern text,
  substitution_enabled boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.usr_lift_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id uuid not null references public.cfg_exercises(id),
  estimated_1rm numeric(7, 2) not null check (estimated_1rm > 0),
  training_max numeric(7, 2) not null check (training_max > 0),
  source_type text not null check (source_type in ('one_rm', 'rep_max', 'working_set', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, exercise_id)
);

create table if not exists public.plan_programs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  template_type text not null check (template_type in ('three_day_full_body', 'four_day_upper_lower', 'one_split', 'three_split', 'five_split', 'push_pull_squat', 'custom')),
  schedule_mode text not null default 'fixed_weekdays' check (schedule_mode in ('fixed_weekdays', 'cadence', 'flexible')),
  schedule_config jsonb not null default '{}'::jsonb,
  custom_template_name text,
  status text not null default 'active' check (status in ('draft', 'active', 'completed', 'archived')),
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.plan_workouts (
  id uuid primary key default gen_random_uuid(),
  program_id uuid references public.plan_programs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  scheduled_date date not null,
  sequence_index integer,
  schedule_index integer not null,
  day_type text not null default 'training' check (day_type in ('training', 'rest')),
  name text not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'draft', 'completed', 'skipped')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id, sequence_index),
  unique (program_id, schedule_index),
  check (
    (day_type = 'training' and sequence_index is not null)
    or (day_type = 'rest' and sequence_index is null)
  )
);

create table if not exists public.plan_workout_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.plan_workouts(id) on delete cascade,
  exercise_id uuid not null references public.cfg_exercises(id),
  order_index integer not null,
  target_sets integer not null check (target_sets > 0),
  target_reps integer not null check (target_reps > 0),
  target_weight numeric(7, 2) not null check (target_weight >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.log_set_logs (
  id uuid primary key default gen_random_uuid(),
  workout_exercise_id uuid not null references public.plan_workout_exercises(id) on delete cascade,
  set_index integer not null check (set_index > 0),
  target_weight numeric(7, 2) not null check (target_weight >= 0),
  target_reps integer not null check (target_reps > 0),
  actual_weight numeric(7, 2) check (actual_weight >= 0),
  actual_reps integer check (actual_reps >= 0),
  rpe numeric(3, 1) check (rpe is null or (rpe >= 1 and rpe <= 10)),
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workout_exercise_id, set_index)
);

create table if not exists public.log_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id uuid not null references public.cfg_exercises(id),
  workout_id uuid references public.plan_workouts(id) on delete set null,
  recommendation_type text not null check (recommendation_type in ('increase', 'hold', 'decrease', 'deload')),
  previous_weight numeric(7, 2) not null check (previous_weight >= 0),
  suggested_weight numeric(7, 2) not null check (suggested_weight >= 0),
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'modified', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.log_pr_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id uuid not null references public.cfg_exercises(id),
  current_estimated_1rm numeric(7, 2) not null check (current_estimated_1rm > 0),
  target_weight numeric(7, 2) not null check (target_weight > 0),
  target_date date not null,
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ops_feedback_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text,
  category text not null default 'general' check (category in ('general', 'bug', 'training_plan', 'data', 'login')),
  message text not null check (char_length(message) between 5 and 2000),
  page_path text,
  user_agent text,
  status text not null default 'open' check (status in ('open', 'reviewing', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ops_analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  event_name text not null,
  properties jsonb not null default '{}'::jsonb,
  page_path text,
  created_at timestamptz not null default now()
);

create table if not exists public.ops_agent_access_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  token_hash text not null unique check (char_length(token_hash) = 64),
  last_used_at timestamptz,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists agent_access_tokens_user_id_idx
on public.ops_agent_access_tokens (user_id, created_at desc);

insert into public.cfg_exercises (
  slug,
  name,
  category,
  default_increment,
  is_main_lift,
  catalog_external_id,
  training_direction,
  movement_pattern,
  substitution_enabled
)
values
  ('back_squat', '深蹲', 'squat', 5.00, true, '0043', 'squat', 'knee_dominant', false),
  ('bench_press', '卧推', 'push', 2.50, true, '0025', 'push', 'horizontal_press', false),
  ('deadlift', '硬拉', 'pull', 5.00, true, '0032', 'pull', 'hip_hinge', false),
  ('overhead_press', '推举', 'push', 2.50, true, '0091', 'push', 'vertical_press', true),
  ('barbell_row', '杠铃划船', 'pull', 2.50, false, '0027', 'pull', 'horizontal_pull', false),
  ('pull_up', '引体向上', 'pull', 2.50, false, '0652', 'pull', 'vertical_pull', true),
  ('lat_pulldown', '高位下拉', 'pull', 2.50, false, '2330', 'pull', 'vertical_pull', true),
  ('romanian_deadlift', '罗马尼亚硬拉', 'squat', 5.00, false, '0085', 'squat', 'hip_hinge', true),
  ('leg_press', '腿举', 'squat', 5.00, false, '0739', 'squat', 'knee_dominant', true),
  ('leg_curl', '腿弯举', 'squat', 2.50, false, '0599', 'squat', 'knee_flexion', true),
  ('incline_dumbbell_press', '上斜哑铃卧推', 'push', 2.50, false, '0314', 'push', 'horizontal_press', true),
  ('lateral_raise', '侧平举', 'push', 1.00, false, '0334', 'push', 'shoulder_abduction', true),
  ('triceps_pushdown', '绳索下压', 'push', 2.50, false, '0201', 'push', 'elbow_extension', true),
  ('seated_cable_row', '坐姿划船', 'pull', 2.50, false, '0861', 'pull', 'horizontal_pull', true),
  ('face_pull', '面拉', 'pull', 1.00, false, '0233', 'pull', 'rear_delt', true),
  ('dumbbell_curl', '哑铃弯举', 'pull', 1.00, false, '0294', 'pull', 'elbow_flexion', true),
  ('standing_calf_raise', '站姿提踵', 'squat', 2.50, false, '0605', 'squat', 'calf_raise', true),
  ('cardio_zone2', 'Zone 2 有氧', 'cardio', 0.00, false, null, 'cardio', 'aerobic_base', false),
  ('machine_chest_press', '器械推胸', 'push', 2.50, false, '0577', 'push', 'horizontal_press', true),
  ('machine_shoulder_press', '器械肩推', 'push', 2.50, false, '0603', 'push', 'vertical_press', true),
  ('cable_lateral_raise', '绳索侧平举', 'push', 1.00, false, '0178', 'push', 'shoulder_abduction', true),
  ('rope_triceps_pushdown', '绳索把手下压', 'push', 2.50, false, '0200', 'push', 'elbow_extension', true),
  ('machine_seated_row', '器械坐姿划船', 'pull', 2.50, false, '1350', 'pull', 'horizontal_pull', true),
  ('neutral_grip_lat_pulldown', '对握高位下拉', 'pull', 2.50, false, '0818', 'pull', 'vertical_pull', true),
  ('cable_reverse_fly', '绳索反向飞鸟', 'pull', 1.00, false, '0225', 'pull', 'rear_delt', true),
  ('cable_biceps_curl', '绳索弯举', 'pull', 1.00, false, '0868', 'pull', 'elbow_flexion', true),
  ('machine_hack_squat', '哈克深蹲', 'squat', 2.50, false, '0743', 'squat', 'knee_dominant', true),
  ('dumbbell_romanian_deadlift', '哑铃罗马尼亚硬拉', 'squat', 2.50, false, '1459', 'squat', 'hip_hinge', true),
  ('lying_leg_curl', '俯卧腿弯举', 'squat', 1.00, false, '0586', 'squat', 'knee_flexion', true),
  ('cable_standing_calf_raise', '绳索站姿提踵', 'squat', 2.50, false, '1375', 'squat', 'calf_raise', true),
  ('floor_crunch', '卷腹', 'cardio', 0.00, false, null, 'cardio', 'trunk_flexion', false),
  ('front_plank_twist', '平板支撑转体', 'cardio', 0.00, false, null, 'cardio', 'anti_rotation', false),
  ('burpee', '波比跳', 'cardio', 0.00, false, null, 'cardio', 'full_body', false)
on conflict (slug) do update set
  name = excluded.name,
  category = excluded.category,
  default_increment = excluded.default_increment,
  is_main_lift = excluded.is_main_lift,
  catalog_external_id = excluded.catalog_external_id,
  training_direction = excluded.training_direction,
  movement_pattern = excluded.movement_pattern,
  substitution_enabled = excluded.substitution_enabled;

alter table public.usr_athlete_profiles enable row level security;
alter table public.usr_lift_profiles enable row level security;
alter table public.plan_programs enable row level security;
alter table public.plan_workouts enable row level security;
alter table public.plan_workout_exercises enable row level security;
alter table public.log_set_logs enable row level security;
alter table public.log_recommendations enable row level security;
alter table public.log_pr_goals enable row level security;
alter table public.ops_feedback_reports enable row level security;
alter table public.ops_analytics_events enable row level security;
alter table public.ops_agent_access_tokens enable row level security;
alter table public.cfg_exercises enable row level security;

drop policy if exists "Anyone can read cfg_exercises" on public.cfg_exercises;
create policy "Anyone can read cfg_exercises"
on public.cfg_exercises for select
to authenticated
using (true);

drop policy if exists "Users manage own athlete profile" on public.usr_athlete_profiles;
create policy "Users manage own athlete profile"
on public.usr_athlete_profiles for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users manage own lift profiles" on public.usr_lift_profiles;
create policy "Users manage own lift profiles"
on public.usr_lift_profiles for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users manage own plan_programs" on public.plan_programs;
create policy "Users manage own plan_programs"
on public.plan_programs for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users manage own plan_workouts" on public.plan_workouts;
create policy "Users manage own plan_workouts"
on public.plan_workouts for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users manage own workout cfg_exercises" on public.plan_workout_exercises;
create policy "Users manage own workout cfg_exercises"
on public.plan_workout_exercises for all
to authenticated
using (
  exists (
    select 1
    from public.plan_workouts w
    where w.id = plan_workout_exercises.workout_id
      and w.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.plan_workouts w
    where w.id = plan_workout_exercises.workout_id
      and w.user_id = auth.uid()
  )
);

drop policy if exists "Users manage own set logs" on public.log_set_logs;
create policy "Users manage own set logs"
on public.log_set_logs for all
to authenticated
using (
  exists (
    select 1
    from public.plan_workout_exercises we
    join public.plan_workouts w on w.id = we.workout_id
    where we.id = log_set_logs.workout_exercise_id
      and w.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.plan_workout_exercises we
    join public.plan_workouts w on w.id = we.workout_id
    where we.id = log_set_logs.workout_exercise_id
      and w.user_id = auth.uid()
  )
);

drop policy if exists "Users manage own log_recommendations" on public.log_recommendations;
create policy "Users manage own log_recommendations"
on public.log_recommendations for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users manage own pr goals" on public.log_pr_goals;
create policy "Users manage own pr goals"
on public.log_pr_goals for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users create feedback reports" on public.ops_feedback_reports;
create policy "Users create feedback reports"
on public.ops_feedback_reports for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users read own feedback reports" on public.ops_feedback_reports;
create policy "Users read own feedback reports"
on public.ops_feedback_reports for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users create own analytics events" on public.ops_analytics_events;
create policy "Users create own analytics events"
on public.ops_analytics_events for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users read own analytics events" on public.ops_analytics_events;
create policy "Users read own analytics events"
on public.ops_analytics_events for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users manage own agent access tokens" on public.ops_agent_access_tokens;
create policy "Users manage own agent access tokens"
on public.ops_agent_access_tokens for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

revoke all on public.ops_agent_access_tokens from anon;
grant select, insert, update, delete on public.ops_agent_access_tokens to authenticated;

do $$
begin
  create type public.workout_exercise_substitution_scope as enum (
    'current_workout',
    'remaining_program'
  );
exception
  when duplicate_object then null;
end;
$$;

create or replace function public.substitute_workout_exercise(
  p_workout_exercise_id uuid,
  p_target_exercise_id uuid,
  p_scope workout_exercise_substitution_scope
)
returns table (affected_ids uuid[], affected_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_program_id uuid;
  v_source record;
  v_target record;
  v_affected_ids uuid[];
  v_affected_count integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = 'P0001';
  end if;

  select w.program_id
  into v_program_id
  from public.plan_workout_exercises as we
  join public.plan_workouts as w on w.id = we.workout_id
  join public.plan_programs as p on p.id = w.program_id
  where we.id = p_workout_exercise_id
    and w.user_id = v_user_id
    and p.user_id = v_user_id
    and w.user_id = p.user_id;

  if not found then
    raise exception 'Source exercise is not eligible for substitution' using errcode = 'P0001';
  end if;

  perform 1
  from public.plan_programs as p
  where p.id = v_program_id
    and p.user_id = v_user_id
    and p.status = 'active'
  for update;

  if not found then
    raise exception 'Source exercise is not eligible for substitution' using errcode = 'P0001';
  end if;

  select
    we.id,
    we.exercise_id,
    we.order_index,
    w.id as workout_id,
    w.program_id,
    w.scheduled_date,
    e.training_direction,
    e.movement_pattern
  into v_source
  from public.plan_workout_exercises as we
  join public.plan_workouts as w on w.id = we.workout_id
  join public.plan_programs as p on p.id = w.program_id
  join public.cfg_exercises as e on e.id = we.exercise_id
  where we.id = p_workout_exercise_id
    and p.id = v_program_id
    and p.user_id = v_user_id
    and w.user_id = v_user_id
    and w.user_id = p.user_id
    and p.status = 'active'
    and w.status in ('scheduled', 'draft')
    and we.order_index >= 3
    and e.catalog_external_id is not null
    and e.training_direction is not null
    and e.movement_pattern is not null
    and e.substitution_enabled
  for update of we, w;

  if not found then
    raise exception 'Source exercise is not eligible for substitution' using errcode = 'P0001';
  end if;

  select e.id, e.training_direction, e.movement_pattern
  into v_target
  from public.cfg_exercises as e
  where e.id = p_target_exercise_id
    and e.catalog_external_id is not null
    and e.training_direction is not null
    and e.movement_pattern is not null
    and e.substitution_enabled
  for update;

  if not found then
    raise exception 'Target exercise is not eligible for substitution' using errcode = 'P0001';
  end if;

  if v_target.id = v_source.exercise_id then
    raise exception 'Target exercise must differ from the source exercise' using errcode = 'P0001';
  end if;

  if v_target.training_direction is distinct from v_source.training_direction then
    raise exception 'Target exercise has an incompatible training direction' using errcode = 'P0001';
  end if;

  if v_target.movement_pattern is distinct from v_source.movement_pattern then
    raise exception 'Target exercise has an incompatible movement pattern' using errcode = 'P0001';
  end if;

  select array_agg(locked.id order by locked.id)
  into v_affected_ids
  from (
    select we.id
    from public.plan_workout_exercises as we
    join public.plan_workouts as w2 on w2.id = we.workout_id
    join public.plan_programs as p on p.id = w2.program_id
    join public.cfg_exercises as e on e.id = we.exercise_id
    where w2.program_id = v_source.program_id
      and p.id = v_source.program_id
      and p.user_id = v_user_id
      and p.status = 'active'
      and w2.user_id = v_user_id
      and w2.user_id = p.user_id
      and we.exercise_id = v_source.exercise_id
      and e.training_direction = v_source.training_direction
      and e.movement_pattern = v_source.movement_pattern
      and we.order_index = v_source.order_index
      and w2.status in ('scheduled', 'draft')
      and (
        (p_scope = 'current_workout' and we.id = v_source.id)
        or (
          p_scope = 'remaining_program'
          and w2.scheduled_date >= v_source.scheduled_date
        )
      )
    order by we.id
    for update of we, w2
  ) as locked;

  if v_affected_ids is null then
    raise exception 'No eligible workout cfg_exercises were found' using errcode = 'P0001';
  end if;

  perform 1
  from public.log_set_logs as sl
  where sl.workout_exercise_id = any(v_affected_ids)
  for update;

  if exists (
    select 1
    from public.log_set_logs as sl
    where sl.workout_exercise_id = any(v_affected_ids)
      and sl.completed
  ) then
    raise exception 'Completed sets cannot be substituted' using errcode = 'P0001';
  end if;

  delete from public.log_set_logs as sl
  where sl.workout_exercise_id = any(v_affected_ids)
    and not sl.completed;

  update public.plan_workout_exercises
  set
    exercise_id = v_target.id,
    target_weight = 0,
    updated_at = now()
  where id = any(v_affected_ids);

  v_affected_count := cardinality(v_affected_ids);
  return query select v_affected_ids, v_affected_count;
end;
$$;

revoke execute on function public.substitute_workout_exercise(
  uuid,
  uuid,
  workout_exercise_substitution_scope
) from public, anon;
grant execute on function public.substitute_workout_exercise(
  uuid,
  uuid,
  workout_exercise_substitution_scope
) to authenticated;

create index if not exists workouts_program_schedule_index_idx
  on public.plan_workouts (program_id, schedule_index);

drop policy if exists "Users manage own plan_workouts" on public.plan_workouts;
create policy "Users manage own plan_workouts"
on public.plan_workouts for all
to authenticated
using (
  auth.uid() = user_id
  and (
    plan_workouts.program_id is null
    or exists (
      select 1 from public.plan_programs as program
      where program.id = plan_workouts.program_id
        and program.user_id = auth.uid()
    )
  )
)
with check (
  auth.uid() = user_id
  and (
    plan_workouts.program_id is null
    or exists (
      select 1 from public.plan_programs as program
      where program.id = plan_workouts.program_id
        and program.user_id = auth.uid()
    )
  )
);

drop policy if exists "Users manage own workout cfg_exercises" on public.plan_workout_exercises;
create policy "Users manage own workout cfg_exercises"
on public.plan_workout_exercises for all
to authenticated
using (
  exists (
    select 1
    from public.plan_workouts as workout
    left join public.plan_programs as program on program.id = workout.program_id
    where workout.id = plan_workout_exercises.workout_id
      and workout.user_id = auth.uid()
      and (workout.program_id is null or program.user_id = auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.plan_workouts as workout
    left join public.plan_programs as program on program.id = workout.program_id
    where workout.id = plan_workout_exercises.workout_id
      and workout.user_id = auth.uid()
      and (workout.program_id is null or program.user_id = auth.uid())
  )
);

create or replace function public.enforce_training_workout_exercise()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.plan_workouts as workout
    where workout.id = new.workout_id and workout.day_type = 'training'
  ) then
    raise exception 'Rest schedule items cannot have exercise prescriptions' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists workout_exercises_require_training_day on public.plan_workout_exercises;
create trigger workout_exercises_require_training_day
before insert or update of workout_id on public.plan_workout_exercises
for each row execute function public.enforce_training_workout_exercise();
revoke all on function public.enforce_training_workout_exercise() from public;

create or replace function public.enforce_rest_workout_without_exercises()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.day_type = 'rest' and exists (
    select 1 from public.plan_workout_exercises as workout_exercise
    where workout_exercise.workout_id = new.id
  ) then
    raise exception 'Rest schedule items cannot have exercise prescriptions' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists rest_workouts_require_no_exercises on public.plan_workouts;
create trigger rest_workouts_require_no_exercises
before update of day_type on public.plan_workouts
for each row execute function public.enforce_rest_workout_without_exercises();
revoke all on function public.enforce_rest_workout_without_exercises() from public;

create or replace function public.ensure_continuous_workout_schedule_index()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_program_id uuid;
  v_count integer;
  v_min integer;
  v_max integer;
begin
  for v_program_id in
    select distinct candidate_program_id
    from unnest(array[
      case when tg_op in ('UPDATE', 'DELETE') then old.program_id end,
      case when tg_op in ('INSERT', 'UPDATE') then new.program_id end
    ]) as candidate_programs(candidate_program_id)
    where candidate_program_id is not null
  loop
    if exists (select 1 from public.plan_programs where id = v_program_id) then
      select count(*), min(schedule_index), max(schedule_index)
      into v_count, v_min, v_max
      from public.plan_workouts where program_id = v_program_id;
      if v_count > 0 and (v_min <> 0 or v_max <> v_count - 1) then
        raise exception 'Workout schedule_index values must be continuous from zero' using errcode = '23514';
      end if;
    end if;
  end loop;
  return null;
end;
$$;

drop trigger if exists workouts_require_continuous_schedule_index on public.plan_workouts;
create constraint trigger workouts_require_continuous_schedule_index
after insert or update of program_id, schedule_index or delete on public.plan_workouts
deferrable initially deferred
for each row execute function public.ensure_continuous_workout_schedule_index();
revoke all on function public.ensure_continuous_workout_schedule_index() from public;

create or replace function public.replace_active_program(p_payload jsonb)
returns table (
  program_id uuid,
  first_schedule_item_id uuid,
  training_days integer,
  rest_days integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_program_id uuid;
  v_first_schedule_item_id uuid;
  v_name text;
  v_template_type text;
  v_custom_template_name text;
  v_schedule_mode text;
  v_schedule_config jsonb;
  v_start_date date;
  v_end_date date;
  v_items jsonb;
  v_item jsonb;
  v_exercise jsonb;
  v_workout_id uuid;
  v_day_type text;
  v_sequence_index integer;
  v_schedule_index integer;
  v_item_count integer;
  v_training_days integer := 0;
  v_rest_days integer := 0;
  v_schedule_indexes integer[] := '{}';
  v_unique_schedule_indexes integer[];
  v_exercise_indexes integer[];
  v_exercise_index integer;
  v_exercise_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = 'P0001';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Replacement payload must be an object' using errcode = 'P0001';
  end if;
  v_name := btrim(p_payload ->> 'name');
  v_template_type := p_payload ->> 'template_type';
  v_custom_template_name := nullif(btrim(p_payload ->> 'custom_template_name'), '');
  v_schedule_mode := p_payload ->> 'schedule_mode';
  v_schedule_config := p_payload -> 'schedule_config';
  v_items := p_payload -> 'schedule_items';
  if v_name is null or v_name = ''
    or v_template_type not in ('three_day_full_body', 'four_day_upper_lower', 'one_split', 'three_split', 'five_split', 'push_pull_squat', 'custom')
    or v_schedule_mode not in ('fixed_weekdays', 'cadence', 'flexible')
    or jsonb_typeof(v_schedule_config) <> 'object'
    or jsonb_typeof(v_items) <> 'array'
    or jsonb_array_length(v_items) = 0 then
    raise exception 'Replacement payload is invalid' using errcode = 'P0001';
  end if;
  begin
    v_start_date := (p_payload ->> 'start_date')::date;
    v_end_date := (p_payload ->> 'end_date')::date;
  exception when others then
    raise exception 'Replacement payload has invalid dates' using errcode = 'P0001';
  end;
  if v_start_date is null or v_end_date is null or v_end_date < v_start_date then
    raise exception 'Replacement payload has invalid dates' using errcode = 'P0001';
  end if;
  v_item_count := jsonb_array_length(v_items);
  for v_item in select value from jsonb_array_elements(v_items) loop
    if jsonb_typeof(v_item) <> 'object'
      or jsonb_typeof(v_item -> 'scheduled_date') <> 'string'
      or nullif(btrim(v_item ->> 'name'), '') is null
      or (v_item ->> 'schedule_index') !~ '^(0|[1-9][0-9]*)$'
      or v_item ->> 'day_type' not in ('training', 'rest')
      or jsonb_typeof(v_item -> 'cfg_exercises') <> 'array' then
      raise exception 'Replacement schedule item is invalid' using errcode = 'P0001';
    end if;
    begin
      perform (v_item ->> 'scheduled_date')::date;
    exception when others then
      raise exception 'Replacement schedule item has invalid date' using errcode = 'P0001';
    end;
    v_schedule_index := (v_item ->> 'schedule_index')::integer;
    v_schedule_indexes := array_append(v_schedule_indexes, v_schedule_index);
    v_day_type := v_item ->> 'day_type';
    if v_day_type = 'training' then
      if (v_item ->> 'sequence_index') !~ '^(0|[1-9][0-9]*)$' or jsonb_array_length(v_item -> 'cfg_exercises') = 0 then
        raise exception 'Training schedule items require sequence indexes and prescriptions' using errcode = 'P0001';
      end if;
      v_training_days := v_training_days + 1;
    elsif not (v_item ? 'sequence_index' and v_item -> 'sequence_index' = 'null'::jsonb)
      or jsonb_array_length(v_item -> 'cfg_exercises') <> 0 then
      raise exception 'Rest schedule items require null sequence indexes and no prescriptions' using errcode = 'P0001';
    else
      v_rest_days := v_rest_days + 1;
    end if;
    v_exercise_indexes := '{}';
    for v_exercise in select value from jsonb_array_elements(v_item -> 'cfg_exercises') loop
      if jsonb_typeof(v_exercise) <> 'object'
        or jsonb_typeof(v_exercise -> 'exercise_id') <> 'string'
        or (v_exercise ->> 'exercise_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        or (v_exercise ->> 'order_index') !~ '^[1-9][0-9]*$'
        or (v_exercise ->> 'target_sets') !~ '^[1-9][0-9]*$'
        or (v_exercise ->> 'target_reps') !~ '^[1-9][0-9]*$'
        or jsonb_typeof(v_exercise -> 'target_weight') <> 'number'
        or (v_exercise ->> 'target_weight')::numeric < 0 then
        raise exception 'Replacement exercise prescription is invalid' using errcode = 'P0001';
      end if;
      v_exercise_id := (v_exercise ->> 'exercise_id')::uuid;
      if not exists (select 1 from public.cfg_exercises where id = v_exercise_id) then
        raise exception 'Replacement exercise does not exist' using errcode = 'P0001';
      end if;
      v_exercise_index := (v_exercise ->> 'order_index')::integer;
      if v_exercise_index = any(v_exercise_indexes) then
        raise exception 'Replacement exercise order indexes must be unique' using errcode = 'P0001';
      end if;
      v_exercise_indexes := array_append(v_exercise_indexes, v_exercise_index);
    end loop;
  end loop;
  select array_agg(distinct schedule_index order by schedule_index)
  into v_unique_schedule_indexes
  from unnest(v_schedule_indexes) as indexes(schedule_index);
  if cardinality(v_unique_schedule_indexes) <> v_item_count
    or v_unique_schedule_indexes[1] <> 0
    or v_unique_schedule_indexes[v_item_count] <> v_item_count - 1 then
    raise exception 'Replacement schedule indexes must be continuous from zero' using errcode = 'P0001';
  end if;
  perform 1 from auth.users where id = v_user_id for update;
  perform 1 from public.plan_programs where user_id = v_user_id and status = 'active' for update;
  insert into public.plan_programs (user_id, name, template_type, custom_template_name, schedule_mode, schedule_config, status, start_date, end_date)
  values (v_user_id, v_name, v_template_type, v_custom_template_name, v_schedule_mode, v_schedule_config, 'active', v_start_date, v_end_date)
  returning id into v_program_id;
  for v_item in select value from jsonb_array_elements(v_items) loop
    v_schedule_index := (v_item ->> 'schedule_index')::integer;
    v_day_type := v_item ->> 'day_type';
    v_sequence_index := case when v_day_type = 'training' then (v_item ->> 'sequence_index')::integer else null end;
    insert into public.plan_workouts (program_id, user_id, scheduled_date, sequence_index, schedule_index, day_type, name, status)
    values (v_program_id, v_user_id, (v_item ->> 'scheduled_date')::date, v_sequence_index, v_schedule_index, v_day_type, btrim(v_item ->> 'name'), 'scheduled')
    returning id into v_workout_id;
    if v_schedule_index = 0 then v_first_schedule_item_id := v_workout_id; end if;
    if v_day_type = 'training' then
      for v_exercise in select value from jsonb_array_elements(v_item -> 'cfg_exercises') loop
        insert into public.plan_workout_exercises (workout_id, exercise_id, order_index, target_sets, target_reps, target_weight)
        values (v_workout_id, (v_exercise ->> 'exercise_id')::uuid, (v_exercise ->> 'order_index')::integer, (v_exercise ->> 'target_sets')::integer, (v_exercise ->> 'target_reps')::integer, (v_exercise ->> 'target_weight')::numeric);
      end loop;
    end if;
  end loop;
  update public.plan_programs set status = 'archived', updated_at = now()
  where user_id = v_user_id and status = 'active' and id <> v_program_id;
  return query select v_program_id, v_first_schedule_item_id, v_training_days, v_rest_days;
end;
$$;

revoke execute on function public.replace_active_program(jsonb) from public, anon;
grant execute on function public.replace_active_program(jsonb) to authenticated;

-- Standalone training sessions and their drafts are owned by auth.uid().
-- The core and full-body catalog bridge rows above keep every recorder section usable.
create or replace function public.save_standalone_workout(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_workout_id uuid;
  v_item jsonb;
  v_set jsonb;
  v_exercise_id uuid;
  v_workout_exercise_id uuid;
  v_date date;
  v_status text;
  v_index integer := 0;
  v_set_index integer;
  v_seen_exercise_ids uuid[] := '{}';
  v_weight numeric;
  v_reps integer;
  v_rpe numeric;
  v_completed boolean;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = 'P0001'; end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object'
    or jsonb_typeof(p_payload -> 'cfg_exercises') <> 'array'
    or jsonb_array_length(p_payload -> 'cfg_exercises') = 0 then
    raise exception 'Standalone workout payload is invalid' using errcode = 'P0001';
  end if;
  begin v_date := (p_payload ->> 'scheduled_date')::date;
  exception when others then raise exception 'Standalone workout date is invalid' using errcode = 'P0001'; end;
  v_status := p_payload ->> 'status';
  if v_status not in ('draft', 'completed') then raise exception 'Standalone workout status is invalid' using errcode = 'P0001'; end if;

  if nullif(p_payload ->> 'workout_id', '') is not null then
    begin v_workout_id := (p_payload ->> 'workout_id')::uuid;
    exception when others then raise exception 'Standalone workout id is invalid' using errcode = 'P0001'; end;
    select workout.id into v_workout_id
    from public.plan_workouts as workout
    where workout.id = v_workout_id and workout.user_id = v_user_id
      and workout.program_id is null and workout.day_type = 'training' and workout.status = 'draft'
    for update;
    if v_workout_id is null then raise exception 'Standalone draft was not found' using errcode = 'P0001'; end if;
    update public.plan_workouts
    set scheduled_date = v_date, name = '单次训练 · ' || to_char(v_date, 'YYYY-MM-DD'), status = v_status,
      completed_at = case when v_status = 'completed' then now() else null end, updated_at = now()
    where id = v_workout_id;
    delete from public.plan_workout_exercises where workout_id = v_workout_id;
  else
    insert into public.plan_workouts (program_id, user_id, scheduled_date, sequence_index, schedule_index, day_type, name, status, completed_at)
    values (null, v_user_id, v_date, 0, 0, 'training', '单次训练 · ' || to_char(v_date, 'YYYY-MM-DD'), v_status,
      case when v_status = 'completed' then now() else null end)
    returning id into v_workout_id;
  end if;

  for v_item in select value from jsonb_array_elements(p_payload -> 'cfg_exercises') loop
    if jsonb_typeof(v_item) <> 'object' or jsonb_typeof(v_item -> 'sets') <> 'array'
      or jsonb_array_length(v_item -> 'sets') = 0 then
      raise exception 'Standalone exercise is invalid' using errcode = 'P0001';
    end if;
    begin v_exercise_id := (v_item ->> 'exercise_id')::uuid;
    exception when others then raise exception 'Standalone exercise is invalid' using errcode = 'P0001'; end;
    if v_exercise_id = any(v_seen_exercise_ids)
      or not exists (select 1 from public.cfg_exercises where id = v_exercise_id) then
      raise exception 'Standalone exercise is invalid' using errcode = 'P0001';
    end if;
    v_seen_exercise_ids := array_append(v_seen_exercise_ids, v_exercise_id);
    v_index := v_index + 1;
    insert into public.plan_workout_exercises (workout_id, exercise_id, order_index, target_sets, target_reps, target_weight)
    values (v_workout_id, v_exercise_id, v_index, jsonb_array_length(v_item -> 'sets'), 1, 0)
    returning id into v_workout_exercise_id;
    v_set_index := 0;
    for v_set in select value from jsonb_array_elements(v_item -> 'sets') loop
      if jsonb_typeof(v_set) <> 'object' then raise exception 'Standalone set is invalid' using errcode = 'P0001'; end if;
      begin
        v_weight := nullif(v_set ->> 'weight', '')::numeric;
        v_reps := nullif(v_set ->> 'reps', '')::integer;
        v_rpe := nullif(v_set ->> 'rpe', '')::numeric;
        v_completed := coalesce((v_set ->> 'completed')::boolean, false);
      exception when others then raise exception 'Standalone set is invalid' using errcode = 'P0001'; end;
      if v_weight is not null and (v_weight < 0 or v_weight::text in ('NaN', 'Infinity', '-Infinity'))
        or v_reps is not null and v_reps < 0
        or v_rpe is not null and (v_rpe < 1 or v_rpe > 10 or v_rpe::text in ('NaN', 'Infinity', '-Infinity')) then
        raise exception 'Standalone set is invalid' using errcode = 'P0001';
      end if;
      v_set_index := v_set_index + 1;
      insert into public.log_set_logs (workout_exercise_id, set_index, target_weight, target_reps, actual_weight, actual_reps, rpe, completed)
      values (v_workout_exercise_id, v_set_index, 0, 1, v_weight, v_reps, v_rpe, v_completed);
    end loop;
  end loop;
  return v_workout_id;
end;
$$;

create or replace function public.get_standalone_workout_draft()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_workout public.plan_workouts%rowtype;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = 'P0001'; end if;
  select * into v_workout from public.plan_workouts as workout
  where workout.user_id = v_user_id and workout.program_id is null
    and workout.day_type = 'training' and workout.status = 'draft'
  order by workout.updated_at desc, workout.created_at desc limit 1;
  if v_workout.id is null then return null; end if;
  return jsonb_build_object(
    'workout_id', v_workout.id,
    'scheduled_date', v_workout.scheduled_date,
    'cfg_exercises', coalesce((
      select jsonb_agg(jsonb_build_object(
        'exercise_id', workout_exercise.exercise_id,
        'sets', coalesce((
          select jsonb_agg(jsonb_build_object(
            'completed', set_log.completed, 'reps', coalesce(set_log.actual_reps::text, ''),
            'rpe', coalesce(set_log.rpe::text, ''), 'weight', coalesce(set_log.actual_weight::text, '')
          ) order by set_log.set_index)
          from public.log_set_logs as set_log where set_log.workout_exercise_id = workout_exercise.id
        ), '[]'::jsonb)
      ) order by workout_exercise.order_index)
      from public.plan_workout_exercises as workout_exercise where workout_exercise.workout_id = v_workout.id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.create_standalone_workout(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.save_standalone_workout(p_payload - 'workout_id');
end;
$$;

revoke all on function public.create_standalone_workout(jsonb) from public, anon;
revoke all on function public.save_standalone_workout(jsonb) from public, anon;
revoke all on function public.get_standalone_workout_draft() from public, anon;
grant execute on function public.create_standalone_workout(jsonb) to authenticated;
grant execute on function public.save_standalone_workout(jsonb) to authenticated;
grant execute on function public.get_standalone_workout_draft() to authenticated;

-- Phase 1: only finite, product-reviewed cardio references may complete without RPE.
alter table public.plan_workout_exercises drop constraint if exists workout_exercises_reference_shape_check;
alter table public.plan_workout_exercises add constraint workout_exercises_reference_shape_check check (
  (exercise_id is not null and exercise_provider is null and external_exercise_id is null and exercise_name_snapshot is null and exercise_metadata_snapshot is null)
  or (exercise_id is null and exercise_provider = 'wger' and external_exercise_id ~ '^[1-9][0-9]{0,8}$'
    and char_length(exercise_name_snapshot) between 1 and 160 and jsonb_typeof(exercise_metadata_snapshot) = 'object')
  or (exercise_id is null and exercise_provider = 'reviewed' and external_exercise_id ~ '^reviewed:[a-z0-9-]{2,80}$'
    and char_length(exercise_name_snapshot) between 1 and 160 and jsonb_typeof(exercise_metadata_snapshot) = 'object')
  or (exercise_id is null and exercise_provider = 'manual' and external_exercise_id ~ '^manual:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and char_length(exercise_name_snapshot) between 1 and 160 and jsonb_typeof(exercise_metadata_snapshot) = 'object')
);

create or replace function public.save_standalone_workout(p_payload jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid(); v_workout_id uuid; v_item jsonb; v_set jsonb;
  v_exercise_id uuid; v_workout_exercise_id uuid; v_date date; v_status text;
  v_index integer := 0; v_set_index integer; v_seen_ids text[] := '{}';
  v_weight numeric; v_reps integer; v_rpe numeric; v_completed boolean; v_requires_rpe boolean;
  v_provider text; v_reference_id text; v_name text; v_metadata jsonb; v_load_type text;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = 'P0001'; end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or jsonb_typeof(p_payload -> 'cfg_exercises') <> 'array' or jsonb_array_length(p_payload -> 'cfg_exercises') = 0 then
    raise exception 'Standalone workout payload is invalid' using errcode = 'P0001';
  end if;
  begin v_date := (p_payload ->> 'scheduled_date')::date;
  exception when others then raise exception 'Standalone workout date is invalid' using errcode = 'P0001'; end;
  v_status := p_payload ->> 'status';
  if v_status not in ('draft', 'completed') then raise exception 'Standalone workout status is invalid' using errcode = 'P0001'; end if;

  if nullif(p_payload ->> 'workout_id', '') is not null then
    begin v_workout_id := (p_payload ->> 'workout_id')::uuid;
    exception when others then raise exception 'Standalone workout id is invalid' using errcode = 'P0001'; end;
    select workout.id into v_workout_id from public.plan_workouts workout
      where workout.id = v_workout_id and workout.user_id = v_user_id and workout.program_id is null
        and workout.day_type = 'training' and workout.status = 'draft' for update;
    if v_workout_id is null then raise exception 'Standalone draft was not found' using errcode = 'P0001'; end if;
    update public.plan_workouts set scheduled_date = v_date, name = '单次训练 · ' || to_char(v_date, 'YYYY-MM-DD'), status = v_status,
      completed_at = case when v_status = 'completed' then now() else null end, updated_at = now() where id = v_workout_id;
    delete from public.plan_workout_exercises where workout_id = v_workout_id;
  else
    insert into public.plan_workouts (program_id, user_id, scheduled_date, sequence_index, schedule_index, day_type, name, status, completed_at)
    values (null, v_user_id, v_date, 0, 0, 'training', '单次训练 · ' || to_char(v_date, 'YYYY-MM-DD'), v_status,
      case when v_status = 'completed' then now() else null end) returning id into v_workout_id;
  end if;

  for v_item in select value from jsonb_array_elements(p_payload -> 'cfg_exercises') loop
    if jsonb_typeof(v_item) <> 'object' or jsonb_typeof(v_item -> 'sets') <> 'array' or jsonb_array_length(v_item -> 'sets') = 0 then
      raise exception 'Standalone exercise is invalid' using errcode = 'P0001';
    end if;
    v_provider := nullif(v_item ->> 'exercise_provider', '');
    v_reference_id := nullif(v_item ->> 'external_exercise_id', '');
    v_name := btrim(v_item ->> 'exercise_name_snapshot'); v_metadata := v_item -> 'exercise_metadata_snapshot';
    v_load_type := coalesce(v_metadata ->> 'loadType', 'weighted');
    if v_provider is null then
      if (v_item ? 'external_exercise_id') or (v_item ? 'exercise_name_snapshot') or (v_item ? 'exercise_metadata_snapshot') then raise exception 'Standalone exercise reference is invalid' using errcode = 'P0001'; end if;
      begin v_exercise_id := (v_item ->> 'exercise_id')::uuid;
      exception when others then raise exception 'Standalone exercise is invalid' using errcode = 'P0001'; end;
      if ('local:' || v_exercise_id::text) = any(v_seen_ids) or not exists (select 1 from public.cfg_exercises where id = v_exercise_id) then raise exception 'Standalone exercise is invalid' using errcode = 'P0001'; end if;
      v_seen_ids := array_append(v_seen_ids, 'local:' || v_exercise_id::text); v_load_type := 'weighted';
    elsif v_provider = 'wger' then
      if v_item ->> 'exercise_id' is not null or v_reference_id !~ '^[1-9][0-9]{0,8}$' or char_length(v_name) not between 1 and 160
        or jsonb_typeof(v_metadata) <> 'object' or jsonb_typeof(v_metadata -> 'muscles') <> 'array' or jsonb_typeof(v_metadata -> 'equipment') <> 'array'
        or jsonb_typeof(v_metadata -> 'sourceUrl') <> 'string' or (v_metadata ->> 'sourceUrl') !~ '^https://wger\.de/'
        or exists (select 1 from jsonb_object_keys(v_metadata) key where key not in ('muscles','equipment','category','sourceUrl','loadType'))
        or v_load_type not in ('weighted','bodyweight','assisted') or ('wger:' || v_reference_id) = any(v_seen_ids) then
        raise exception 'Standalone external exercise is invalid' using errcode = 'P0001';
      end if;
      v_seen_ids := array_append(v_seen_ids, 'wger:' || v_reference_id);
    elsif v_provider in ('manual', 'reviewed') then
      if v_item ->> 'exercise_id' is not null or char_length(v_name) not between 1 and 160 or jsonb_typeof(v_metadata) <> 'object'
        or jsonb_typeof(v_metadata -> 'muscles') <> 'array' or jsonb_typeof(v_metadata -> 'equipment') <> 'array'
        or v_load_type not in ('weighted','bodyweight','assisted')
        or exists (select 1 from jsonb_object_keys(v_metadata) key where key not in ('muscles','equipment','loadType','movementPattern','riskLevel'))
        or (v_provider = 'manual' and v_reference_id !~ '^manual:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
        or (v_provider = 'reviewed' and v_reference_id !~ '^reviewed:[a-z0-9-]{2,80}$')
        or (v_provider || ':' || v_reference_id) = any(v_seen_ids) then
        raise exception 'Standalone snapshot exercise is invalid' using errcode = 'P0001';
      end if;
      v_seen_ids := array_append(v_seen_ids, v_provider || ':' || v_reference_id);
    else raise exception 'Standalone exercise reference is invalid' using errcode = 'P0001'; end if;

    v_requires_rpe := not coalesce(
      v_provider = 'reviewed' and (
        (v_reference_id = 'reviewed:rowing-erg' and v_metadata ->> 'movementPattern' = '有氧划船')
        or (v_reference_id = 'reviewed:stationary-bike' and v_metadata ->> 'movementPattern' = '有氧骑行')
        or (v_reference_id = 'reviewed:treadmill-run' and v_metadata ->> 'movementPattern' = '有氧跑步')
      ),
      false
    );

    v_index := v_index + 1;
    insert into public.plan_workout_exercises (workout_id, exercise_id, exercise_provider, external_exercise_id, exercise_name_snapshot, exercise_metadata_snapshot, order_index, target_sets, target_reps, target_weight)
    values (v_workout_id, case when v_provider is null then v_exercise_id else null end, v_provider,
      case when v_provider is null then null else v_reference_id end, case when v_provider is null then null else v_name end,
      case when v_provider is null then null else v_metadata end, v_index, jsonb_array_length(v_item -> 'sets'), 1, 0)
    returning id into v_workout_exercise_id;
    v_set_index := 0;
    for v_set in select value from jsonb_array_elements(v_item -> 'sets') loop
      if jsonb_typeof(v_set) <> 'object' then raise exception 'Standalone set is invalid' using errcode = 'P0001'; end if;
      begin v_weight := nullif(v_set ->> 'weight', '')::numeric; v_reps := nullif(v_set ->> 'reps', '')::integer;
        v_rpe := nullif(v_set ->> 'rpe', '')::numeric; v_completed := coalesce((v_set ->> 'completed')::boolean, false);
      exception when others then raise exception 'Standalone set is invalid' using errcode = 'P0001'; end;
      if (v_weight is not null and (v_weight < 0 or v_weight > 10000)) or (v_reps is not null and (v_reps < 1 or v_reps > 1000))
        or (v_rpe is not null and (v_rpe < 1 or v_rpe > 10)) then raise exception 'Standalone set is invalid' using errcode = 'P0001'; end if;
      if v_completed and (v_reps is null or (v_requires_rpe and v_rpe is null) or (v_load_type = 'weighted' and (v_weight is null or v_weight <= 0))
        or (v_load_type = 'assisted' and v_weight is null)) then raise exception 'Completed standalone set is incomplete' using errcode = 'P0001'; end if;
      v_set_index := v_set_index + 1;
      insert into public.log_set_logs (workout_exercise_id, set_index, target_weight, target_reps, actual_weight, actual_reps, rpe, completed)
      values (v_workout_exercise_id, v_set_index, 0, 1, v_weight, v_reps, v_rpe, v_completed);
    end loop;
  end loop;
  return v_workout_id;
end;
$$;

revoke all on function public.save_standalone_workout(jsonb) from public, anon;
grant execute on function public.save_standalone_workout(jsonb) to authenticated;
-- P0 recording references are snapshots scoped by the owning workout. They do
-- not create a public exercise catalog and never accept a user id from callers.
alter table public.plan_workout_exercises drop constraint if exists workout_exercises_reference_shape_check;
alter table public.plan_workout_exercises add constraint workout_exercises_reference_shape_check check (
  (exercise_id is not null and exercise_provider is null and external_exercise_id is null and exercise_name_snapshot is null and exercise_metadata_snapshot is null)
  or (exercise_id is null and exercise_provider = 'wger' and external_exercise_id ~ '^[1-9][0-9]{0,8}$'
    and char_length(exercise_name_snapshot) between 1 and 160 and jsonb_typeof(exercise_metadata_snapshot) = 'object')
  or (exercise_id is null and exercise_provider = 'reviewed' and external_exercise_id ~ '^reviewed:[a-z0-9-]{2,80}$'
    and char_length(exercise_name_snapshot) between 1 and 160 and jsonb_typeof(exercise_metadata_snapshot) = 'object')
  or (exercise_id is null and exercise_provider = 'manual' and external_exercise_id ~ '^manual:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and char_length(exercise_name_snapshot) between 1 and 160 and jsonb_typeof(exercise_metadata_snapshot) = 'object')
);

create or replace function public.save_standalone_workout(p_payload jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid(); v_workout_id uuid; v_item jsonb; v_set jsonb;
  v_exercise_id uuid; v_workout_exercise_id uuid; v_date date; v_status text;
  v_index integer := 0; v_set_index integer; v_seen_ids text[] := '{}';
  v_weight numeric; v_reps integer; v_rpe numeric; v_completed boolean;
  v_provider text; v_reference_id text; v_name text; v_metadata jsonb; v_load_type text;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = 'P0001'; end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or jsonb_typeof(p_payload -> 'cfg_exercises') <> 'array' or jsonb_array_length(p_payload -> 'cfg_exercises') = 0 then
    raise exception 'Standalone workout payload is invalid' using errcode = 'P0001';
  end if;
  begin v_date := (p_payload ->> 'scheduled_date')::date;
  exception when others then raise exception 'Standalone workout date is invalid' using errcode = 'P0001'; end;
  v_status := p_payload ->> 'status';
  if v_status not in ('draft', 'completed') then raise exception 'Standalone workout status is invalid' using errcode = 'P0001'; end if;

  if nullif(p_payload ->> 'workout_id', '') is not null then
    begin v_workout_id := (p_payload ->> 'workout_id')::uuid;
    exception when others then raise exception 'Standalone workout id is invalid' using errcode = 'P0001'; end;
    select workout.id into v_workout_id from public.plan_workouts workout
      where workout.id = v_workout_id and workout.user_id = v_user_id and workout.program_id is null
        and workout.day_type = 'training' and workout.status = 'draft' for update;
    if v_workout_id is null then raise exception 'Standalone draft was not found' using errcode = 'P0001'; end if;
    update public.plan_workouts set scheduled_date = v_date, name = '单次训练 · ' || to_char(v_date, 'YYYY-MM-DD'), status = v_status,
      completed_at = case when v_status = 'completed' then now() else null end, updated_at = now() where id = v_workout_id;
    delete from public.plan_workout_exercises where workout_id = v_workout_id;
  else
    insert into public.plan_workouts (program_id, user_id, scheduled_date, sequence_index, schedule_index, day_type, name, status, completed_at)
    values (null, v_user_id, v_date, 0, 0, 'training', '单次训练 · ' || to_char(v_date, 'YYYY-MM-DD'), v_status,
      case when v_status = 'completed' then now() else null end) returning id into v_workout_id;
  end if;

  for v_item in select value from jsonb_array_elements(p_payload -> 'cfg_exercises') loop
    if jsonb_typeof(v_item) <> 'object' or jsonb_typeof(v_item -> 'sets') <> 'array' or jsonb_array_length(v_item -> 'sets') = 0 then
      raise exception 'Standalone exercise is invalid' using errcode = 'P0001';
    end if;
    v_provider := nullif(v_item ->> 'exercise_provider', '');
    v_reference_id := nullif(v_item ->> 'external_exercise_id', '');
    v_name := btrim(v_item ->> 'exercise_name_snapshot'); v_metadata := v_item -> 'exercise_metadata_snapshot';
    v_load_type := coalesce(v_metadata ->> 'loadType', 'weighted');
    if v_provider is null then
      if (v_item ? 'external_exercise_id') or (v_item ? 'exercise_name_snapshot') or (v_item ? 'exercise_metadata_snapshot') then raise exception 'Standalone exercise reference is invalid' using errcode = 'P0001'; end if;
      begin v_exercise_id := (v_item ->> 'exercise_id')::uuid;
      exception when others then raise exception 'Standalone exercise is invalid' using errcode = 'P0001'; end;
      if ('local:' || v_exercise_id::text) = any(v_seen_ids) or not exists (select 1 from public.cfg_exercises where id = v_exercise_id) then raise exception 'Standalone exercise is invalid' using errcode = 'P0001'; end if;
      v_seen_ids := array_append(v_seen_ids, 'local:' || v_exercise_id::text); v_load_type := 'weighted';
    elsif v_provider = 'wger' then
      if v_item ->> 'exercise_id' is not null or v_reference_id !~ '^[1-9][0-9]{0,8}$' or char_length(v_name) not between 1 and 160
        or jsonb_typeof(v_metadata) <> 'object' or jsonb_typeof(v_metadata -> 'muscles') <> 'array' or jsonb_typeof(v_metadata -> 'equipment') <> 'array'
        or jsonb_typeof(v_metadata -> 'sourceUrl') <> 'string' or (v_metadata ->> 'sourceUrl') !~ '^https://wger\.de/'
        or exists (select 1 from jsonb_object_keys(v_metadata) key where key not in ('muscles','equipment','category','sourceUrl','loadType'))
        or v_load_type not in ('weighted','bodyweight','assisted') or ('wger:' || v_reference_id) = any(v_seen_ids) then
        raise exception 'Standalone external exercise is invalid' using errcode = 'P0001';
      end if;
      v_seen_ids := array_append(v_seen_ids, 'wger:' || v_reference_id);
    elsif v_provider in ('manual', 'reviewed') then
      if v_item ->> 'exercise_id' is not null or char_length(v_name) not between 1 and 160 or jsonb_typeof(v_metadata) <> 'object'
        or jsonb_typeof(v_metadata -> 'muscles') <> 'array' or jsonb_typeof(v_metadata -> 'equipment') <> 'array'
        or v_load_type not in ('weighted','bodyweight','assisted')
        or exists (select 1 from jsonb_object_keys(v_metadata) key where key not in ('muscles','equipment','loadType','movementPattern','riskLevel'))
        or (v_provider = 'manual' and v_reference_id !~ '^manual:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
        or (v_provider = 'reviewed' and v_reference_id !~ '^reviewed:[a-z0-9-]{2,80}$')
        or (v_provider || ':' || v_reference_id) = any(v_seen_ids) then
        raise exception 'Standalone snapshot exercise is invalid' using errcode = 'P0001';
      end if;
      v_seen_ids := array_append(v_seen_ids, v_provider || ':' || v_reference_id);
    else raise exception 'Standalone exercise reference is invalid' using errcode = 'P0001'; end if;

    v_index := v_index + 1;
    insert into public.plan_workout_exercises (workout_id, exercise_id, exercise_provider, external_exercise_id, exercise_name_snapshot, exercise_metadata_snapshot, order_index, target_sets, target_reps, target_weight)
    values (v_workout_id, case when v_provider is null then v_exercise_id else null end, v_provider,
      case when v_provider is null then null else v_reference_id end, case when v_provider is null then null else v_name end,
      case when v_provider is null then null else v_metadata end, v_index, jsonb_array_length(v_item -> 'sets'), 1, 0)
    returning id into v_workout_exercise_id;
    v_set_index := 0;
    for v_set in select value from jsonb_array_elements(v_item -> 'sets') loop
      if jsonb_typeof(v_set) <> 'object' then raise exception 'Standalone set is invalid' using errcode = 'P0001'; end if;
      begin v_weight := nullif(v_set ->> 'weight', '')::numeric; v_reps := nullif(v_set ->> 'reps', '')::integer;
        v_rpe := nullif(v_set ->> 'rpe', '')::numeric; v_completed := coalesce((v_set ->> 'completed')::boolean, false);
      exception when others then raise exception 'Standalone set is invalid' using errcode = 'P0001'; end;
      if (v_weight is not null and (v_weight < 0 or v_weight > 10000)) or (v_reps is not null and (v_reps < 1 or v_reps > 1000))
        or (v_rpe is not null and (v_rpe < 1 or v_rpe > 10)) then raise exception 'Standalone set is invalid' using errcode = 'P0001'; end if;
      if v_completed and (v_reps is null or v_rpe is null or (v_load_type = 'weighted' and (v_weight is null or v_weight <= 0))
        or (v_load_type = 'assisted' and v_weight is null)) then raise exception 'Completed standalone set is incomplete' using errcode = 'P0001'; end if;
      v_set_index := v_set_index + 1;
      insert into public.log_set_logs (workout_exercise_id, set_index, target_weight, target_reps, actual_weight, actual_reps, rpe, completed)
      values (v_workout_exercise_id, v_set_index, 0, 1, v_weight, v_reps, v_rpe, v_completed);
    end loop;
  end loop;
  return v_workout_id;
end;
$$;

revoke all on function public.save_standalone_workout(jsonb) from public, anon;
grant execute on function public.save_standalone_workout(jsonb) to authenticated;

-- Legacy copied-output marker removed; the following snapshot definition is
-- superseded below by the current P0/phase-one contract.
-- External exercise references are snapshots for standalone plan_workouts only.
alter table public.plan_workout_exercises alter column exercise_id drop not null;
alter table public.plan_workout_exercises add column if not exists exercise_provider text;
alter table public.plan_workout_exercises add column if not exists external_exercise_id text;
alter table public.plan_workout_exercises add column if not exists exercise_name_snapshot text;
alter table public.plan_workout_exercises add column if not exists exercise_metadata_snapshot jsonb;

alter table public.plan_workout_exercises drop constraint if exists workout_exercises_reference_shape_check;
alter table public.plan_workout_exercises add constraint workout_exercises_reference_shape_check check (
  (exercise_id is not null and exercise_provider is null and external_exercise_id is null and exercise_name_snapshot is null and exercise_metadata_snapshot is null)
  or
  (exercise_id is null and exercise_provider = 'wger' and external_exercise_id ~ '^[1-9][0-9]{0,8}$'
    and char_length(exercise_name_snapshot) between 1 and 160 and jsonb_typeof(exercise_metadata_snapshot) = 'object')
);

create or replace function public.save_standalone_workout(p_payload jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid(); v_workout_id uuid; v_item jsonb; v_set jsonb;
  v_exercise_id uuid; v_workout_exercise_id uuid; v_date date; v_status text;
  v_index integer := 0; v_set_index integer; v_seen_exercise_ids uuid[] := '{}'; v_seen_external_ids text[] := '{}';
  v_weight numeric; v_reps integer; v_rpe numeric; v_completed boolean;
  v_external_id text; v_name text; v_metadata jsonb; v_is_external boolean;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = 'P0001'; end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or jsonb_typeof(p_payload -> 'cfg_exercises') <> 'array' or jsonb_array_length(p_payload -> 'cfg_exercises') = 0 then
    raise exception 'Standalone workout payload is invalid' using errcode = 'P0001';
  end if;
  begin v_date := (p_payload ->> 'scheduled_date')::date;
  exception when others then raise exception 'Standalone workout date is invalid' using errcode = 'P0001'; end;
  v_status := p_payload ->> 'status';
  if v_status not in ('draft', 'completed') then raise exception 'Standalone workout status is invalid' using errcode = 'P0001'; end if;

  if nullif(p_payload ->> 'workout_id', '') is not null then
    begin v_workout_id := (p_payload ->> 'workout_id')::uuid;
    exception when others then raise exception 'Standalone workout id is invalid' using errcode = 'P0001'; end;
    select workout.id into v_workout_id from public.plan_workouts as workout
    where workout.id = v_workout_id and workout.user_id = v_user_id and workout.program_id is null
      and workout.day_type = 'training' and workout.status = 'draft' for update;
    if v_workout_id is null then raise exception 'Standalone draft was not found' using errcode = 'P0001'; end if;
    update public.plan_workouts set scheduled_date = v_date, name = '单次训练 · ' || to_char(v_date, 'YYYY-MM-DD'), status = v_status,
      completed_at = case when v_status = 'completed' then now() else null end, updated_at = now() where id = v_workout_id;
    delete from public.plan_workout_exercises where workout_id = v_workout_id;
  else
    insert into public.plan_workouts (program_id, user_id, scheduled_date, sequence_index, schedule_index, day_type, name, status, completed_at)
    values (null, v_user_id, v_date, 0, 0, 'training', '单次训练 · ' || to_char(v_date, 'YYYY-MM-DD'), v_status,
      case when v_status = 'completed' then now() else null end) returning id into v_workout_id;
  end if;

  for v_item in select value from jsonb_array_elements(p_payload -> 'cfg_exercises') loop
    if jsonb_typeof(v_item) <> 'object' or jsonb_typeof(v_item -> 'sets') <> 'array' or jsonb_array_length(v_item -> 'sets') = 0 then
      raise exception 'Standalone exercise is invalid' using errcode = 'P0001';
    end if;
    v_is_external := (v_item ->> 'exercise_provider') = 'wger';
    if v_is_external then
      v_external_id := v_item ->> 'external_exercise_id'; v_name := btrim(v_item ->> 'exercise_name_snapshot'); v_metadata := v_item -> 'exercise_metadata_snapshot';
      if v_item ->> 'exercise_id' is not null or v_external_id !~ '^[1-9][0-9]{0,8}$' or char_length(v_name) not between 1 and 160
        or jsonb_typeof(v_metadata) <> 'object'
        or exists (select 1 from jsonb_object_keys(v_metadata) as key where key not in ('muscles', 'equipment', 'category', 'sourceUrl'))
        or jsonb_typeof(v_metadata -> 'muscles') <> 'array' or jsonb_typeof(v_metadata -> 'equipment') <> 'array'
        or jsonb_array_length(v_metadata -> 'muscles') > 12 or jsonb_array_length(v_metadata -> 'equipment') > 12
        or exists (select 1 from jsonb_array_elements_text(v_metadata -> 'muscles') value where char_length(value) not between 1 and 100)
        or exists (select 1 from jsonb_array_elements_text(v_metadata -> 'equipment') value where char_length(value) not between 1 and 100)
        or (v_metadata -> 'category' is not null and (jsonb_typeof(v_metadata -> 'category') <> 'string' or char_length(v_metadata ->> 'category') > 100))
        or jsonb_typeof(v_metadata -> 'sourceUrl') <> 'string' or (v_metadata ->> 'sourceUrl') !~ '^https://wger\\.de/'
        or v_external_id = any(v_seen_external_ids) then
        raise exception 'Standalone external exercise is invalid' using errcode = 'P0001';
      end if;
      v_seen_external_ids := array_append(v_seen_external_ids, v_external_id);
    else
      if (v_item ? 'exercise_provider') or (v_item ? 'external_exercise_id') or (v_item ? 'exercise_name_snapshot') or (v_item ? 'exercise_metadata_snapshot') then
        raise exception 'Standalone exercise reference is invalid' using errcode = 'P0001';
      end if;
      begin v_exercise_id := (v_item ->> 'exercise_id')::uuid;
      exception when others then raise exception 'Standalone exercise is invalid' using errcode = 'P0001'; end;
      if v_exercise_id = any(v_seen_exercise_ids) or not exists (select 1 from public.cfg_exercises where id = v_exercise_id) then
        raise exception 'Standalone exercise is invalid' using errcode = 'P0001';
      end if;
      v_seen_exercise_ids := array_append(v_seen_exercise_ids, v_exercise_id);
    end if;
    v_index := v_index + 1;
    insert into public.plan_workout_exercises (workout_id, exercise_id, exercise_provider, external_exercise_id, exercise_name_snapshot, exercise_metadata_snapshot, order_index, target_sets, target_reps, target_weight)
    values (v_workout_id, case when v_is_external then null else v_exercise_id end,
      case when v_is_external then 'wger' else null end, case when v_is_external then v_external_id else null end,
      case when v_is_external then v_name else null end, case when v_is_external then v_metadata else null end,
      v_index, jsonb_array_length(v_item -> 'sets'), 1, 0) returning id into v_workout_exercise_id;
    v_set_index := 0;
    for v_set in select value from jsonb_array_elements(v_item -> 'sets') loop
      if jsonb_typeof(v_set) <> 'object' then raise exception 'Standalone set is invalid' using errcode = 'P0001'; end if;
      begin v_weight := nullif(v_set ->> 'weight', '')::numeric; v_reps := nullif(v_set ->> 'reps', '')::integer;
        v_rpe := nullif(v_set ->> 'rpe', '')::numeric; v_completed := coalesce((v_set ->> 'completed')::boolean, false);
      exception when others then raise exception 'Standalone set is invalid' using errcode = 'P0001'; end;
      if v_weight is not null and (v_weight < 0 or v_weight::text in ('NaN', 'Infinity', '-Infinity'))
        or v_reps is not null and v_reps < 0 or v_rpe is not null and (v_rpe < 1 or v_rpe > 10 or v_rpe::text in ('NaN', 'Infinity', '-Infinity')) then
        raise exception 'Standalone set is invalid' using errcode = 'P0001';
      end if;
      v_set_index := v_set_index + 1;
      insert into public.log_set_logs (workout_exercise_id, set_index, target_weight, target_reps, actual_weight, actual_reps, rpe, completed)
      values (v_workout_exercise_id, v_set_index, 0, 1, v_weight, v_reps, v_rpe, v_completed);
    end loop;
  end loop;
  return v_workout_id;
end;
$$;

create or replace function public.get_standalone_workout_draft()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user_id uuid := auth.uid(); v_workout public.plan_workouts%rowtype;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = 'P0001'; end if;
  select * into v_workout from public.plan_workouts as workout where workout.user_id = v_user_id and workout.program_id is null
    and workout.day_type = 'training' and workout.status = 'draft' order by workout.updated_at desc, workout.created_at desc limit 1;
  if v_workout.id is null then return null; end if;
  return jsonb_build_object('workout_id', v_workout.id, 'scheduled_date', v_workout.scheduled_date, 'cfg_exercises', coalesce((
    select jsonb_agg(jsonb_build_object('exercise_id', we.exercise_id, 'exercise_provider', we.exercise_provider,
      'external_exercise_id', we.external_exercise_id, 'exercise_name_snapshot', we.exercise_name_snapshot,
      'exercise_metadata_snapshot', we.exercise_metadata_snapshot, 'sets', coalesce((
        select jsonb_agg(jsonb_build_object('completed', sl.completed, 'reps', coalesce(sl.actual_reps::text, ''),
          'rpe', coalesce(sl.rpe::text, ''), 'weight', coalesce(sl.actual_weight::text, '')) order by sl.set_index)
        from public.log_set_logs sl where sl.workout_exercise_id = we.id), '[]'::jsonb)) order by we.order_index)
    from public.plan_workout_exercises we where we.workout_id = v_workout.id), '[]'::jsonb));
end;
$$;

revoke all on function public.save_standalone_workout(jsonb) from public, anon;
revoke all on function public.get_standalone_workout_draft() from public, anon;
grant execute on function public.save_standalone_workout(jsonb) to authenticated;
grant execute on function public.get_standalone_workout_draft() to authenticated;

-- Phase 1 final standalone recording contract. This repeats the latest
-- migration body so a clean schema initialization reaches the same state.
alter table public.plan_workout_exercises drop constraint if exists workout_exercises_reference_shape_check;
alter table public.plan_workout_exercises add constraint workout_exercises_reference_shape_check check (
  (exercise_id is not null and exercise_provider is null and external_exercise_id is null and exercise_name_snapshot is null and exercise_metadata_snapshot is null)
  or (exercise_id is null and exercise_provider = 'wger' and external_exercise_id ~ '^[1-9][0-9]{0,8}$' and char_length(exercise_name_snapshot) between 1 and 160 and jsonb_typeof(exercise_metadata_snapshot) = 'object')
  or (exercise_id is null and exercise_provider = 'reviewed' and external_exercise_id ~ '^reviewed:[a-z0-9-]{2,80}$' and char_length(exercise_name_snapshot) between 1 and 160 and jsonb_typeof(exercise_metadata_snapshot) = 'object')
  or (exercise_id is null and exercise_provider = 'manual' and external_exercise_id ~ '^manual:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' and char_length(exercise_name_snapshot) between 1 and 160 and jsonb_typeof(exercise_metadata_snapshot) = 'object')
);

create or replace function public.save_standalone_workout(p_payload jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid(); v_workout_id uuid; v_item jsonb; v_set jsonb;
  v_exercise_id uuid; v_workout_exercise_id uuid; v_date date; v_status text;
  v_index integer := 0; v_set_index integer; v_seen_ids text[] := '{}';
  v_weight numeric; v_reps integer; v_rpe numeric; v_completed boolean; v_requires_rpe boolean;
  v_provider text; v_reference_id text; v_name text; v_metadata jsonb; v_load_type text;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = 'P0001'; end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or jsonb_typeof(p_payload -> 'cfg_exercises') <> 'array' or jsonb_array_length(p_payload -> 'cfg_exercises') = 0 then raise exception 'Standalone workout payload is invalid' using errcode = 'P0001'; end if;
  begin v_date := (p_payload ->> 'scheduled_date')::date;
  exception when others then raise exception 'Standalone workout date is invalid' using errcode = 'P0001'; end;
  v_status := p_payload ->> 'status';
  if v_status not in ('draft', 'completed') then raise exception 'Standalone workout status is invalid' using errcode = 'P0001'; end if;

  if nullif(p_payload ->> 'workout_id', '') is not null then
    begin v_workout_id := (p_payload ->> 'workout_id')::uuid;
    exception when others then raise exception 'Standalone workout id is invalid' using errcode = 'P0001'; end;
    select workout.id into v_workout_id from public.plan_workouts workout where workout.id = v_workout_id and workout.user_id = v_user_id and workout.program_id is null and workout.day_type = 'training' and workout.status = 'draft' for update;
    if v_workout_id is null then raise exception 'Standalone draft was not found' using errcode = 'P0001'; end if;
    update public.plan_workouts set scheduled_date = v_date, name = '单次训练 · ' || to_char(v_date, 'YYYY-MM-DD'), status = v_status, completed_at = case when v_status = 'completed' then now() else null end, updated_at = now() where id = v_workout_id;
    delete from public.plan_workout_exercises where workout_id = v_workout_id;
  else
    insert into public.plan_workouts (program_id, user_id, scheduled_date, sequence_index, schedule_index, day_type, name, status, completed_at) values (null, v_user_id, v_date, 0, 0, 'training', '单次训练 · ' || to_char(v_date, 'YYYY-MM-DD'), v_status, case when v_status = 'completed' then now() else null end) returning id into v_workout_id;
  end if;

  for v_item in select value from jsonb_array_elements(p_payload -> 'cfg_exercises') loop
    if jsonb_typeof(v_item) <> 'object' or jsonb_typeof(v_item -> 'sets') <> 'array' or jsonb_array_length(v_item -> 'sets') = 0 then raise exception 'Standalone exercise is invalid' using errcode = 'P0001'; end if;
    v_provider := nullif(v_item ->> 'exercise_provider', ''); v_reference_id := nullif(v_item ->> 'external_exercise_id', '');
    v_name := btrim(v_item ->> 'exercise_name_snapshot'); v_metadata := v_item -> 'exercise_metadata_snapshot'; v_load_type := coalesce(v_metadata ->> 'loadType', 'weighted');
    if v_provider is null then
      if (v_item ? 'external_exercise_id') or (v_item ? 'exercise_name_snapshot') or (v_item ? 'exercise_metadata_snapshot') then raise exception 'Standalone exercise reference is invalid' using errcode = 'P0001'; end if;
      begin v_exercise_id := (v_item ->> 'exercise_id')::uuid;
      exception when others then raise exception 'Standalone exercise is invalid' using errcode = 'P0001'; end;
      if ('local:' || v_exercise_id::text) = any(v_seen_ids) or not exists (select 1 from public.cfg_exercises where id = v_exercise_id) then raise exception 'Standalone exercise is invalid' using errcode = 'P0001'; end if;
      v_seen_ids := array_append(v_seen_ids, 'local:' || v_exercise_id::text); v_load_type := 'weighted';
    elsif v_provider = 'wger' then
      if v_item ->> 'exercise_id' is not null or v_reference_id !~ '^[1-9][0-9]{0,8}$' or char_length(v_name) not between 1 and 160 or jsonb_typeof(v_metadata) <> 'object' or jsonb_typeof(v_metadata -> 'muscles') <> 'array' or jsonb_typeof(v_metadata -> 'equipment') <> 'array' or jsonb_typeof(v_metadata -> 'sourceUrl') <> 'string' or (v_metadata ->> 'sourceUrl') !~ '^https://wger\.de/' or exists (select 1 from jsonb_object_keys(v_metadata) key where key not in ('muscles','equipment','category','sourceUrl','loadType')) or v_load_type not in ('weighted','bodyweight','assisted') or ('wger:' || v_reference_id) = any(v_seen_ids) then raise exception 'Standalone external exercise is invalid' using errcode = 'P0001'; end if;
      v_seen_ids := array_append(v_seen_ids, 'wger:' || v_reference_id);
    elsif v_provider in ('manual', 'reviewed') then
      if v_item ->> 'exercise_id' is not null or char_length(v_name) not between 1 and 160 or jsonb_typeof(v_metadata) <> 'object' or jsonb_typeof(v_metadata -> 'muscles') <> 'array' or jsonb_typeof(v_metadata -> 'equipment') <> 'array' or v_load_type not in ('weighted','bodyweight','assisted') or exists (select 1 from jsonb_object_keys(v_metadata) key where key not in ('muscles','equipment','loadType','movementPattern','riskLevel')) or (v_provider = 'manual' and v_reference_id !~ '^manual:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') or (v_provider = 'reviewed' and v_reference_id !~ '^reviewed:[a-z0-9-]{2,80}$') or (v_provider || ':' || v_reference_id) = any(v_seen_ids) then raise exception 'Standalone snapshot exercise is invalid' using errcode = 'P0001'; end if;
      v_seen_ids := array_append(v_seen_ids, v_provider || ':' || v_reference_id);
    else raise exception 'Standalone exercise reference is invalid' using errcode = 'P0001'; end if;

    if v_provider = 'reviewed' and (
      (v_reference_id = any(array['reviewed:push-up','reviewed:incline-push-up','reviewed:parallel-bar-dip','reviewed:pull-up','reviewed:glute-bridge','reviewed:bench-dip','reviewed:plank','reviewed:side-plank','reviewed:dead-bug','reviewed:bird-dog','reviewed:crunch','reviewed:hanging-knee-raise','reviewed:ab-wheel-rollout','reviewed:burpee','reviewed:treadmill-run']) and v_load_type <> 'bodyweight')
      or (v_reference_id = any(array['reviewed:assisted-pull-up','reviewed:rowing-erg','reviewed:stationary-bike']) and v_load_type <> 'assisted')
      or (v_reference_id <> all(array['reviewed:push-up','reviewed:incline-push-up','reviewed:parallel-bar-dip','reviewed:pull-up','reviewed:glute-bridge','reviewed:bench-dip','reviewed:plank','reviewed:side-plank','reviewed:dead-bug','reviewed:bird-dog','reviewed:crunch','reviewed:hanging-knee-raise','reviewed:ab-wheel-rollout','reviewed:burpee','reviewed:treadmill-run','reviewed:assisted-pull-up','reviewed:rowing-erg','reviewed:stationary-bike']) and v_load_type <> 'weighted')
    ) then raise exception 'Reviewed exercise load type is invalid' using errcode = 'P0001'; end if;
    v_requires_rpe := not coalesce(v_provider = 'reviewed' and ((v_reference_id = 'reviewed:rowing-erg' and v_metadata ->> 'movementPattern' = '有氧划船') or (v_reference_id = 'reviewed:stationary-bike' and v_metadata ->> 'movementPattern' = '有氧骑行') or (v_reference_id = 'reviewed:treadmill-run' and v_metadata ->> 'movementPattern' = '有氧跑步')), false);
    v_index := v_index + 1;
    insert into public.plan_workout_exercises (workout_id, exercise_id, exercise_provider, external_exercise_id, exercise_name_snapshot, exercise_metadata_snapshot, order_index, target_sets, target_reps, target_weight) values (v_workout_id, case when v_provider is null then v_exercise_id else null end, v_provider, case when v_provider is null then null else v_reference_id end, case when v_provider is null then null else v_name end, case when v_provider is null then null else v_metadata end, v_index, jsonb_array_length(v_item -> 'sets'), 1, 0) returning id into v_workout_exercise_id;
    v_set_index := 0;
    for v_set in select value from jsonb_array_elements(v_item -> 'sets') loop
      if jsonb_typeof(v_set) <> 'object' then raise exception 'Standalone set is invalid' using errcode = 'P0001'; end if;
      begin v_weight := nullif(v_set ->> 'weight', '')::numeric; v_reps := nullif(v_set ->> 'reps', '')::integer; v_rpe := nullif(v_set ->> 'rpe', '')::numeric; v_completed := coalesce((v_set ->> 'completed')::boolean, false);
      exception when others then raise exception 'Standalone set is invalid' using errcode = 'P0001'; end;
      if (v_weight is not null and (v_weight < 0 or v_weight > 10000)) or (v_reps is not null and (v_reps < 1 or v_reps > 1000)) or (v_rpe is not null and (v_rpe < 1 or v_rpe > 10)) then raise exception 'Standalone set is invalid' using errcode = 'P0001'; end if;
      if v_completed and (v_reps is null or (v_requires_rpe and v_rpe is null) or (v_load_type = 'weighted' and (v_weight is null or v_weight <= 0)) or (v_load_type = 'assisted' and v_weight is null)) then raise exception 'Completed standalone set is incomplete' using errcode = 'P0001'; end if;
      v_set_index := v_set_index + 1;
      insert into public.log_set_logs (workout_exercise_id, set_index, target_weight, target_reps, actual_weight, actual_reps, rpe, completed) values (v_workout_exercise_id, v_set_index, 0, 1, v_weight, v_reps, v_rpe, v_completed);
    end loop;
  end loop;
  return v_workout_id;
end;
$$;

revoke all on function public.save_standalone_workout(jsonb) from public, anon;
grant execute on function public.save_standalone_workout(jsonb) to authenticated;

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
    if to_regclass('public.' || relation_name) is not null then
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
