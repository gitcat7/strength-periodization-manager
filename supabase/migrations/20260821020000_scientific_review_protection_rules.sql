begin;

-- Optional, self-reported inputs. Null means no conclusion is inferred.
alter table public.usr_athlete_profiles
  add column if not exists recovery_status text,
  add column if not exists nutrition_adherence text,
  add column if not exists bodyweight_change_percent numeric;

alter table public.usr_athlete_profiles
  drop constraint if exists athlete_profiles_recovery_status_check;
alter table public.usr_athlete_profiles
  add constraint athlete_profiles_recovery_status_check check (recovery_status is null or recovery_status in ('normal', 'poor'));
alter table public.usr_athlete_profiles
  drop constraint if exists athlete_profiles_nutrition_adherence_check;
alter table public.usr_athlete_profiles
  add constraint athlete_profiles_nutrition_adherence_check check (nutrition_adherence is null or nutrition_adherence in ('adequate', 'poor'));
alter table public.usr_athlete_profiles
  drop constraint if exists athlete_profiles_bodyweight_change_percent_check;
alter table public.usr_athlete_profiles
  add constraint athlete_profiles_bodyweight_change_percent_check check (bodyweight_change_percent is null or bodyweight_change_percent between -30 and 30);

create or replace function public.refresh_scientific_recommendations(p_workout_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workout public.plan_workouts%rowtype;
  v_profile public.usr_athlete_profiles%rowtype;
  v_exercise record;
  v_completed integer;
  v_total integer;
  v_max_rpe numeric;
  v_valid_completed_sets boolean;
  v_below_target boolean;
  v_last_completed date;
  v_days integer;
  v_profile_caution boolean;
  v_type text;
  v_weight numeric;
  v_sets integer;
  v_reason_code text;
  v_reason text;
  v_advice text;
  v_existing uuid;
  v_metrics jsonb;
  v_rows jsonb := '[]'::jsonb;
begin
  select * into v_workout from public.plan_workouts where id = p_workout_id for update;
  if not found then raise exception 'Workout not found' using errcode = 'P0001'; end if;
  if v_workout.status <> 'completed' then raise exception 'Workout must be completed' using errcode = 'P0001'; end if;

  select * into v_profile from public.usr_athlete_profiles where user_id = v_workout.user_id;
  select max(scheduled_date) into v_last_completed
  from public.plan_workouts
  where user_id = v_workout.user_id and status = 'completed' and day_type = 'training' and id <> v_workout.id;
  v_days := case when v_last_completed is null then null else greatest(0, v_workout.scheduled_date - v_last_completed) end;
  v_profile_caution := coalesce(v_profile.recovery_status = 'poor', false)
    or coalesce(v_profile.nutrition_adherence = 'poor', false)
    or coalesce(abs(v_profile.bodyweight_change_percent) >= 3, false);

  for v_exercise in
    select we.id as workout_exercise_id, we.exercise_id, we.target_weight, we.target_sets, ce.default_increment, ce.is_main_lift
    from public.plan_workout_exercises we join public.cfg_exercises ce on ce.id = we.exercise_id
    where we.workout_id = p_workout_id
    order by we.order_index
  loop
    select
      count(*) filter (where completed),
      count(*),
      max(rpe) filter (where completed),
      coalesce(bool_and(actual_weight > 0 and actual_reps > 0 and rpe between 1 and 10) filter (where completed), false),
      coalesce(bool_or(actual_weight < target_weight or actual_reps < target_reps) filter (where completed), false)
      into v_completed, v_total, v_max_rpe, v_valid_completed_sets, v_below_target
    from public.log_set_logs
    where workout_exercise_id = v_exercise.workout_exercise_id;

    v_type := 'hold'; v_weight := v_exercise.target_weight; v_sets := v_exercise.target_sets;
    v_reason_code := 'insufficient_data'; v_reason := '数据不足，保持当前处方并继续记录。'; v_advice := 'none';
    if v_exercise.target_weight <= 0 or v_completed = 0 or not v_valid_completed_sets then
      null;
    elsif v_completed < v_exercise.target_sets or v_total < v_exercise.target_sets then
      v_reason_code := 'incomplete_sets'; v_reason := '完成组数未达到计划，保持当前处方，先补齐动作质量。';
    elsif v_below_target then
      v_reason_code := 'below_target_performance'; v_reason := '实际重量或次数未达到目标，保持当前处方并优先完成质量。';
    elsif v_profile_caution then
      v_type := 'deload'; v_weight := greatest(0, round(v_exercise.target_weight * 0.9 / greatest(v_exercise.default_increment, 0.5)) * greatest(v_exercise.default_increment, 0.5));
      v_sets := greatest(1, v_exercise.target_sets - 1); v_reason_code := case when v_profile.recovery_status = 'poor' then 'recovery_caution' else 'profile_caution' end; v_reason := case when v_profile.recovery_status = 'poor' then '恢复状态偏差，建议下次减量恢复，不进行加重。' else '饮食执行或体重变化提示恢复风险，建议下次减量恢复，不进行加重。' end; v_advice := 'recovery';
    elsif v_days is not null and v_days <= 1 then
      v_reason_code := 'short_recovery_gap'; v_reason := '与上次训练间隔不足 2 个日历日，建议保持处方并延后推进。'; v_advice := 'delay';
    elsif v_days is not null and v_days > 14 then
      v_type := 'deload'; v_weight := greatest(0, round(v_exercise.target_weight * 0.9 / greatest(v_exercise.default_increment, 0.5)) * greatest(v_exercise.default_increment, 0.5));
      v_sets := greatest(1, v_exercise.target_sets - 1); v_reason_code := 'long_interruption'; v_reason := '训练间隔较长，建议减量恢复后再推进。'; v_advice := 'recovery';
    elsif v_max_rpe >= 9 then
      v_type := 'decrease'; v_weight := greatest(0, round(v_exercise.target_weight * 0.95 / greatest(v_exercise.default_increment, 0.5)) * greatest(v_exercise.default_increment, 0.5));
      v_reason_code := 'high_rpe'; v_reason := 'RPE 偏高，下次先小幅降重，优先恢复与动作质量。'; v_advice := 'recovery';
    elsif v_exercise.is_main_lift and v_max_rpe <= 8 then
      v_type := 'increase'; v_weight := v_exercise.target_weight + greatest(v_exercise.default_increment, 0.5);
      v_reason_code := 'progression_ready'; v_reason := '主项全部完成、实际表现达到目标且 RPE 合适，下次可按器械增量小幅加重。';
    elsif not v_exercise.is_main_lift then
      v_reason_code := 'accessory_observe'; v_reason := '辅助动作完成良好，先保持重量并继续观察完成质量。';
    end if;

    v_metrics := jsonb_build_object(
      'completed_sets', v_completed,
      'total_sets', v_total,
      'max_rpe', v_max_rpe,
      'days_since_previous_training', v_days,
      'actual_performance', jsonb_build_object('valid_completed_sets', v_valid_completed_sets, 'below_target', v_below_target),
      'profile_protection', jsonb_build_object('recovery_status', v_profile.recovery_status, 'nutrition_adherence', v_profile.nutrition_adherence, 'bodyweight_change_percent', v_profile.bodyweight_change_percent, 'caution', v_profile_caution)
    );

    select id into v_existing from public.log_recommendations
      where workout_id = p_workout_id and exercise_id = v_exercise.exercise_id and status = 'pending' for update;
    if v_existing is null then
      insert into public.log_recommendations (user_id, exercise_id, workout_id, recommendation_type, previous_weight, suggested_weight, suggested_sets, reason, reason_code, advice, source_revision, source_metrics, status)
      values (v_workout.user_id, v_exercise.exercise_id, p_workout_id, v_type, v_exercise.target_weight, v_weight, v_sets, v_reason, v_reason_code, v_advice, v_workout.coach_revision, v_metrics, 'pending')
      returning id into v_existing;
    else
      update public.log_recommendations set recommendation_type = v_type, previous_weight = v_exercise.target_weight, suggested_weight = v_weight, suggested_sets = v_sets, reason = v_reason, reason_code = v_reason_code, advice = v_advice, source_revision = v_workout.coach_revision, source_metrics = v_metrics, updated_at = now()
      where id = v_existing;
    end if;
    v_rows := v_rows || jsonb_build_array(jsonb_build_object('id', v_existing, 'exercise_id', v_exercise.exercise_id, 'type', v_type, 'suggested_weight', v_weight, 'suggested_sets', v_sets, 'reason', v_reason, 'reason_code', v_reason_code, 'advice', v_advice));
  end loop;
  return v_rows;
end;
$$;

create or replace function public.preview_workout_prescription_revision(
  p_workout_id uuid,
  p_expected_revision integer,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid(); v_workout public.plan_workouts%rowtype; v_program public.plan_programs%rowtype; v_profile public.usr_athlete_profiles%rowtype;
  v_item jsonb; v_exercise_id uuid; v_direction text; v_candidate_direction text; v_seen uuid[] := '{}';
  v_count integer; v_index integer := 0; v_sets integer; v_reps integer; v_weight numeric; v_is_main boolean;
  v_old_main integer; v_new_main integer := 0; v_week_sets integer; v_day_sets integer := 0; v_max_reps integer := 0; v_warnings jsonb := '[]'::jsonb;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode='P0001'; end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or jsonb_typeof(p_payload->'exercises') <> 'array' then raise exception 'Workout prescription payload is invalid' using errcode='P0001'; end if;
  select * into v_workout from public.plan_workouts where id=p_workout_id and user_id=v_user_id for update;
  if not found then raise exception 'Workout not found' using errcode='P0001'; end if;
  select * into v_program from public.plan_programs where id=v_workout.program_id and user_id=v_user_id and status='active';
  if not found or v_workout.day_type <> 'training' or v_workout.status not in ('scheduled','draft') then raise exception 'Workout prescription can only be edited while pending' using errcode='P0001'; end if;
  if exists (select 1 from public.log_set_logs sl join public.plan_workout_exercises we on we.id=sl.workout_exercise_id where we.workout_id=p_workout_id and sl.completed) then raise exception 'Completed sets cannot be structurally edited' using errcode='P0001'; end if;
  if v_workout.prescription_revision <> p_expected_revision then raise exception 'Workout prescription revision is stale' using errcode='P0001'; end if;
  select * into v_profile from public.usr_athlete_profiles where user_id=v_user_id;
  select count(*) into v_count from jsonb_array_elements(p_payload->'exercises');
  if v_count not between 1 and 12 then raise exception 'Workout prescription must contain 1 to 12 exercises' using errcode='P0001'; end if;
  select min(ce.training_direction),max(ce.training_direction),count(*) filter(where ce.is_main_lift) into v_direction,v_candidate_direction,v_old_main from public.plan_workout_exercises we join public.cfg_exercises ce on ce.id=we.exercise_id where we.workout_id=p_workout_id;
  if v_direction is null or v_direction is distinct from v_candidate_direction then raise exception 'Workout requires one structured training direction' using errcode='P0001'; end if;
  for v_item in select value from jsonb_array_elements(p_payload->'exercises') loop
    v_index := v_index+1;
    begin v_exercise_id := (v_item->>'exercise_id')::uuid; v_sets := (v_item->>'target_sets')::integer; v_reps := (v_item->>'target_reps')::integer; v_weight := (v_item->>'target_weight')::numeric; exception when others then raise exception 'Workout prescription values are invalid' using errcode='P0001'; end;
    if v_exercise_id is null or v_exercise_id=any(v_seen) then raise exception 'Workout prescription has duplicate exercises' using errcode='P0001'; end if;
    if coalesce((v_item->>'order_index')::integer,0) <> v_index or v_sets not between 1 and 20 or v_reps not between 1 and 1000 or v_weight < 0 or v_weight > 10000 or v_weight::text in ('NaN','Infinity','-Infinity') then raise exception 'Workout prescription values are invalid' using errcode='P0001'; end if;
    select training_direction, is_main_lift into v_candidate_direction, v_is_main from public.cfg_exercises where id=v_exercise_id;
    if not found or v_candidate_direction is null then raise exception 'Exercise requires structured training direction' using errcode='P0001'; end if;
    if v_candidate_direction is distinct from v_direction then raise exception 'Workout exercise direction is incompatible' using errcode='P0001'; end if;
    if v_is_main then v_new_main := v_new_main+1; end if;
    v_day_sets := v_day_sets + v_sets; v_max_reps := greatest(v_max_reps, v_reps); v_seen := array_append(v_seen,v_exercise_id);
  end loop;
  select count(*) filter(where ce.is_main_lift) into v_old_main from public.plan_workout_exercises we join public.cfg_exercises ce on ce.id=we.exercise_id where we.workout_id=p_workout_id;
  if v_old_main > 0 and v_new_main = 0 then raise exception 'Main lift must be replaced before deletion' using errcode='P0001'; end if;
  select coalesce(sum(we.target_sets),0) - coalesce((select sum(target_sets) from public.plan_workout_exercises where workout_id=p_workout_id),0) + v_day_sets into v_week_sets from public.plan_workout_exercises we join public.plan_workouts w on w.id=we.workout_id where w.program_id=v_program.id and w.status in ('scheduled','draft') and date_trunc('week',w.scheduled_date)=date_trunc('week',v_workout.scheduled_date);
  if v_week_sets < 4 or v_week_sets > 30 then v_warnings := v_warnings || jsonb_build_array(jsonb_build_object('code','weekly_volume','message','本周有效组数明显偏低或偏高，请确认恢复与训练经验。')); end if;
  if v_new_main > 1 then v_warnings := v_warnings || jsonb_build_array(jsonb_build_object('code','multiple_main_lifts','message','同日重主项较多，请确认恢复安排。')); end if;
  if exists(select 1 from public.plan_workouts w where w.program_id=v_program.id and w.status in ('scheduled','draft') and w.id<>p_workout_id and abs(w.scheduled_date - v_workout.scheduled_date) <= 1) then v_warnings := v_warnings || jsonb_build_array(jsonb_build_object('code','recovery_gap','message','同日或相邻日仍有训练，恢复间隔可能不足 48 小时，请二次确认。')); end if;
  if (v_profile.experience_level = 'beginner' and v_day_sets > 12) or (v_profile.goal = 'strength' and v_max_reps >= 13) then v_warnings := v_warnings || jsonb_build_array(jsonb_build_object('code','goal_experience_mismatch','message','当前处方与已填写的训练目标或经验不完全匹配（新手单日超过 12 组，或力量目标单组达到 13 次以上），请二次确认。')); end if;
  return jsonb_build_object('workout_id',p_workout_id,'prescription_revision',v_workout.prescription_revision,'direction',v_direction,'warnings',v_warnings,'requires_confirmation',jsonb_array_length(v_warnings)>0);
end;
$$;

revoke all on function public.refresh_scientific_recommendations(uuid) from public, anon, authenticated;

commit;
