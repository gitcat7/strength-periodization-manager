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
  template_type text not null check (template_type in ('three_day_full_body', 'four_day_upper_lower', 'push_pull_squat')),
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
  name text not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'draft', 'completed', 'skipped')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workout_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id),
  order_index integer not null,
  target_sets integer not null check (target_sets > 0),
  target_reps integer not null check (target_reps > 0),
  target_weight numeric(7, 2) not null check (target_weight >= 0),
  created_at timestamptz not null default now()
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

insert into public.exercises (slug, name, category, default_increment, is_main_lift)
values
  ('back_squat', '深蹲', 'lower', 5.00, true),
  ('bench_press', '卧推', 'upper', 2.50, true),
  ('deadlift', '硬拉', 'lower', 5.00, true),
  ('overhead_press', '推举', 'upper', 2.50, true),
  ('barbell_row', '杠铃划船', 'upper', 2.50, false),
  ('pull_up', '引体向上', 'upper', 2.50, false),
  ('lat_pulldown', '高位下拉', 'upper', 2.50, false),
  ('romanian_deadlift', '罗马尼亚硬拉', 'lower', 5.00, false),
  ('leg_press', '腿举', 'lower', 5.00, false),
  ('leg_curl', '腿弯举', 'lower', 2.50, false),
  ('incline_dumbbell_press', '上斜哑铃卧推', 'push', 2.50, false),
  ('lateral_raise', '侧平举', 'push', 1.00, false),
  ('triceps_pushdown', '绳索下压', 'push', 2.50, false),
  ('seated_cable_row', '坐姿划船', 'pull', 2.50, false),
  ('face_pull', '面拉', 'pull', 1.00, false),
  ('dumbbell_curl', '哑铃弯举', 'pull', 1.00, false),
  ('standing_calf_raise', '站姿提踵', 'squat', 2.50, false),
  ('cardio_zone2', 'Zone 2 有氧', 'cardio', 0.00, false)
on conflict (slug) do update set
  name = excluded.name,
  category = excluded.category,
  default_increment = excluded.default_increment,
  is_main_lift = excluded.is_main_lift;

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
