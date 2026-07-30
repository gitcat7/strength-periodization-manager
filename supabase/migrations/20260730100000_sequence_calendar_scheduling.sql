-- Sequence-first scheduling: schedule metadata, calendar constraints, and auditable schedule events.
-- All date semantics for scheduling are Asia/Shanghai natural days.

alter table public.usr_athlete_profiles
  alter column training_days_per_week drop not null,
  drop constraint if exists athlete_profiles_session_duration_minutes_check,
  add constraint athlete_profiles_session_duration_minutes_check
    check (session_duration_minutes in (45, 60, 75, 90, 120, 150, 180));

alter table public.plan_programs
  add column if not exists schedule_revision integer not null default 1,
  add column if not exists holiday_policy text not null default 'train'
    check (holiday_policy in ('train', 'rest_and_shift')),
  add column if not exists timezone text not null default 'Asia/Shanghai';

alter table public.plan_workouts
  add column if not exists cycle_index integer,
  add column if not exists cycle_position integer,
  add column if not exists skip_reason text,
  add column if not exists replaced_by_workout_id uuid references public.plan_workouts(id);

-- Shared China mainland statutory holiday calendar. Readable by every authenticated
-- user; maintained by migrations only, never writable from browser clients.
create table if not exists public.cfg_cn_calendar_dates (
  date date primary key,
  name text not null,
  is_statutory_holiday boolean not null default true,
  year integer not null,
  created_at timestamptz not null default now()
);

create table if not exists public.usr_unavailable_dates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  note text,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

create table if not exists public.ops_schedule_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  program_id uuid not null references public.plan_programs(id) on delete cascade,
  event_type text not null check (
    event_type in (
      'extra_rest',
      'pause_started',
      'resume_confirmed',
      'holiday_override',
      'unavailable_date_added',
      'recovery_strategy_skip',
      'schedule_undone'
    )
  ),
  effective_date date not null,
  metadata jsonb not null default '{}'::jsonb,
  schedule_revision integer not null,
  created_at timestamptz not null default now()
);

create index if not exists unavailable_dates_user_date_idx
on public.usr_unavailable_dates (user_id, date);

create index if not exists schedule_events_program_created_idx
on public.ops_schedule_events (program_id, created_at desc);

alter table public.cfg_cn_calendar_dates enable row level security;
alter table public.usr_unavailable_dates enable row level security;
alter table public.ops_schedule_events enable row level security;

drop policy if exists "Authenticated users read cn calendar dates" on public.cfg_cn_calendar_dates;
create policy "Authenticated users read cn calendar dates"
on public.cfg_cn_calendar_dates for select
to authenticated
using (true);

drop policy if exists "Users manage own unavailable dates" on public.usr_unavailable_dates;
create policy "Users manage own unavailable dates"
on public.usr_unavailable_dates for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users manage own schedule events" on public.ops_schedule_events;
create policy "Users manage own schedule events"
on public.ops_schedule_events for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

revoke insert, update, delete on public.cfg_cn_calendar_dates from anon, authenticated;
grant select on public.cfg_cn_calendar_dates to authenticated;
grant select, insert, update, delete on public.usr_unavailable_dates to authenticated;
grant select, insert, update, delete on public.ops_schedule_events to authenticated;

-- Approved China mainland statutory holiday dates for the current and next calendar
-- year. Make-up workdays are normal schedulable days and are intentionally absent.
insert into public.cfg_cn_calendar_dates (date, name, is_statutory_holiday, year)
values
  ('2026-01-01', '元旦', true, 2026),
  ('2026-02-16', '春节', true, 2026),
  ('2026-02-17', '春节', true, 2026),
  ('2026-02-18', '春节', true, 2026),
  ('2026-02-19', '春节', true, 2026),
  ('2026-04-05', '清明节', true, 2026),
  ('2026-05-01', '劳动节', true, 2026),
  ('2026-05-02', '劳动节', true, 2026),
  ('2026-06-19', '端午节', true, 2026),
  ('2026-09-25', '中秋节', true, 2026),
  ('2026-10-01', '国庆节', true, 2026),
  ('2026-10-02', '国庆节', true, 2026),
  ('2026-10-03', '国庆节', true, 2026),
  ('2027-01-01', '元旦', true, 2027),
  ('2027-02-05', '春节', true, 2027),
  ('2027-02-06', '春节', true, 2027),
  ('2027-02-07', '春节', true, 2027),
  ('2027-02-08', '春节', true, 2027),
  ('2027-04-05', '清明节', true, 2027),
  ('2027-05-01', '劳动节', true, 2027),
  ('2027-05-02', '劳动节', true, 2027),
  ('2027-06-09', '端午节', true, 2027),
  ('2027-09-15', '中秋节', true, 2027),
  ('2027-10-01', '国庆节', true, 2027),
  ('2027-10-02', '国庆节', true, 2027),
  ('2027-10-03', '国庆节', true, 2027)
on conflict (date) do nothing;
