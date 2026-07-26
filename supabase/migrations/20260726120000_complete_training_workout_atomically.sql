create or replace function public.complete_training_workout(
  p_workout_id uuid,
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
  if auth.role() = 'service_role' then
    v_user_id := p_user_id;
  elsif p_user_id is not null then
    raise exception 'Client identity is derived from the authenticated session' using errcode = 'P0001';
  else
    v_user_id := auth.uid();
  end if;

  if v_user_id is null then
    raise exception 'Authentication required' using errcode = 'P0001';
  end if;

  select * into v_workout
  from public.plan_workouts
  where id = p_workout_id and user_id = v_user_id and day_type = 'training'
  for update;

  if v_workout.id is null then
    raise exception 'Training workout was not found' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.plan_workout_exercises we
    left join public.log_set_logs sl on sl.workout_exercise_id = we.id
    where we.workout_id = p_workout_id
      and (
        sl.id is null
        or not sl.completed
        or sl.actual_reps is null or sl.actual_reps <= 0
        or sl.rpe is null or sl.rpe < 1 or sl.rpe > 10
        or (sl.target_weight > 0 and (sl.actual_weight is null or sl.actual_weight <= 0))
      )
  ) then
    raise exception 'All planned sets require valid completed results before finishing' using errcode = 'P0001';
  end if;

  update public.plan_workouts
  set status = 'completed', completed_at = coalesce(completed_at, now()), updated_at = now()
  where id = p_workout_id;

  return jsonb_build_object('workout_id', p_workout_id, 'status', 'completed');
end;
$$;

revoke all on function public.complete_training_workout(uuid, uuid) from public, anon;
grant execute on function public.complete_training_workout(uuid, uuid) to authenticated;
