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

-- Atomically reflow a program schedule guarded by its schedule revision. The RPC
-- derives ownership from auth.uid(), never from client-supplied fields.
create or replace function public.reflow_program_schedule(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_program_id uuid;
  v_expected_revision integer;
  v_action text;
  v_effective_date date;
  v_resume_route text;
  v_reason text;
  v_program record;
  v_item jsonb;
  v_workout_id uuid;
  v_workout_status text;
  v_updated_count integer := 0;
  v_skipped_ids uuid[] := '{}';
  v_event_type text;
  v_new_revision integer;
  v_next_workout jsonb;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = 'P0001';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Schedule reflow payload is invalid' using errcode = 'P0001';
  end if;

  v_action := p_payload ->> 'action';
  if v_action is null or v_action not in ('extra_rest', 'resume', 'holiday_override', 'unavailable_dates') then
    raise exception 'Schedule reflow payload is invalid' using errcode = 'P0001';
  end if;

  begin
    v_program_id := (p_payload ->> 'program_id')::uuid;
    v_expected_revision := (p_payload ->> 'expected_revision')::integer;
    v_effective_date := (p_payload ->> 'effective_date')::date;
  exception when others then
    raise exception 'Schedule reflow payload is invalid' using errcode = 'P0001';
  end;

  if v_program_id is null or v_expected_revision is null or v_expected_revision < 1 or v_effective_date is null then
    raise exception 'Schedule reflow payload is invalid' using errcode = 'P0001';
  end if;

  v_resume_route := p_payload ->> 'resume_route';
  if v_action = 'resume' then
    if v_resume_route is null or v_resume_route not in ('continue_current_cycle', 'start_next_cycle') then
      raise exception 'Resume requires an explicit route' using errcode = 'P0001';
    end if;
  else
    v_resume_route := null;
  end if;

  v_reason := p_payload ->> 'reason';
  if v_reason is not null and v_reason not in ('fatigue', 'time_conflict', 'minor_discomfort', 'injury', 'personal', 'other') then
    raise exception 'Schedule reflow payload is invalid' using errcode = 'P0001';
  end if;

  if p_payload -> 'schedule_items' is not null and jsonb_typeof(p_payload -> 'schedule_items') <> 'array' then
    raise exception 'Schedule reflow payload is invalid' using errcode = 'P0001';
  end if;

  select * into v_program
  from public.plan_programs
  where id = v_program_id
  for update;

  if not found or v_program.user_id <> v_user_id or v_program.status = 'archived' then
    raise exception 'Program not found' using errcode = 'P0001';
  end if;

  if v_program.schedule_revision <> v_expected_revision then
    raise exception 'Schedule changed; refresh before confirming' using errcode = 'P0001';
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_payload -> 'schedule_items', '[]'::jsonb))
  loop
    begin
      v_workout_id := (v_item ->> 'workout_id')::uuid;
    exception when others then
      raise exception 'Schedule reflow payload is invalid' using errcode = 'P0001';
    end;

    select w.status into v_workout_status
    from public.plan_workouts w
    where w.id = v_workout_id and w.program_id = v_program_id;

    if not found then
      raise exception 'Schedule reflow payload is invalid' using errcode = 'P0001';
    end if;

    if v_workout_status <> 'scheduled' then
      raise exception 'Completed or draft training cannot be rescheduled' using errcode = 'P0001';
    end if;

    if (v_item ->> 'status') = 'skipped' then
      update public.plan_workouts
      set status = 'skipped',
          skip_reason = 'recovery_strategy'
      where id = v_workout_id;
      v_skipped_ids := v_skipped_ids || v_workout_id;
    else
      update public.plan_workouts
      set scheduled_date = (v_item ->> 'scheduled_date')::date,
          schedule_index = (v_item ->> 'schedule_index')::integer
      where id = v_workout_id;
    end if;
    v_updated_count := v_updated_count + 1;
  end loop;

  v_event_type := case v_action
    when 'extra_rest' then 'extra_rest'
    when 'resume' then 'resume_confirmed'
    when 'holiday_override' then 'holiday_override'
    else 'unavailable_date_added'
  end;

  update public.plan_programs
  set schedule_revision = schedule_revision + 1
  where id = v_program_id
  returning schedule_revision into v_new_revision;

  insert into public.ops_schedule_events (user_id, program_id, event_type, effective_date, metadata, schedule_revision)
  values (
    v_user_id,
    v_program_id,
    v_event_type,
    v_effective_date,
    jsonb_strip_nulls(jsonb_build_object(
      'action', v_action,
      'resume_route', v_resume_route,
      'reason', v_reason,
      'skipped_workout_ids', to_jsonb(v_skipped_ids),
      'updated_item_count', v_updated_count
    )),
    v_new_revision
  );

  select jsonb_build_object(
    'id', w.id,
    'name', w.name,
    'scheduled_date', w.scheduled_date,
    'sequence_index', w.sequence_index
  ) into v_next_workout
  from public.plan_workouts w
  where w.program_id = v_program_id
    and w.status = 'scheduled'
    and w.day_type = 'training'
  order by w.scheduled_date, w.schedule_index
  limit 1;

  return jsonb_build_object(
    'schedule_revision', v_new_revision,
    'updated_item_count', v_updated_count,
    'skipped_count', coalesce(array_length(v_skipped_ids, 1), 0),
    'next_workout', v_next_workout
  );
end;
$$;

revoke execute on function public.reflow_program_schedule(jsonb) from public, anon;
grant execute on function public.reflow_program_schedule(jsonb) to authenticated;
