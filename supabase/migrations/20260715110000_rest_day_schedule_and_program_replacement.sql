alter table public.workouts
  add column day_type text not null default 'training' check (day_type in ('training', 'rest')),
  add column schedule_index integer;

update public.workouts
set schedule_index = sequence_index
where schedule_index is null;

alter table public.workouts alter column schedule_index set not null;
alter table public.workouts alter column sequence_index drop not null;
alter table public.workouts add constraint workouts_program_schedule_index_key unique (program_id, schedule_index);

alter table public.workouts
  add constraint workouts_day_type_sequence_index_check
  check (
    (day_type = 'training' and sequence_index is not null)
    or (day_type = 'rest' and sequence_index is null)
  );

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
    select 1
    from public.workouts as workout
    where workout.id = new.workout_id
      and workout.day_type = 'training'
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
    select 1
    from public.workout_exercises as workout_exercise
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
      from public.workouts
      where program_id = v_program_id;

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
      if (v_item ->> 'sequence_index') !~ '^(0|[1-9][0-9]*)$'
        or jsonb_array_length(v_item -> 'exercises') = 0 then
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

  perform 1
  from auth.users
  where id = v_user_id
  for update;

  perform 1
  from public.programs
  where user_id = v_user_id
    and status = 'active'
  for update;

  insert into public.programs (
    user_id, name, template_type, custom_template_name, schedule_mode, schedule_config, status, start_date, end_date
  ) values (
    v_user_id, v_name, v_template_type, v_custom_template_name, v_schedule_mode, v_schedule_config, 'active', v_start_date, v_end_date
  ) returning id into v_program_id;

  for v_item in select value from jsonb_array_elements(v_items) loop
    v_schedule_index := (v_item ->> 'schedule_index')::integer;
    v_day_type := v_item ->> 'day_type';
    v_sequence_index := case when v_day_type = 'training' then (v_item ->> 'sequence_index')::integer else null end;

    insert into public.workouts (
      program_id, user_id, scheduled_date, sequence_index, schedule_index, day_type, name, status
    ) values (
      v_program_id, v_user_id, (v_item ->> 'scheduled_date')::date, v_sequence_index, v_schedule_index, v_day_type, btrim(v_item ->> 'name'), 'scheduled'
    ) returning id into v_workout_id;

    if v_schedule_index = 0 then
      v_first_schedule_item_id := v_workout_id;
    end if;

    if v_day_type = 'training' then
      for v_exercise in select value from jsonb_array_elements(v_item -> 'exercises') loop
        insert into public.workout_exercises (
          workout_id, exercise_id, order_index, target_sets, target_reps, target_weight
        ) values (
          v_workout_id,
          (v_exercise ->> 'exercise_id')::uuid,
          (v_exercise ->> 'order_index')::integer,
          (v_exercise ->> 'target_sets')::integer,
          (v_exercise ->> 'target_reps')::integer,
          (v_exercise ->> 'target_weight')::numeric
        );
      end loop;
    end if;
  end loop;

  update public.programs
  set status = 'archived', updated_at = now()
  where user_id = v_user_id
    and status = 'active'
    and id <> v_program_id;

  return query select v_program_id, v_first_schedule_item_id, v_training_days, v_rest_days;
end;
$$;

revoke execute on function public.replace_active_program(jsonb) from public, anon;
grant execute on function public.replace_active_program(jsonb) to authenticated;
