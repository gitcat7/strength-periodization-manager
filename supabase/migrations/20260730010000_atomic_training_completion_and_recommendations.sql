-- Authoritative completion closure: all terminal state and Coach advice share one transaction.
create or replace function public.replace_pending_workout_recommendations(p_user_id uuid, p_workout_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_result jsonb;
begin
  delete from public.log_recommendations
  where user_id = p_user_id and workout_id = p_workout_id and status = 'pending';

  with target_attainment as (
    select we.exercise_id, we.target_weight, ce.default_increment, ce.is_main_lift,
      count(*) as total_sets,
      count(*) filter (where sl.completed) as completed_sets,
      count(*) filter (where sl.completed and sl.actual_weight >= sl.target_weight and sl.actual_reps >= sl.target_reps) as attained_sets,
      avg(sl.rpe) filter (where sl.completed) as average_rpe
    from public.plan_workout_exercises we
    join public.cfg_exercises ce on ce.id = we.exercise_id
    join public.log_set_logs sl on sl.workout_exercise_id = we.id
    where we.workout_id = p_workout_id and we.target_weight > 0
    group by we.exercise_id, we.target_weight, ce.default_increment, ce.is_main_lift
  ), inserted as (
    insert into public.log_recommendations (user_id, exercise_id, workout_id, recommendation_type, previous_weight, suggested_weight, reason, status)
    select p_user_id, exercise_id, p_workout_id,
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
    returning exercise_id, recommendation_type, previous_weight, suggested_weight, reason, status
  ) select coalesce(jsonb_agg(jsonb_build_object('exercise_id', exercise_id, 'recommendation_type', recommendation_type, 'previous_weight', previous_weight, 'suggested_weight', suggested_weight, 'reason', reason, 'status', status)), '[]'::jsonb) into v_result from inserted;
  return v_result;
end; $$;

revoke all on function public.replace_pending_workout_recommendations(uuid, uuid) from public, anon, authenticated;

create or replace function public.complete_training_workout(p_workout_id uuid, p_duration_seconds integer default null, p_user_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user_id uuid; v_workout public.plan_workouts%rowtype; v_recommendations jsonb; v_duration_seconds integer;
begin
  if auth.role() = 'service_role' then v_user_id := p_user_id;
  elsif p_user_id is not null then raise exception 'Client identity is derived from the authenticated session' using errcode = 'P0001';
  else v_user_id := auth.uid(); end if;
  if v_user_id is null then raise exception 'Authentication required' using errcode = 'P0001'; end if;
  select * into v_workout from public.plan_workouts where id = p_workout_id and user_id = v_user_id and day_type = 'training' for update;
  if v_workout.id is null then raise exception 'Training workout was not found' using errcode = 'P0001'; end if;
  if v_workout.status = 'completed' then
    select coalesce(jsonb_agg(jsonb_build_object('exercise_id', exercise_id, 'recommendation_type', recommendation_type, 'previous_weight', previous_weight, 'suggested_weight', suggested_weight, 'reason', reason, 'status', status)), '[]'::jsonb) into v_recommendations from public.log_recommendations where workout_id = p_workout_id;
    return jsonb_build_object('workout_id', p_workout_id, 'status', 'completed', 'duration_seconds', v_workout.duration_seconds, 'recommendations', v_recommendations);
  end if;
  if p_duration_seconds is not null and p_duration_seconds not between 60 and 43200 then raise exception 'Workout duration is invalid' using errcode = 'P0001'; end if;
  if v_workout.started_at is null and p_duration_seconds is null then raise exception 'Workout duration is required' using errcode = 'P0001'; end if;
  if exists (select 1 from public.plan_workout_exercises we left join public.log_set_logs sl on sl.workout_exercise_id = we.id where we.workout_id = p_workout_id and (sl.id is null or not sl.completed)) then raise exception 'All planned sets require valid completed results before finishing' using errcode = 'P0001'; end if;
  v_recommendations := public.replace_pending_workout_recommendations(v_user_id, p_workout_id);
  update public.plan_workouts set status = 'completed', completed_at = coalesce(completed_at, now()), duration_seconds = coalesce(duration_seconds, p_duration_seconds, greatest(60, least(43200, extract(epoch from (now() - started_at))::integer))), updated_at = now() where id = p_workout_id returning duration_seconds into v_duration_seconds;
  return jsonb_build_object('recommendations', v_recommendations, 'workout_id', p_workout_id, 'status', 'completed', 'duration_seconds', v_duration_seconds);
end; $$;

create or replace function public.revise_completed_workout_logs(p_workout_id uuid, p_logs jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_log jsonb; v_recommendations jsonb; v_logs jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.plan_workouts where id = p_workout_id and user_id = auth.uid() and status = 'completed') then raise exception 'Completed training workout was not found' using errcode = 'P0001'; end if;
  if jsonb_typeof(p_logs) <> 'array' then raise exception 'Completed set is invalid' using errcode = 'P0001'; end if;
  for v_log in select value from jsonb_array_elements(p_logs) loop
    update public.log_set_logs sl set actual_weight = (v_log ->> 'actual_weight')::numeric, actual_reps = (v_log ->> 'actual_reps')::integer, rpe = (v_log ->> 'rpe')::numeric, completed = coalesce((v_log ->> 'completed')::boolean, false), updated_at = now()
    from public.plan_workout_exercises we where sl.workout_exercise_id = we.id and we.workout_id = p_workout_id and sl.workout_exercise_id = (v_log ->> 'workout_exercise_id')::uuid and sl.set_index = (v_log ->> 'set_index')::integer;
    if not found then raise exception 'Completed set is invalid' using errcode = 'P0001'; end if;
  end loop;
  v_recommendations := public.replace_pending_workout_recommendations(auth.uid(), p_workout_id);
  select coalesce(jsonb_agg(jsonb_build_object('workout_exercise_id', sl.workout_exercise_id, 'set_index', sl.set_index, 'actual_weight', sl.actual_weight, 'actual_reps', sl.actual_reps, 'rpe', sl.rpe, 'completed', sl.completed)), '[]'::jsonb) into v_logs from public.log_set_logs sl join public.plan_workout_exercises we on we.id = sl.workout_exercise_id where we.workout_id = p_workout_id;
  return jsonb_build_object('workout_id', p_workout_id, 'recommendations', v_recommendations, 'set_logs', v_logs);
end; $$;

revoke all on function public.complete_training_workout(uuid, integer, uuid) from public, anon;
revoke all on function public.revise_completed_workout_logs(uuid, jsonb) from public, anon;
grant execute on function public.complete_training_workout(uuid, integer, uuid) to authenticated;
grant execute on function public.revise_completed_workout_logs(uuid, jsonb) to authenticated;
