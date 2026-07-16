-- P0 recording references are snapshots scoped by the owning workout. They do
-- not create a public exercise catalog and never accept a user id from callers.
alter table public.workout_exercises drop constraint if exists workout_exercises_reference_shape_check;
alter table public.workout_exercises add constraint workout_exercises_reference_shape_check check (
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
    select workout.id into v_workout_id from public.workouts workout
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
    v_provider := nullif(v_item ->> 'exercise_provider', '');
    v_reference_id := nullif(v_item ->> 'external_exercise_id', '');
    v_name := btrim(v_item ->> 'exercise_name_snapshot'); v_metadata := v_item -> 'exercise_metadata_snapshot';
    v_load_type := coalesce(v_metadata ->> 'loadType', 'weighted');
    if v_provider is null then
      if (v_item ? 'external_exercise_id') or (v_item ? 'exercise_name_snapshot') or (v_item ? 'exercise_metadata_snapshot') then raise exception 'Standalone exercise reference is invalid' using errcode = 'P0001'; end if;
      begin v_exercise_id := (v_item ->> 'exercise_id')::uuid;
      exception when others then raise exception 'Standalone exercise is invalid' using errcode = 'P0001'; end;
      if ('local:' || v_exercise_id::text) = any(v_seen_ids) or not exists (select 1 from public.exercises where id = v_exercise_id) then raise exception 'Standalone exercise is invalid' using errcode = 'P0001'; end if;
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
    insert into public.workout_exercises (workout_id, exercise_id, exercise_provider, external_exercise_id, exercise_name_snapshot, exercise_metadata_snapshot, order_index, target_sets, target_reps, target_weight)
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
      insert into public.set_logs (workout_exercise_id, set_index, target_weight, target_reps, actual_weight, actual_reps, rpe, completed)
      values (v_workout_exercise_id, v_set_index, 0, 1, v_weight, v_reps, v_rpe, v_completed);
    end loop;
  end loop;
  return v_workout_id;
end;
$$;

revoke all on function public.save_standalone_workout(jsonb) from public, anon;
grant execute on function public.save_standalone_workout(jsonb) to authenticated;
