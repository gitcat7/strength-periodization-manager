-- Standalone drafts are owned by auth.uid() and are updated in place.
-- This migration intentionally follows the already-applied standalone creation migration.
insert into public.exercises (
  slug, name, category, default_increment, is_main_lift,
  catalog_external_id, training_direction, movement_pattern, substitution_enabled
)
values
  ('floor_crunch', '卷腹', 'cardio', 0, false, null, 'cardio', 'trunk_flexion', false),
  ('front_plank_twist', '平板支撑转体', 'cardio', 0, false, null, 'cardio', 'anti_rotation', false),
  ('burpee', '波比跳', 'cardio', 0, false, null, 'cardio', 'full_body', false)
on conflict (slug) do update set
  name = excluded.name,
  category = excluded.category,
  default_increment = excluded.default_increment,
  catalog_external_id = coalesce(public.exercises.catalog_external_id, excluded.catalog_external_id),
  training_direction = excluded.training_direction,
  movement_pattern = excluded.movement_pattern,
  substitution_enabled = excluded.substitution_enabled;

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
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = 'P0001';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object'
    or jsonb_typeof(p_payload -> 'exercises') <> 'array'
    or jsonb_array_length(p_payload -> 'exercises') = 0 then
    raise exception 'Standalone workout payload is invalid' using errcode = 'P0001';
  end if;

  begin
    v_date := (p_payload ->> 'scheduled_date')::date;
  exception when others then
    raise exception 'Standalone workout date is invalid' using errcode = 'P0001';
  end;
  v_status := p_payload ->> 'status';
  if v_status not in ('draft', 'completed') then
    raise exception 'Standalone workout status is invalid' using errcode = 'P0001';
  end if;

  if nullif(p_payload ->> 'workout_id', '') is not null then
    begin
      v_workout_id := (p_payload ->> 'workout_id')::uuid;
    exception when others then
      raise exception 'Standalone workout id is invalid' using errcode = 'P0001';
    end;
    select workout.id into v_workout_id
    from public.workouts as workout
    where workout.id = v_workout_id
      and workout.user_id = v_user_id
      and workout.program_id is null
      and workout.day_type = 'training'
      and workout.status = 'draft'
    for update;
    if v_workout_id is null then
      raise exception 'Standalone draft was not found' using errcode = 'P0001';
    end if;

    update public.workouts
    set scheduled_date = v_date,
        name = '单次训练 · ' || to_char(v_date, 'YYYY-MM-DD'),
        status = v_status,
        completed_at = case when v_status = 'completed' then now() else null end,
        updated_at = now()
    where id = v_workout_id;

    delete from public.workout_exercises where workout_id = v_workout_id;
  else
    insert into public.workouts (program_id, user_id, scheduled_date, sequence_index, schedule_index, day_type, name, status, completed_at)
    values (null, v_user_id, v_date, 0, 0, 'training', '单次训练 · ' || to_char(v_date, 'YYYY-MM-DD'), v_status,
      case when v_status = 'completed' then now() else null end)
    returning id into v_workout_id;
  end if;

  for v_item in select value from jsonb_array_elements(p_payload -> 'exercises') loop
    if jsonb_typeof(v_item) <> 'object'
      or jsonb_typeof(v_item -> 'sets') <> 'array'
      or jsonb_array_length(v_item -> 'sets') = 0 then
      raise exception 'Standalone exercise is invalid' using errcode = 'P0001';
    end if;
    begin
      v_exercise_id := (v_item ->> 'exercise_id')::uuid;
    exception when others then
      raise exception 'Standalone exercise is invalid' using errcode = 'P0001';
    end;
    if v_exercise_id = any(v_seen_exercise_ids)
      or not exists (select 1 from public.exercises where id = v_exercise_id) then
      raise exception 'Standalone exercise is invalid' using errcode = 'P0001';
    end if;
    v_seen_exercise_ids := array_append(v_seen_exercise_ids, v_exercise_id);
    v_index := v_index + 1;
    insert into public.workout_exercises (workout_id, exercise_id, order_index, target_sets, target_reps, target_weight)
    values (v_workout_id, v_exercise_id, v_index, jsonb_array_length(v_item -> 'sets'), 1, 0)
    returning id into v_workout_exercise_id;

    v_set_index := 0;
    for v_set in select value from jsonb_array_elements(v_item -> 'sets') loop
      if jsonb_typeof(v_set) <> 'object' then
        raise exception 'Standalone set is invalid' using errcode = 'P0001';
      end if;
      begin
        v_weight := nullif(v_set ->> 'weight', '')::numeric;
        v_reps := nullif(v_set ->> 'reps', '')::integer;
        v_rpe := nullif(v_set ->> 'rpe', '')::numeric;
        v_completed := coalesce((v_set ->> 'completed')::boolean, false);
      exception when others then
        raise exception 'Standalone set is invalid' using errcode = 'P0001';
      end;
      if v_weight is not null and (v_weight < 0 or v_weight::text in ('NaN', 'Infinity', '-Infinity'))
        or v_reps is not null and v_reps < 0
        or v_rpe is not null and (v_rpe < 1 or v_rpe > 10 or v_rpe::text in ('NaN', 'Infinity', '-Infinity')) then
        raise exception 'Standalone set is invalid' using errcode = 'P0001';
      end if;
      v_set_index := v_set_index + 1;
      insert into public.set_logs (workout_exercise_id, set_index, target_weight, target_reps, actual_weight, actual_reps, rpe, completed)
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
  v_workout public.workouts%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = 'P0001';
  end if;
  select * into v_workout
  from public.workouts as workout
  where workout.user_id = v_user_id
    and workout.program_id is null
    and workout.day_type = 'training'
    and workout.status = 'draft'
  order by workout.updated_at desc, workout.created_at desc
  limit 1;
  if v_workout.id is null then return null; end if;

  return jsonb_build_object(
    'workout_id', v_workout.id,
    'scheduled_date', v_workout.scheduled_date,
    'exercises', coalesce((
      select jsonb_agg(jsonb_build_object(
        'exercise_id', workout_exercise.exercise_id,
        'sets', coalesce((
          select jsonb_agg(jsonb_build_object(
            'completed', set_log.completed,
            'reps', coalesce(set_log.actual_reps::text, ''),
            'rpe', coalesce(set_log.rpe::text, ''),
            'weight', coalesce(set_log.actual_weight::text, '')
          ) order by set_log.set_index)
          from public.set_logs as set_log
          where set_log.workout_exercise_id = workout_exercise.id
        ), '[]'::jsonb)
      ) order by workout_exercise.order_index)
      from public.workout_exercises as workout_exercise
      where workout_exercise.workout_id = v_workout.id
    ), '[]'::jsonb)
  );
end;
$$;

-- Backward-compatible entry point: it always creates a new standalone workout.
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
