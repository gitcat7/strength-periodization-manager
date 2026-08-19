begin;

-- Repair only schedule ordering metadata for active programs. Workout dates,
-- statuses, training sequence, prescriptions, logs, and completion facts stay unchanged.
set constraints plan_workouts_program_schedule_index_key deferred;

create or replace function public.repair_active_program_schedule_indexes()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_affected_program_ids uuid[] := '{}';
  v_repaired_count integer := 0;
begin
  with ordered as (
    select
      w.id,
      w.program_id,
      w.schedule_index,
      row_number() over (
        partition by w.program_id
        order by w.scheduled_date, w.schedule_index, w.id
      ) - 1 as correct_schedule_index
    from public.plan_workouts w
    join public.plan_programs p on p.id = w.program_id
    where p.status = 'active'
  )
  select coalesce(array_agg(distinct program_id), '{}')
  into v_affected_program_ids
  from ordered
  where schedule_index <> correct_schedule_index;

  with ordered as (
    select
      w.id,
      row_number() over (
        partition by w.program_id
        order by w.scheduled_date, w.schedule_index, w.id
      ) - 1 as correct_schedule_index
    from public.plan_workouts w
    join public.plan_programs p on p.id = w.program_id
    where p.status = 'active'
  )
  update public.plan_workouts w
  set schedule_index = ordered.correct_schedule_index
  from ordered
  where w.id = ordered.id
    and w.schedule_index <> ordered.correct_schedule_index;

  get diagnostics v_repaired_count = row_count;

  update public.plan_programs p
  set schedule_revision = p.schedule_revision + 1,
      updated_at = now()
  where p.id = any(v_affected_program_ids);

  return v_repaired_count;
end;
$$;

revoke all on function public.repair_active_program_schedule_indexes() from public, anon, authenticated;
select public.repair_active_program_schedule_indexes();

-- Enforce schedule chronology after the one-time repair.
create or replace function public.ensure_schedule_dates_follow_index()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_program_id uuid;
begin
  for v_program_id in
    select distinct candidate_program_id
    from unnest(array[
      case when tg_op = 'UPDATE' then old.program_id end,
      case when tg_op in ('INSERT', 'UPDATE') then new.program_id end
    ]) as candidate_programs(candidate_program_id)
    where candidate_program_id is not null
  loop
    if exists (
      select 1
      from (
        select
          scheduled_date,
          lag(scheduled_date) over (order by schedule_index) as previous_scheduled_date
        from public.plan_workouts
        where program_id = v_program_id
      ) ordered
      where ordered.previous_scheduled_date is not null
        and ordered.scheduled_date < ordered.previous_scheduled_date
    ) then
      raise exception 'Workout scheduled dates must follow schedule_index' using errcode = '23514';
    end if;
  end loop;

  return null;
end;
$$;

drop trigger if exists workouts_require_schedule_date_order on public.plan_workouts;
create constraint trigger workouts_require_schedule_date_order
after insert or update of program_id, schedule_index, scheduled_date on public.plan_workouts
deferrable initially deferred
for each row execute function public.ensure_schedule_dates_follow_index();

revoke all on function public.ensure_schedule_dates_follow_index() from public, anon, authenticated;

-- The RPC performs the same final-state check before it records a revision/event,
-- so malformed clients fail atomically with a stable message.
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

  if exists (
    select 1
    from (
      select
        scheduled_date,
        lag(scheduled_date) over (order by schedule_index) as previous_scheduled_date
      from public.plan_workouts
      where program_id = v_program_id
    ) ordered
    where ordered.previous_scheduled_date is not null
      and ordered.scheduled_date < ordered.previous_scheduled_date
  ) then
    raise exception 'Workout scheduled dates must follow schedule_index' using errcode = '23514';
  end if;

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

-- Collapse legacy duplicates before adding the concurrency backstop. The newest
-- pending row wins; accepted, modified, and rejected audit history is untouched.
create or replace function public.deduplicate_pending_workout_recommendations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_count integer := 0;
begin
  with ranked as (
    select
      id,
      row_number() over (
        partition by user_id, workout_id, exercise_id
        order by updated_at desc, created_at desc, id desc
      ) as duplicate_rank
    from public.log_recommendations
    where status = 'pending'
      and workout_id is not null
  )
  delete from public.log_recommendations recommendation
  using ranked
  where recommendation.id = ranked.id
    and ranked.duplicate_rank > 1;

  get diagnostics v_deleted_count = row_count;
  return v_deleted_count;
end;
$$;

revoke all on function public.deduplicate_pending_workout_recommendations() from public, anon, authenticated;
select public.deduplicate_pending_workout_recommendations();

create unique index if not exists log_recommendations_one_pending_per_workout_exercise_idx
  on public.log_recommendations (user_id, workout_id, exercise_id)
  where status = 'pending' and workout_id is not null;

create or replace function public.replace_pending_workout_recommendations(p_user_id uuid, p_workout_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  -- Serializes completion and history-revision retries for the same source workout.
  perform 1
  from public.plan_workouts
  where id = p_workout_id and user_id = p_user_id
  for update;

  if not found then
    raise exception 'Training workout was not found' using errcode = 'P0001';
  end if;

  delete from public.log_recommendations
  where user_id = p_user_id and workout_id = p_workout_id and status = 'pending';

  with target_attainment as (
    select
      we.exercise_id,
      max(we.target_weight) as target_weight,
      ce.default_increment,
      ce.is_main_lift,
      count(*) as total_sets,
      count(*) filter (where sl.completed) as completed_sets,
      count(*) filter (
        where sl.completed
          and sl.actual_weight >= sl.target_weight
          and sl.actual_reps >= sl.target_reps
      ) as attained_sets,
      avg(sl.rpe) filter (where sl.completed) as average_rpe
    from public.plan_workout_exercises we
    join public.cfg_exercises ce on ce.id = we.exercise_id
    join public.log_set_logs sl on sl.workout_exercise_id = we.id
    where we.workout_id = p_workout_id and we.target_weight > 0
    group by we.exercise_id, ce.default_increment, ce.is_main_lift
  ), inserted as (
    insert into public.log_recommendations (
      user_id, exercise_id, workout_id, recommendation_type,
      previous_weight, suggested_weight, reason, status
    )
    select
      p_user_id,
      exercise_id,
      p_workout_id,
      case
        when completed_sets * 2 < total_sets then 'deload'
        when is_main_lift and attained_sets < completed_sets then 'decrease'
        when is_main_lift and average_rpe >= 9 then 'decrease'
        when is_main_lift and attained_sets = total_sets and average_rpe <= 7 then 'increase'
        else 'hold'
      end,
      target_weight,
      case
        when completed_sets * 2 < total_sets then round((target_weight * 0.9) / nullif(default_increment, 0)) * default_increment
        when is_main_lift and (attained_sets < completed_sets or average_rpe >= 9) then round((target_weight * 0.975) / nullif(default_increment, 0)) * default_increment
        when is_main_lift and attained_sets = total_sets and average_rpe <= 7 then round((target_weight + default_increment) / nullif(default_increment, 0)) * default_increment
        else target_weight
      end,
      case
        when completed_sets * 2 < total_sets then '完成不足一半，建议减量恢复。'
        when is_main_lift and attained_sets < completed_sets then '未达成目标重量或次数，建议小幅降重。'
        when is_main_lift and average_rpe >= 9 then '平均 RPE 过高，建议小幅降重。'
        when is_main_lift and attained_sets = total_sets and average_rpe <= 7 then '全部达标且 RPE 可控，建议按增量加重。'
        else '保持当前处方，继续观察完成质量。'
      end,
      'pending'
    from target_attainment
    on conflict (user_id, workout_id, exercise_id)
      where status = 'pending' and workout_id is not null
    do update set
      recommendation_type = excluded.recommendation_type,
      previous_weight = excluded.previous_weight,
      suggested_weight = excluded.suggested_weight,
      reason = excluded.reason,
      updated_at = now()
    returning exercise_id, recommendation_type, previous_weight, suggested_weight, reason, status
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'exercise_id', exercise_id,
    'recommendation_type', recommendation_type,
    'previous_weight', previous_weight,
    'suggested_weight', suggested_weight,
    'reason', reason,
    'status', status
  )), '[]'::jsonb)
  into v_result
  from inserted;

  return v_result;
end;
$$;

revoke all on function public.replace_pending_workout_recommendations(uuid, uuid)
  from public, anon, authenticated;

commit;
