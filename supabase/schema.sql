create extension if not exists "pgcrypto";

create table if not exists public.athlete_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  experience_level text not null check (experience_level in ('beginner', 'novice', 'intermediate')),
  goal text not null check (goal in ('strength', 'hypertrophy_strength')),
  training_days_per_week integer not null check (training_days_per_week in (3, 4, 7)),
  available_weekdays integer[] not null default '{}',
  session_duration_minutes integer not null check (session_duration_minutes in (45, 60, 75, 90)),
  injury_notes text,
  unit text not null default 'kg' check (unit = 'kg'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create table if not exists public.exercises (
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

create table if not exists public.lift_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id),
  estimated_1rm numeric(7, 2) not null check (estimated_1rm > 0),
  training_max numeric(7, 2) not null check (training_max > 0),
  source_type text not null check (source_type in ('one_rm', 'rep_max', 'working_set', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, exercise_id)
);

create table if not exists public.programs (
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

create table if not exists public.workouts (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
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

create table if not exists public.workout_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id),
  order_index integer not null,
  target_sets integer not null check (target_sets > 0),
  target_reps integer not null check (target_reps > 0),
  target_weight numeric(7, 2) not null check (target_weight >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.set_logs (
  id uuid primary key default gen_random_uuid(),
  workout_exercise_id uuid not null references public.workout_exercises(id) on delete cascade,
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

create table if not exists public.recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id),
  workout_id uuid references public.workouts(id) on delete set null,
  recommendation_type text not null check (recommendation_type in ('increase', 'hold', 'decrease', 'deload')),
  previous_weight numeric(7, 2) not null check (previous_weight >= 0),
  suggested_weight numeric(7, 2) not null check (suggested_weight >= 0),
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'modified', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pr_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id),
  current_estimated_1rm numeric(7, 2) not null check (current_estimated_1rm > 0),
  target_weight numeric(7, 2) not null check (target_weight > 0),
  target_date date not null,
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.feedback_reports (
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

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  event_name text not null,
  properties jsonb not null default '{}'::jsonb,
  page_path text,
  created_at timestamptz not null default now()
);

create table if not exists public.agent_access_tokens (
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
on public.agent_access_tokens (user_id, created_at desc);

insert into public.exercises (
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
  ('cable_standing_calf_raise', '绳索站姿提踵', 'squat', 2.50, false, '1375', 'squat', 'calf_raise', true)
on conflict (slug) do update set
  name = excluded.name,
  category = excluded.category,
  default_increment = excluded.default_increment,
  is_main_lift = excluded.is_main_lift,
  catalog_external_id = excluded.catalog_external_id,
  training_direction = excluded.training_direction,
  movement_pattern = excluded.movement_pattern,
  substitution_enabled = excluded.substitution_enabled;

alter table public.athlete_profiles enable row level security;
alter table public.lift_profiles enable row level security;
alter table public.programs enable row level security;
alter table public.workouts enable row level security;
alter table public.workout_exercises enable row level security;
alter table public.set_logs enable row level security;
alter table public.recommendations enable row level security;
alter table public.pr_goals enable row level security;
alter table public.feedback_reports enable row level security;
alter table public.analytics_events enable row level security;
alter table public.agent_access_tokens enable row level security;
alter table public.exercises enable row level security;

drop policy if exists "Anyone can read exercises" on public.exercises;
create policy "Anyone can read exercises"
on public.exercises for select
to authenticated
using (true);

drop policy if exists "Users manage own athlete profile" on public.athlete_profiles;
create policy "Users manage own athlete profile"
on public.athlete_profiles for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users manage own lift profiles" on public.lift_profiles;
create policy "Users manage own lift profiles"
on public.lift_profiles for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users manage own programs" on public.programs;
create policy "Users manage own programs"
on public.programs for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users manage own workouts" on public.workouts;
create policy "Users manage own workouts"
on public.workouts for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users manage own workout exercises" on public.workout_exercises;
create policy "Users manage own workout exercises"
on public.workout_exercises for all
to authenticated
using (
  exists (
    select 1
    from public.workouts w
    where w.id = workout_exercises.workout_id
      and w.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.workouts w
    where w.id = workout_exercises.workout_id
      and w.user_id = auth.uid()
  )
);

drop policy if exists "Users manage own set logs" on public.set_logs;
create policy "Users manage own set logs"
on public.set_logs for all
to authenticated
using (
  exists (
    select 1
    from public.workout_exercises we
    join public.workouts w on w.id = we.workout_id
    where we.id = set_logs.workout_exercise_id
      and w.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.workout_exercises we
    join public.workouts w on w.id = we.workout_id
    where we.id = set_logs.workout_exercise_id
      and w.user_id = auth.uid()
  )
);

drop policy if exists "Users manage own recommendations" on public.recommendations;
create policy "Users manage own recommendations"
on public.recommendations for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users manage own pr goals" on public.pr_goals;
create policy "Users manage own pr goals"
on public.pr_goals for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users create feedback reports" on public.feedback_reports;
create policy "Users create feedback reports"
on public.feedback_reports for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users read own feedback reports" on public.feedback_reports;
create policy "Users read own feedback reports"
on public.feedback_reports for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users create own analytics events" on public.analytics_events;
create policy "Users create own analytics events"
on public.analytics_events for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users read own analytics events" on public.analytics_events;
create policy "Users read own analytics events"
on public.analytics_events for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users manage own agent access tokens" on public.agent_access_tokens;
create policy "Users manage own agent access tokens"
on public.agent_access_tokens for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

revoke all on public.agent_access_tokens from anon;
grant select, insert, update, delete on public.agent_access_tokens to authenticated;

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
  from public.workout_exercises as we
  join public.workouts as w on w.id = we.workout_id
  join public.programs as p on p.id = w.program_id
  where we.id = p_workout_exercise_id
    and w.user_id = v_user_id
    and p.user_id = v_user_id
    and w.user_id = p.user_id;

  if not found then
    raise exception 'Source exercise is not eligible for substitution' using errcode = 'P0001';
  end if;

  perform 1
  from public.programs as p
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
  from public.workout_exercises as we
  join public.workouts as w on w.id = we.workout_id
  join public.programs as p on p.id = w.program_id
  join public.exercises as e on e.id = we.exercise_id
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
  from public.exercises as e
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
    from public.workout_exercises as we
    join public.workouts as w2 on w2.id = we.workout_id
    join public.programs as p on p.id = w2.program_id
    join public.exercises as e on e.id = we.exercise_id
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
    raise exception 'No eligible workout exercises were found' using errcode = 'P0001';
  end if;

  perform 1
  from public.set_logs as sl
  where sl.workout_exercise_id = any(v_affected_ids)
  for update;

  if exists (
    select 1
    from public.set_logs as sl
    where sl.workout_exercise_id = any(v_affected_ids)
      and sl.completed
  ) then
    raise exception 'Completed sets cannot be substituted' using errcode = 'P0001';
  end if;

  delete from public.set_logs as sl
  where sl.workout_exercise_id = any(v_affected_ids)
    and not sl.completed;

  update public.workout_exercises
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
  on public.workouts (program_id, schedule_index);

drop policy if exists "Users manage own workouts" on public.workouts;
create policy "Users manage own workouts"
on public.workouts for all
to authenticated
using (
  auth.uid() = user_id
  and exists (
    select 1 from public.programs as program
    where program.id = workouts.program_id
      and program.user_id = auth.uid()
  )
)
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.programs as program
    where program.id = workouts.program_id
      and program.user_id = auth.uid()
  )
);

drop policy if exists "Users manage own workout exercises" on public.workout_exercises;
create policy "Users manage own workout exercises"
on public.workout_exercises for all
to authenticated
using (
  exists (
    select 1
    from public.workouts as workout
    join public.programs as program on program.id = workout.program_id
    where workout.id = workout_exercises.workout_id
      and workout.user_id = auth.uid()
      and program.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.workouts as workout
    join public.programs as program on program.id = workout.program_id
    where workout.id = workout_exercises.workout_id
      and workout.user_id = auth.uid()
      and program.user_id = auth.uid()
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
    select 1 from public.workouts as workout
    where workout.id = new.workout_id and workout.day_type = 'training'
  ) then
    raise exception 'Rest schedule items cannot have exercise prescriptions' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists workout_exercises_require_training_day on public.workout_exercises;
create trigger workout_exercises_require_training_day
before insert or update of workout_id on public.workout_exercises
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
    select 1 from public.workout_exercises as workout_exercise
    where workout_exercise.workout_id = new.id
  ) then
    raise exception 'Rest schedule items cannot have exercise prescriptions' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists rest_workouts_require_no_exercises on public.workouts;
create trigger rest_workouts_require_no_exercises
before update of day_type on public.workouts
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
    if exists (select 1 from public.programs where id = v_program_id) then
      select count(*), min(schedule_index), max(schedule_index)
      into v_count, v_min, v_max
      from public.workouts where program_id = v_program_id;
      if v_count > 0 and (v_min <> 0 or v_max <> v_count - 1) then
        raise exception 'Workout schedule_index values must be continuous from zero' using errcode = '23514';
      end if;
    end if;
  end loop;
  return null;
end;
$$;

drop trigger if exists workouts_require_continuous_schedule_index on public.workouts;
create constraint trigger workouts_require_continuous_schedule_index
after insert or update of program_id, schedule_index or delete on public.workouts
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
      or jsonb_typeof(v_item -> 'exercises') <> 'array' then
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
      if (v_item ->> 'sequence_index') !~ '^(0|[1-9][0-9]*)$' or jsonb_array_length(v_item -> 'exercises') = 0 then
        raise exception 'Training schedule items require sequence indexes and prescriptions' using errcode = 'P0001';
      end if;
      v_training_days := v_training_days + 1;
    elsif not (v_item ? 'sequence_index' and v_item -> 'sequence_index' = 'null'::jsonb)
      or jsonb_array_length(v_item -> 'exercises') <> 0 then
      raise exception 'Rest schedule items require null sequence indexes and no prescriptions' using errcode = 'P0001';
    else
      v_rest_days := v_rest_days + 1;
    end if;
    v_exercise_indexes := '{}';
    for v_exercise in select value from jsonb_array_elements(v_item -> 'exercises') loop
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
      if not exists (select 1 from public.exercises where id = v_exercise_id) then
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
  perform 1 from public.programs where user_id = v_user_id and status = 'active' for update;
  insert into public.programs (user_id, name, template_type, custom_template_name, schedule_mode, schedule_config, status, start_date, end_date)
  values (v_user_id, v_name, v_template_type, v_custom_template_name, v_schedule_mode, v_schedule_config, 'active', v_start_date, v_end_date)
  returning id into v_program_id;
  for v_item in select value from jsonb_array_elements(v_items) loop
    v_schedule_index := (v_item ->> 'schedule_index')::integer;
    v_day_type := v_item ->> 'day_type';
    v_sequence_index := case when v_day_type = 'training' then (v_item ->> 'sequence_index')::integer else null end;
    insert into public.workouts (program_id, user_id, scheduled_date, sequence_index, schedule_index, day_type, name, status)
    values (v_program_id, v_user_id, (v_item ->> 'scheduled_date')::date, v_sequence_index, v_schedule_index, v_day_type, btrim(v_item ->> 'name'), 'scheduled')
    returning id into v_workout_id;
    if v_schedule_index = 0 then v_first_schedule_item_id := v_workout_id; end if;
    if v_day_type = 'training' then
      for v_exercise in select value from jsonb_array_elements(v_item -> 'exercises') loop
        insert into public.workout_exercises (workout_id, exercise_id, order_index, target_sets, target_reps, target_weight)
        values (v_workout_id, (v_exercise ->> 'exercise_id')::uuid, (v_exercise ->> 'order_index')::integer, (v_exercise ->> 'target_sets')::integer, (v_exercise ->> 'target_reps')::integer, (v_exercise ->> 'target_weight')::numeric);
      end loop;
    end if;
  end loop;
  update public.programs set status = 'archived', updated_at = now()
  where user_id = v_user_id and status = 'active' and id <> v_program_id;
  return query select v_program_id, v_first_schedule_item_id, v_training_days, v_rest_days;
end;
$$;

revoke execute on function public.replace_active_program(jsonb) from public, anon;
grant execute on function public.replace_active_program(jsonb) to authenticated;
