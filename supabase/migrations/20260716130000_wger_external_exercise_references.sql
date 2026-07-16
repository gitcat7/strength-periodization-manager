-- External exercise references are snapshots for standalone workouts only.
alter table public.workout_exercises alter column exercise_id drop not null;
alter table public.workout_exercises add column if not exists exercise_provider text;
alter table public.workout_exercises add column if not exists external_exercise_id text;
alter table public.workout_exercises add column if not exists exercise_name_snapshot text;
alter table public.workout_exercises add column if not exists exercise_metadata_snapshot jsonb;

alter table public.workout_exercises drop constraint if exists workout_exercises_reference_shape_check;
alter table public.workout_exercises add constraint workout_exercises_reference_shape_check check (
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
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or jsonb_typeof(p_payload -> 'exercises') <> 'array' or jsonb_array_length(p_payload -> 'exercises') = 0 then
    raise exception 'Standalone workout payload is invalid' using errcode = 'P0001';
  end if;
  begin v_date := (p_payload ->> 'scheduled_date')::date;
  exception when others then raise exception 'Standalone workout date is invalid' using errcode = 'P0001'; end;
  v_status := p_payload ->> 'status';
  if v_status not in ('draft', 'completed') then raise exception 'Standalone workout status is invalid' using errcode = 'P0001'; end if;

  if nullif(p_payload ->> 'workout_id', '') is not null then
    begin v_workout_id := (p_payload ->> 'workout_id')::uuid;
    exception when others then raise exception 'Standalone workout id is invalid' using errcode = 'P0001'; end;
    select workout.id into v_workout_id from public.workouts as workout
    where workout.id = v_workout_id and workout.user_id = v_user_id and workout.program_id is null
      and workout.day_type = 'training' and workout.status = 'draft' for update;
    if v_workout_id is null then raise exception 'Standalone draft was not found' using errcode = 'P0001'; end if;
    update public.workouts set scheduled_date = v_date, name = '单次训练 · ' || to_char(v_date, 'YYYY-MM-DD'), status = v_status,
      completed_at = case when v_status = 'completed' then now() else null end, updated_at = now() where id = v_workout_id;
    delete from public.workout_exercises where workout_id = v_workout_id;
  else
    insert into public.workouts (program_id, user_id, scheduled_date, sequence_index, schedule_index, day_type, name, status, completed_at)
    values (null, v_user_id, v_date, 0, 0, 'training', '单次训练 · ' || to_char(v_date, 'YYYY-MM-DD'), v_status,
      case when v_status = 'completed' then now() else null end) returning id into v_workout_id;
  end if;

  for v_item in select value from jsonb_array_elements(p_payload -> 'exercises') loop
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
      if v_exercise_id = any(v_seen_exercise_ids) or not exists (select 1 from public.exercises where id = v_exercise_id) then
        raise exception 'Standalone exercise is invalid' using errcode = 'P0001';
      end if;
      v_seen_exercise_ids := array_append(v_seen_exercise_ids, v_exercise_id);
    end if;
    v_index := v_index + 1;
    insert into public.workout_exercises (workout_id, exercise_id, exercise_provider, external_exercise_id, exercise_name_snapshot, exercise_metadata_snapshot, order_index, target_sets, target_reps, target_weight)
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
      insert into public.set_logs (workout_exercise_id, set_index, target_weight, target_reps, actual_weight, actual_reps, rpe, completed)
      values (v_workout_exercise_id, v_set_index, 0, 1, v_weight, v_reps, v_rpe, v_completed);
    end loop;
  end loop;
  return v_workout_id;
end;
$$;

create or replace function public.get_standalone_workout_draft()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user_id uuid := auth.uid(); v_workout public.workouts%rowtype;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = 'P0001'; end if;
  select * into v_workout from public.workouts as workout where workout.user_id = v_user_id and workout.program_id is null
    and workout.day_type = 'training' and workout.status = 'draft' order by workout.updated_at desc, workout.created_at desc limit 1;
  if v_workout.id is null then return null; end if;
  return jsonb_build_object('workout_id', v_workout.id, 'scheduled_date', v_workout.scheduled_date, 'exercises', coalesce((
    select jsonb_agg(jsonb_build_object('exercise_id', we.exercise_id, 'exercise_provider', we.exercise_provider,
      'external_exercise_id', we.external_exercise_id, 'exercise_name_snapshot', we.exercise_name_snapshot,
      'exercise_metadata_snapshot', we.exercise_metadata_snapshot, 'sets', coalesce((
        select jsonb_agg(jsonb_build_object('completed', sl.completed, 'reps', coalesce(sl.actual_reps::text, ''),
          'rpe', coalesce(sl.rpe::text, ''), 'weight', coalesce(sl.actual_weight::text, '')) order by sl.set_index)
        from public.set_logs sl where sl.workout_exercise_id = we.id), '[]'::jsonb)) order by we.order_index)
    from public.workout_exercises we where we.workout_id = v_workout.id), '[]'::jsonb));
end;
$$;

revoke all on function public.save_standalone_workout(jsonb) from public, anon;
revoke all on function public.get_standalone_workout_draft() from public, anon;
grant execute on function public.save_standalone_workout(jsonb) to authenticated;
grant execute on function public.get_standalone_workout_draft() to authenticated;
