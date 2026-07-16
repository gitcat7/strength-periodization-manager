-- Standalone training sessions belong directly to the authenticated athlete.
-- Program-backed workouts retain their existing owner checks and schedule rules.
alter table public.workouts
  alter column program_id drop not null;

drop policy if exists "Users manage own workouts" on public.workouts;
create policy "Users manage own workouts"
on public.workouts for all
to authenticated
using (
  auth.uid() = workouts.user_id
  and (
    workouts.program_id is null
    or exists (
      select 1 from public.programs as program
      where program.id = workouts.program_id
        and program.user_id = auth.uid()
    )
  )
)
with check (
  auth.uid() = workouts.user_id
  and (
    workouts.program_id is null
    or exists (
      select 1 from public.programs as program
      where program.id = workouts.program_id
        and program.user_id = auth.uid()
    )
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
    left join public.programs as program on program.id = workout.program_id
    where workout.id = workout_exercises.workout_id
      and workout.user_id = auth.uid()
      and (workout.program_id is null or program.user_id = auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.workouts as workout
    left join public.programs as program on program.id = workout.program_id
    where workout.id = workout_exercises.workout_id
      and workout.user_id = auth.uid()
      and (workout.program_id is null or program.user_id = auth.uid())
  )
);

create or replace function public.create_standalone_workout(p_payload jsonb)
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
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = 'P0001'; end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object'
    or jsonb_typeof(p_payload -> 'exercises') <> 'array'
    or jsonb_array_length(p_payload -> 'exercises') = 0 then
    raise exception 'Standalone workout payload is invalid' using errcode = 'P0001';
  end if;
  begin v_date := (p_payload ->> 'scheduled_date')::date; exception when others then raise exception 'Standalone workout date is invalid' using errcode = 'P0001'; end;
  v_status := p_payload ->> 'status';
  if v_status not in ('draft', 'completed') then raise exception 'Standalone workout status is invalid' using errcode = 'P0001'; end if;

  insert into public.workouts (program_id, user_id, scheduled_date, sequence_index, schedule_index, day_type, name, status, completed_at)
  values (null, v_user_id, v_date, 0, 0, 'training', '单次训练 · ' || to_char(v_date, 'YYYY-MM-DD'), v_status,
    case when v_status = 'completed' then now() else null end)
  returning id into v_workout_id;

  for v_item in select value from jsonb_array_elements(p_payload -> 'exercises') loop
    if jsonb_typeof(v_item) <> 'object' or jsonb_typeof(v_item -> 'sets') <> 'array' or jsonb_array_length(v_item -> 'sets') = 0 then
      raise exception 'Standalone exercise is invalid' using errcode = 'P0001';
    end if;
    begin v_exercise_id := (v_item ->> 'exercise_id')::uuid; exception when others then raise exception 'Standalone exercise is invalid' using errcode = 'P0001'; end;
    if not exists (select 1 from public.exercises where id = v_exercise_id) then raise exception 'Standalone exercise does not exist' using errcode = 'P0001'; end if;
    v_index := v_index + 1;
    insert into public.workout_exercises (workout_id, exercise_id, order_index, target_sets, target_reps, target_weight)
    values (v_workout_id, v_exercise_id, v_index, jsonb_array_length(v_item -> 'sets'), 1, 0)
    returning id into v_workout_exercise_id;
    for v_set in select value from jsonb_array_elements(v_item -> 'sets') loop
      insert into public.set_logs (workout_exercise_id, set_index, target_weight, target_reps, actual_weight, actual_reps, rpe, completed)
      values (v_workout_exercise_id, (v_set ->> 'set_index')::integer, 0, 1,
        nullif(v_set ->> 'weight', '')::numeric, nullif(v_set ->> 'reps', '')::integer,
        nullif(v_set ->> 'rpe', '')::numeric, coalesce((v_set ->> 'completed')::boolean, false));
    end loop;
  end loop;
  return v_workout_id;
end;
$$;

revoke all on function public.create_standalone_workout(jsonb) from public, anon;
grant execute on function public.create_standalone_workout(jsonb) to authenticated;
