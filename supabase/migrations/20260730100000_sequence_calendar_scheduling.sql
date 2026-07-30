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

-- Persist sequence-cycle metadata and holiday policy on program replacement.
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
  v_holiday_policy text;
  v_timezone text;
  v_cycle_index integer;
  v_cycle_position integer;
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
  v_holiday_policy := coalesce(nullif(btrim(p_payload ->> 'holiday_policy'), ''), 'train');
  v_timezone := coalesce(nullif(btrim(p_payload ->> 'timezone'), ''), 'Asia/Shanghai');
  if v_name is null or v_name = ''
    or v_template_type not in ('three_day_full_body', 'four_day_upper_lower', 'one_split', 'three_split', 'five_split', 'push_pull_squat', 'custom')
    or v_schedule_mode not in ('fixed_weekdays', 'cadence', 'flexible')
    or v_holiday_policy not in ('train', 'rest_and_shift')
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
  insert into public.plan_programs (user_id, name, template_type, custom_template_name, schedule_mode, schedule_config, holiday_policy, timezone, status, start_date, end_date)
  values (v_user_id, v_name, v_template_type, v_custom_template_name, v_schedule_mode, v_schedule_config, v_holiday_policy, v_timezone, 'active', v_start_date, v_end_date)
  returning id into v_program_id;
  for v_item in select value from jsonb_array_elements(v_items) loop
    v_schedule_index := (v_item ->> 'schedule_index')::integer;
    v_day_type := v_item ->> 'day_type';
    v_sequence_index := case when v_day_type = 'training' then (v_item ->> 'sequence_index')::integer else null end;
    v_cycle_index := case when v_day_type = 'training' and (v_item ->> 'cycle_index') ~ '^(0|[1-9][0-9]*)$' then (v_item ->> 'cycle_index')::integer else null end;
    v_cycle_position := case when v_day_type = 'training' and (v_item ->> 'cycle_position') ~ '^(0|[1-9][0-9]*)$' then (v_item ->> 'cycle_position')::integer else null end;
    insert into public.plan_workouts (program_id, user_id, scheduled_date, sequence_index, schedule_index, day_type, name, status, cycle_index, cycle_position)
    values (v_program_id, v_user_id, (v_item ->> 'scheduled_date')::date, v_sequence_index, v_schedule_index, v_day_type, btrim(v_item ->> 'name'), 'scheduled', v_cycle_index, v_cycle_position)
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
