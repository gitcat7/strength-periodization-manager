create or replace function public.revise_completed_workout(
  p_workout_id uuid,
  p_logs jsonb,
  p_duration_seconds integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_duration_seconds integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = 'P0001';
  end if;

  if p_duration_seconds is not null
     and p_duration_seconds not between 60 and 43200 then
    raise exception 'Workout duration is invalid' using errcode = 'P0001';
  end if;

  select duration_seconds
    into v_duration_seconds
  from public.plan_workouts
  where id = p_workout_id
    and user_id = auth.uid()
    and status = 'completed'
    and day_type = 'training'
  for update;

  if not found then
    raise exception 'Completed training workout was not found' using errcode = 'P0001';
  end if;

  v_result := public.revise_completed_workout_logs(p_workout_id, p_logs);

  update public.plan_workouts
  set duration_seconds = coalesce(p_duration_seconds, duration_seconds),
      updated_at = now()
  where id = p_workout_id
    and user_id = auth.uid()
  returning duration_seconds into v_duration_seconds;

  return v_result || jsonb_build_object('duration_seconds', v_duration_seconds,
    'workout_id', p_workout_id
  );
end;
$$;

revoke all on function public.revise_completed_workout(uuid, jsonb, integer)
  from public, anon;
grant execute on function public.revise_completed_workout(uuid, jsonb, integer) to authenticated;
