-- Actual duration tracking is deliberately nullable for historical workouts.
alter table public.plan_workouts
  add column if not exists started_at timestamptz,
  add column if not exists duration_seconds integer;

alter table public.plan_workouts
  drop constraint if exists plan_workouts_duration_seconds_check;
alter table public.plan_workouts
  add constraint plan_workouts_duration_seconds_check
  check (duration_seconds is null or duration_seconds between 60 and 43200);

comment on column public.plan_workouts.started_at is '首次真实训练组操作的开始时刻；续训不得覆盖。';
comment on column public.plan_workouts.duration_seconds is '完成训练确认的实际时长，单位秒；历史记录可为空。';

create or replace function public.start_training_workout(p_workout_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workout public.plan_workouts%rowtype;
  v_started_at timestamptz;
begin
  select * into v_workout
  from public.plan_workouts
  where id = p_workout_id
    and user_id = auth.uid()
    and day_type = 'training'
    and status in ('scheduled', 'draft')
  for update;

  if v_workout.id is null then
    raise exception 'Training workout was not found' using errcode = 'P0001';
  end if;

  update public.plan_workouts
  set started_at = coalesce(started_at, now()), updated_at = now()
  where id = p_workout_id
  returning started_at into v_started_at;

  return v_started_at;
end;
$$;

revoke all on function public.start_training_workout(uuid) from public, anon;
grant execute on function public.start_training_workout(uuid) to authenticated;

create or replace function public.complete_training_workout(
  p_workout_id uuid,
  p_duration_seconds integer default null,
  p_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_workout public.plan_workouts%rowtype;
begin
  if auth.role() = 'service_role' then v_user_id := p_user_id;
  elsif p_user_id is not null then raise exception 'Client identity is derived from the authenticated session' using errcode = 'P0001';
  else v_user_id := auth.uid(); end if;
  if v_user_id is null then raise exception 'Authentication required' using errcode = 'P0001'; end if;

  select * into v_workout from public.plan_workouts
  where id = p_workout_id and user_id = v_user_id and day_type = 'training'
  for update;
  if v_workout.id is null then raise exception 'Training workout was not found' using errcode = 'P0001'; end if;
  if p_duration_seconds is not null and p_duration_seconds not between 60 and 43200 then raise exception 'Workout duration is invalid' using errcode = 'P0001'; end if;
  if v_workout.started_at is null and p_duration_seconds is null then raise exception 'Workout duration is required' using errcode = 'P0001'; end if;

  if exists (
    select 1 from public.plan_workout_exercises we left join public.log_set_logs sl on sl.workout_exercise_id = we.id
    where we.workout_id = p_workout_id and (sl.id is null or not sl.completed or sl.actual_reps is null or sl.actual_reps <= 0 or sl.rpe is null or sl.rpe < 1 or sl.rpe > 10 or (sl.target_weight > 0 and (sl.actual_weight is null or sl.actual_weight <= 0)))
  ) then raise exception 'All planned sets require valid completed results before finishing' using errcode = 'P0001'; end if;

  update public.plan_workouts
  set status = 'completed', completed_at = coalesce(completed_at, now()),
      duration_seconds = coalesce(duration_seconds, p_duration_seconds, greatest(60, least(43200, extract(epoch from (now() - started_at))::integer))),
      updated_at = now()
  where id = p_workout_id;
  return jsonb_build_object('workout_id', p_workout_id, 'status', 'completed');
end;
$$;

revoke all on function public.complete_training_workout(uuid, integer, uuid) from public, anon;
grant execute on function public.complete_training_workout(uuid, integer, uuid) to authenticated;

-- Keep the audited standalone validator intact and wrap it with duration state.
-- Renaming avoids duplicating its exercise-reference and set-validation rules.
alter function public.save_standalone_workout(jsonb) rename to save_standalone_workout_legacy;
revoke all on function public.save_standalone_workout_legacy(jsonb) from public, anon, authenticated;

create function public.save_standalone_workout(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.plan_workouts%rowtype;
  v_workout public.plan_workouts%rowtype;
  v_workout_id uuid;
  v_requested_start timestamptz;
  v_duration_seconds integer;
  v_status text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = 'P0001'; end if;
  v_status := p_payload ->> 'status';
  begin v_requested_start := nullif(p_payload ->> 'started_at', '')::timestamptz;
  exception when others then raise exception 'Workout start time is invalid' using errcode = 'P0001'; end;
  begin v_duration_seconds := nullif(p_payload ->> 'duration_seconds', '')::integer;
  exception when others then raise exception 'Workout duration is invalid' using errcode = 'P0001'; end;
  if v_duration_seconds is not null and v_duration_seconds not between 60 and 43200 then raise exception 'Workout duration is invalid' using errcode = 'P0001'; end if;

  if nullif(p_payload ->> 'workout_id', '') is not null then
    select * into v_existing from public.plan_workouts where id = (p_payload ->> 'workout_id')::uuid and user_id = auth.uid() and program_id is null for update;
  end if;
  if v_status = 'completed' and coalesce(v_existing.started_at, v_requested_start) is null and v_duration_seconds is null then
    raise exception 'Workout duration is required' using errcode = 'P0001';
  end if;

  v_workout_id := public.save_standalone_workout_legacy(p_payload - 'started_at' - 'duration_seconds');
  update public.plan_workouts
  set started_at = coalesce(started_at, v_requested_start),
      duration_seconds = case when v_status = 'completed' then coalesce(duration_seconds, v_duration_seconds, greatest(60, least(43200, extract(epoch from (now() - started_at))::integer))) else duration_seconds end,
      completed_at = case when v_status = 'completed' then coalesce(completed_at, now()) else completed_at end
  where id = v_workout_id
  returning * into v_workout;
  return jsonb_build_object('workout_id', v_workout.id, 'started_at', v_workout.started_at, 'duration_seconds', v_workout.duration_seconds);
end;
$$;

revoke all on function public.save_standalone_workout(jsonb) from public, anon;
grant execute on function public.save_standalone_workout(jsonb) to authenticated;

create or replace function public.get_standalone_workout_draft()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_workout public.plan_workouts%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = 'P0001'; end if;
  select * into v_workout from public.plan_workouts as workout
  where workout.user_id = auth.uid() and workout.program_id is null and workout.day_type = 'training' and workout.status = 'draft'
  order by workout.updated_at desc, workout.created_at desc limit 1;
  if v_workout.id is null then return null; end if;
  return jsonb_build_object('workout_id', v_workout.id, 'started_at', v_workout.started_at, 'scheduled_date', v_workout.scheduled_date, 'exercises', coalesce((
    select jsonb_agg(jsonb_build_object('exercise_id', we.exercise_id, 'exercise_provider', we.exercise_provider,
      'external_exercise_id', we.external_exercise_id, 'exercise_name_snapshot', we.exercise_name_snapshot,
      'exercise_metadata_snapshot', we.exercise_metadata_snapshot, 'sets', coalesce((
        select jsonb_agg(jsonb_build_object('completed', sl.completed, 'reps', coalesce(sl.actual_reps::text, ''), 'rpe', coalesce(sl.rpe::text, ''), 'weight', coalesce(sl.actual_weight::text, '')) order by sl.set_index)
        from public.log_set_logs sl where sl.workout_exercise_id = we.id), '[]'::jsonb)) order by we.order_index)
    from public.plan_workout_exercises we where we.workout_id = v_workout.id), '[]'::jsonb));
end;
$$;

revoke all on function public.get_standalone_workout_draft() from public, anon;
grant execute on function public.get_standalone_workout_draft() to authenticated;
