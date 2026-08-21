begin;

alter table public.plan_workouts
  add column if not exists prescription_revision integer not null default 1,
  add column if not exists coach_revision integer not null default 0,
  add column if not exists started_at timestamptz,
  add column if not exists duration_seconds integer;

alter table public.plan_workouts
  drop constraint if exists plan_workouts_prescription_revision_check;
alter table public.plan_workouts
  add constraint plan_workouts_prescription_revision_check check (prescription_revision >= 1);
alter table public.plan_workouts
  drop constraint if exists plan_workouts_coach_revision_check;
alter table public.plan_workouts
  add constraint plan_workouts_coach_revision_check check (coach_revision >= 0);
alter table public.plan_workouts
  drop constraint if exists plan_workouts_duration_seconds_check;
alter table public.plan_workouts
  add constraint plan_workouts_duration_seconds_check check (duration_seconds is null or duration_seconds >= 0);

alter table public.log_recommendations
  add column if not exists source_revision integer not null default 0,
  add column if not exists reason_code text not null default 'legacy',
  add column if not exists suggested_sets integer,
  add column if not exists advice text not null default 'none' check (advice in ('none', 'recovery', 'delay')),
  add column if not exists source_metrics jsonb not null default '{}'::jsonb;

create unique index if not exists log_recommendations_pending_source_idx
  on public.log_recommendations (workout_id, exercise_id)
  where status = 'pending';

create table if not exists public.log_workout_prescription_revisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  program_id uuid not null references public.plan_programs(id) on delete cascade,
  workout_id uuid not null references public.plan_workouts(id) on delete cascade,
  previous_revision integer not null check (previous_revision >= 1),
  new_revision integer not null check (new_revision = previous_revision + 1),
  before_prescription jsonb not null,
  after_prescription jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.log_workout_prescription_revisions enable row level security;
drop policy if exists "Users read own prescription revisions" on public.log_workout_prescription_revisions;
create policy "Users read own prescription revisions" on public.log_workout_prescription_revisions
  for select to authenticated using (auth.uid() = user_id);
revoke all on table public.log_workout_prescription_revisions from public, anon, authenticated;
grant select on table public.log_workout_prescription_revisions to authenticated;

create or replace function public.refresh_scientific_recommendations(p_workout_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workout public.plan_workouts%rowtype;
  v_exercise record;
  v_completed integer;
  v_total integer;
  v_max_rpe numeric;
  v_last_completed date;
  v_days integer;
  v_type text;
  v_weight numeric;
  v_sets integer;
  v_reason_code text;
  v_reason text;
  v_advice text;
  v_existing uuid;
  v_rows jsonb := '[]'::jsonb;
begin
  select * into v_workout from public.plan_workouts where id = p_workout_id for update;
  if not found then raise exception 'Workout not found' using errcode = 'P0001'; end if;
  if v_workout.status <> 'completed' then raise exception 'Workout must be completed' using errcode = 'P0001'; end if;

  select max(scheduled_date) into v_last_completed
  from public.plan_workouts
  where user_id = v_workout.user_id and status = 'completed' and day_type = 'training' and id <> v_workout.id;
  v_days := case when v_last_completed is null then null else greatest(0, v_workout.scheduled_date - v_last_completed) end;

  for v_exercise in
    select we.id as workout_exercise_id, we.exercise_id, we.target_weight, we.target_sets, ce.default_increment, ce.is_main_lift
    from public.plan_workout_exercises we join public.cfg_exercises ce on ce.id = we.exercise_id
    where we.workout_id = p_workout_id
    order by we.order_index
  loop
    select count(*) filter (where completed), count(*), max(rpe) filter (where completed)
      into v_completed, v_total, v_max_rpe
    from public.log_set_logs where workout_exercise_id = v_exercise.workout_exercise_id;
    v_type := 'hold'; v_weight := v_exercise.target_weight; v_sets := v_exercise.target_sets;
    v_reason_code := 'insufficient_data'; v_reason := '数据不足，保持当前处方并继续记录。'; v_advice := 'none';
    if v_exercise.target_weight <= 0 or v_completed = 0 or v_max_rpe is null then
      null;
    elsif v_completed < v_exercise.target_sets or v_total < v_exercise.target_sets then
      v_reason_code := 'incomplete_sets'; v_reason := '完成组数未达到计划，保持当前处方，先补齐动作质量。';
    elsif v_days is not null and v_days > 14 then
      v_type := 'deload'; v_weight := greatest(0, round(v_exercise.target_weight * 0.9 / greatest(v_exercise.default_increment, 0.5)) * greatest(v_exercise.default_increment, 0.5));
      v_sets := greatest(1, v_exercise.target_sets - 1); v_reason_code := 'long_interruption'; v_reason := '训练间隔较长，建议减量恢复后再推进。'; v_advice := 'recovery';
    elsif v_max_rpe >= 9 then
      v_type := 'decrease'; v_weight := greatest(0, round(v_exercise.target_weight * 0.95 / greatest(v_exercise.default_increment, 0.5)) * greatest(v_exercise.default_increment, 0.5));
      v_reason_code := 'high_rpe'; v_reason := 'RPE 偏高，下次先小幅降重，优先恢复与动作质量。'; v_advice := 'recovery';
    elsif v_exercise.is_main_lift and v_max_rpe <= 8 then
      v_type := 'increase'; v_weight := v_exercise.target_weight + greatest(v_exercise.default_increment, 0.5);
      v_reason_code := 'progression_ready'; v_reason := '主项全部完成且 RPE 合适，下次可按器械增量小幅加重。';
    elsif not v_exercise.is_main_lift then
      v_reason_code := 'accessory_observe'; v_reason := '辅助动作完成良好，先保持重量并继续观察完成质量。';
    end if;

    select id into v_existing from public.log_recommendations
      where workout_id = p_workout_id and exercise_id = v_exercise.exercise_id and status = 'pending' for update;
    if v_existing is null then
      insert into public.log_recommendations (user_id, exercise_id, workout_id, recommendation_type, previous_weight, suggested_weight, suggested_sets, reason, reason_code, advice, source_revision, source_metrics, status)
      values (v_workout.user_id, v_exercise.exercise_id, p_workout_id, v_type, v_exercise.target_weight, v_weight, v_sets, v_reason, v_reason_code, v_advice, v_workout.coach_revision, jsonb_build_object('completed_sets', v_completed, 'total_sets', v_total, 'max_rpe', v_max_rpe, 'days_since_previous_training', v_days), 'pending')
      returning id into v_existing;
    else
      update public.log_recommendations set recommendation_type = v_type, previous_weight = v_exercise.target_weight, suggested_weight = v_weight, suggested_sets = v_sets, reason = v_reason, reason_code = v_reason_code, advice = v_advice, source_revision = v_workout.coach_revision, source_metrics = jsonb_build_object('completed_sets', v_completed, 'total_sets', v_total, 'max_rpe', v_max_rpe, 'days_since_previous_training', v_days), updated_at = now()
      where id = v_existing;
    end if;
    v_rows := v_rows || jsonb_build_array(jsonb_build_object('id', v_existing, 'exercise_id', v_exercise.exercise_id, 'type', v_type, 'suggested_weight', v_weight, 'suggested_sets', v_sets, 'reason', v_reason, 'reason_code', v_reason_code, 'advice', v_advice));
  end loop;
  return v_rows;
end;
$$;

create or replace function public.complete_training_workout(p_workout_id uuid, p_duration_seconds integer, p_logs jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid(); v_workout public.plan_workouts%rowtype; v_item jsonb; v_exercise_id uuid; v_set_index integer; v_weight numeric; v_reps integer; v_rpe numeric; v_completed boolean; v_recommendations jsonb;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = 'P0001'; end if;
  select * into v_workout from public.plan_workouts where id = p_workout_id and user_id = v_user_id for update;
  if not found or v_workout.day_type <> 'training' then raise exception 'Workout not found' using errcode = 'P0001'; end if;
  if v_workout.status = 'completed' then return jsonb_build_object('workout_id', p_workout_id, 'status', 'completed', 'recommendations', (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from public.log_recommendations r where r.workout_id = p_workout_id and r.status = 'pending')); end if;
  if v_workout.status not in ('scheduled', 'draft') or p_duration_seconds is null or p_duration_seconds < 0 or jsonb_typeof(p_logs) <> 'array' then raise exception 'Workout completion payload is invalid' using errcode = 'P0001'; end if;
  for v_item in select value from jsonb_array_elements(p_logs) loop
    begin v_exercise_id := (v_item ->> 'workout_exercise_id')::uuid; v_set_index := (v_item ->> 'set_index')::integer; v_weight := nullif(v_item ->> 'actual_weight','')::numeric; v_reps := nullif(v_item ->> 'actual_reps','')::integer; v_rpe := nullif(v_item ->> 'rpe','')::numeric; v_completed := coalesce((v_item ->> 'completed')::boolean,false); exception when others then raise exception 'Workout set payload is invalid' using errcode = 'P0001'; end;
    if not exists (select 1 from public.plan_workout_exercises where id = v_exercise_id and workout_id = p_workout_id) then raise exception 'Workout set does not belong to workout' using errcode = 'P0001'; end if;
    if v_set_index < 1 or (v_completed and (v_weight is null or v_weight <= 0 or v_reps is null or v_reps <= 0 or v_rpe is null or v_rpe < 1 or v_rpe > 10)) then raise exception 'Completed workout set is invalid' using errcode = 'P0001'; end if;
    insert into public.log_set_logs (workout_exercise_id,set_index,target_weight,target_reps,actual_weight,actual_reps,rpe,completed)
      select v_exercise_id,v_set_index,target_weight,target_reps,v_weight,v_reps,v_rpe,v_completed from public.plan_workout_exercises where id=v_exercise_id
      on conflict (workout_exercise_id,set_index) do update set actual_weight=excluded.actual_weight,actual_reps=excluded.actual_reps,rpe=excluded.rpe,completed=excluded.completed,updated_at=now();
  end loop;
   update public.plan_workouts set status='completed',completed_at=coalesce(completed_at,now()),duration_seconds=p_duration_seconds,coach_revision=coach_revision+1,updated_at=now() where id=p_workout_id returning * into v_workout;
  v_recommendations := public.refresh_scientific_recommendations(p_workout_id);
  return jsonb_build_object('workout_id',p_workout_id,'status','completed','duration_seconds',p_duration_seconds,'recommendations',v_recommendations);
end;
$$;

create or replace function public.revise_completed_workout_logs(p_workout_id uuid, p_logs jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user_id uuid := auth.uid(); v_workout public.plan_workouts%rowtype; v_result jsonb; v_item jsonb; v_exercise_id uuid; v_set_index integer; v_weight numeric; v_reps integer; v_rpe numeric; v_completed boolean;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode='P0001'; end if;
  select * into v_workout from public.plan_workouts where id=p_workout_id and user_id=v_user_id for update;
  if not found or v_workout.status <> 'completed' then raise exception 'Completed workout not found' using errcode='P0001'; end if;
  if jsonb_typeof(p_logs) <> 'array' then raise exception 'Workout set payload is invalid' using errcode='P0001'; end if;
  for v_item in select value from jsonb_array_elements(p_logs) loop
    begin v_exercise_id := (v_item ->> 'workout_exercise_id')::uuid; v_set_index := (v_item ->> 'set_index')::integer; v_weight := nullif(v_item ->> 'actual_weight','')::numeric; v_reps := nullif(v_item ->> 'actual_reps','')::integer; v_rpe := nullif(v_item ->> 'rpe','')::numeric; v_completed := coalesce((v_item ->> 'completed')::boolean,false); exception when others then raise exception 'Workout set payload is invalid' using errcode='P0001'; end;
    if not exists (select 1 from public.plan_workout_exercises where id=v_exercise_id and workout_id=p_workout_id) then raise exception 'Workout set does not belong to workout' using errcode='P0001'; end if;
    if v_set_index < 1 or (v_completed and (v_weight is null or v_weight <= 0 or v_reps is null or v_reps <= 0 or v_rpe is null or v_rpe < 1 or v_rpe > 10)) then raise exception 'Completed workout set is invalid' using errcode='P0001'; end if;
    insert into public.log_set_logs (workout_exercise_id,set_index,target_weight,target_reps,actual_weight,actual_reps,rpe,completed)
      select v_exercise_id,v_set_index,target_weight,target_reps,v_weight,v_reps,v_rpe,v_completed from public.plan_workout_exercises where id=v_exercise_id
      on conflict (workout_exercise_id,set_index) do update set actual_weight=excluded.actual_weight,actual_reps=excluded.actual_reps,rpe=excluded.rpe,completed=excluded.completed,updated_at=now();
  end loop;
  update public.plan_workouts set coach_revision=coach_revision+1,updated_at=now() where id=p_workout_id;
  delete from public.log_recommendations where workout_id=p_workout_id and status='pending';
  v_result := public.refresh_scientific_recommendations(p_workout_id);
  return jsonb_build_object('workout_id',p_workout_id,'status','completed','recommendations',v_result);
end;
$$;

create or replace function public.preview_recommendation_application(p_recommendation_id uuid, p_weight numeric default null, p_sets integer default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user_id uuid := auth.uid(); v_rec public.log_recommendations%rowtype; v_weight numeric; v_sets integer;
begin
  select * into v_rec from public.log_recommendations where id=p_recommendation_id and user_id=v_user_id and status='pending';
  if not found then raise exception 'Pending recommendation not found' using errcode='P0001'; end if;
  v_weight := coalesce(p_weight,v_rec.suggested_weight); v_sets := coalesce(p_sets,v_rec.suggested_sets);
  if v_weight < 0 or v_sets is null or v_sets < 1 then raise exception 'Recommendation values are invalid' using errcode='P0001'; end if;
  return jsonb_build_object('recommendation_id',v_rec.id,'weight',v_weight,'sets',v_sets,'workouts',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'scheduled_date',w.scheduled_date,'name',w.name) order by w.sequence_index) from public.plan_workouts w join public.plan_programs p on p.id=w.program_id where p.user_id=v_user_id and p.status='active' and w.status in ('scheduled','draft') and w.sequence_index > coalesce((select sequence_index from public.plan_workouts where id=v_rec.workout_id),-1) and exists (select 1 from public.plan_workout_exercises we where we.workout_id=w.id and we.exercise_id=v_rec.exercise_id)),'[]'::jsonb));
end;
$$;

create or replace function public.apply_recommendation(p_recommendation_id uuid, p_weight numeric default null, p_sets integer default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user_id uuid := auth.uid(); v_rec public.log_recommendations%rowtype; v_preview jsonb; v_weight numeric; v_sets integer; v_ids uuid[];
begin
  select * into v_rec from public.log_recommendations where id=p_recommendation_id and user_id=v_user_id and status='pending' for update;
  if not found then raise exception 'Pending recommendation not found' using errcode='P0001'; end if;
  v_preview := public.preview_recommendation_application(p_recommendation_id,p_weight,p_sets); v_weight := (v_preview->>'weight')::numeric; v_sets := (v_preview->>'sets')::integer;
  select coalesce(array_agg((item->>'id')::uuid),'{}') into v_ids from jsonb_array_elements(v_preview->'workouts') item;
   if cardinality(v_ids) > 0 then
     insert into public.log_workout_prescription_revisions (user_id,program_id,workout_id,previous_revision,new_revision,before_prescription,after_prescription)
     select v_user_id,w.program_id,w.id,w.prescription_revision,w.prescription_revision + 1,
       coalesce((select jsonb_agg(jsonb_build_object('exercise_id',we.exercise_id,'order_index',we.order_index,'target_sets',we.target_sets,'target_reps',we.target_reps,'target_weight',we.target_weight) order by we.order_index) from public.plan_workout_exercises we where we.workout_id=w.id),'[]'::jsonb),
       coalesce((select jsonb_agg(jsonb_build_object('exercise_id',we.exercise_id,'order_index',we.order_index,'target_sets',case when we.exercise_id=v_rec.exercise_id then v_sets else we.target_sets end,'target_reps',we.target_reps,'target_weight',case when we.exercise_id=v_rec.exercise_id then v_weight else we.target_weight end) order by we.order_index) from public.plan_workout_exercises we where we.workout_id=w.id),'[]'::jsonb)
     from public.plan_workouts w where w.id=any(v_ids);
     update public.plan_workout_exercises set target_weight=v_weight,target_sets=v_sets,updated_at=now() where exercise_id=v_rec.exercise_id and workout_id=any(v_ids);
     update public.plan_workouts set prescription_revision=prescription_revision+1,updated_at=now() where id=any(v_ids);
   end if;
  update public.log_recommendations set status=case when v_weight=v_rec.suggested_weight and v_sets is not distinct from v_rec.suggested_sets then 'accepted' else 'modified' end,suggested_weight=v_weight,suggested_sets=v_sets,updated_at=now() where id=v_rec.id;
  return v_preview || jsonb_build_object('status','applied');
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
  v_user_id uuid := auth.uid(); v_workout public.plan_workouts%rowtype; v_program public.plan_programs%rowtype;
  v_item jsonb; v_exercise_id uuid; v_direction text; v_candidate_direction text; v_seen uuid[] := '{}';
  v_count integer; v_index integer := 0; v_sets integer; v_reps integer; v_weight numeric; v_is_main boolean;
  v_old_main integer; v_new_main integer := 0; v_week_sets integer; v_warnings jsonb := '[]'::jsonb;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode='P0001'; end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or jsonb_typeof(p_payload->'exercises') <> 'array' then raise exception 'Workout prescription payload is invalid' using errcode='P0001'; end if;
  select * into v_workout from public.plan_workouts where id=p_workout_id and user_id=v_user_id for update;
  if not found then raise exception 'Workout not found' using errcode='P0001'; end if;
  select * into v_program from public.plan_programs where id=v_workout.program_id and user_id=v_user_id and status='active';
  if not found or v_workout.day_type <> 'training' or v_workout.status not in ('scheduled','draft') then raise exception 'Workout prescription can only be edited while pending' using errcode='P0001'; end if;
  if exists (select 1 from public.log_set_logs sl join public.plan_workout_exercises we on we.id=sl.workout_exercise_id where we.workout_id=p_workout_id and sl.completed) then raise exception 'Completed sets cannot be structurally edited' using errcode='P0001'; end if;
  if v_workout.prescription_revision <> p_expected_revision then raise exception 'Workout prescription revision is stale' using errcode='P0001'; end if;
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
    v_seen := array_append(v_seen,v_exercise_id);
  end loop;
  select count(*) filter(where ce.is_main_lift) into v_old_main from public.plan_workout_exercises we join public.cfg_exercises ce on ce.id=we.exercise_id where we.workout_id=p_workout_id;
  if v_old_main > 0 and v_new_main = 0 then raise exception 'Main lift must be replaced before deletion' using errcode='P0001'; end if;
  select coalesce(sum(we.target_sets),0) - coalesce((select sum(target_sets) from public.plan_workout_exercises where workout_id=p_workout_id),0) + coalesce((select sum((item->>'target_sets')::integer) from jsonb_array_elements(p_payload->'exercises') item),0) into v_week_sets from public.plan_workout_exercises we join public.plan_workouts w on w.id=we.workout_id where w.program_id=v_program.id and w.status in ('scheduled','draft') and date_trunc('week',w.scheduled_date)=date_trunc('week',v_workout.scheduled_date);
  if v_week_sets < 4 or v_week_sets > 30 then v_warnings := v_warnings || jsonb_build_array(jsonb_build_object('code','weekly_volume','message','本周有效组数明显偏低或偏高，请确认恢复与训练经验。')); end if;
  if v_new_main > 1 then v_warnings := v_warnings || jsonb_build_array(jsonb_build_object('code','multiple_main_lifts','message','同日重主项较多，请确认恢复安排。')); end if;
  if exists(select 1 from public.plan_workouts w where w.program_id=v_program.id and w.status in ('scheduled','draft') and w.id<>p_workout_id and abs(w.scheduled_date-v_workout.scheduled_date)<1) then v_warnings := v_warnings || jsonb_build_array(jsonb_build_object('code','recovery_gap','message','相邻训练日恢复间隔受影响，请二次确认。')); end if;
  return jsonb_build_object('workout_id',p_workout_id,'prescription_revision',v_workout.prescription_revision,'direction',v_direction,'warnings',v_warnings,'requires_confirmation',jsonb_array_length(v_warnings)>0);
end;
$$;

create or replace function public.revise_workout_prescription(
  p_workout_id uuid,
  p_expected_revision integer,
  p_payload jsonb,
  p_confirm_warnings boolean default false
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user_id uuid := auth.uid(); v_preview jsonb; v_workout public.plan_workouts%rowtype; v_before jsonb; v_after jsonb; v_revision integer;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode='P0001'; end if;
  v_preview := public.preview_workout_prescription_revision(p_workout_id,p_expected_revision,p_payload);
  if (v_preview->>'requires_confirmation')::boolean and not p_confirm_warnings then raise exception 'Workout prescription warnings require confirmation' using errcode='P0001'; end if;
  select * into v_workout from public.plan_workouts where id=p_workout_id and user_id=v_user_id for update;
  select coalesce(jsonb_agg(jsonb_build_object('exercise_id',exercise_id,'order_index',order_index,'target_sets',target_sets,'target_reps',target_reps,'target_weight',target_weight) order by order_index),'[]'::jsonb) into v_before from public.plan_workout_exercises where workout_id=p_workout_id;
  delete from public.plan_workout_exercises where workout_id=p_workout_id;
  insert into public.plan_workout_exercises(workout_id,exercise_id,order_index,target_sets,target_reps,target_weight) select p_workout_id,(item->>'exercise_id')::uuid,(item->>'order_index')::integer,(item->>'target_sets')::integer,(item->>'target_reps')::integer,(item->>'target_weight')::numeric from jsonb_array_elements(p_payload->'exercises') item;
  update public.plan_workouts set prescription_revision=prescription_revision+1,updated_at=now() where id=p_workout_id returning prescription_revision into v_revision;
  select coalesce(jsonb_agg(jsonb_build_object('exercise_id',exercise_id,'order_index',order_index,'target_sets',target_sets,'target_reps',target_reps,'target_weight',target_weight) order by order_index),'[]'::jsonb) into v_after from public.plan_workout_exercises where workout_id=p_workout_id;
  insert into public.log_workout_prescription_revisions(user_id,program_id,workout_id,previous_revision,new_revision,before_prescription,after_prescription) values(v_user_id,v_workout.program_id,p_workout_id,v_revision-1,v_revision,v_before,v_after);
  return v_preview || jsonb_build_object('prescription_revision',v_revision,'exercises',v_after);
end;
$$;

revoke all on function public.refresh_scientific_recommendations(uuid) from public, anon, authenticated;
revoke all on function public.complete_training_workout(uuid,integer,jsonb) from public, anon;
revoke all on function public.revise_completed_workout_logs(uuid,jsonb) from public, anon;
revoke all on function public.preview_recommendation_application(uuid,numeric,integer) from public, anon;
revoke all on function public.apply_recommendation(uuid,numeric,integer) from public, anon;
revoke all on function public.preview_workout_prescription_revision(uuid,integer,jsonb) from public, anon;
revoke all on function public.revise_workout_prescription(uuid,integer,jsonb,boolean) from public, anon;
grant execute on function public.complete_training_workout(uuid,integer,jsonb), public.revise_completed_workout_logs(uuid,jsonb), public.preview_recommendation_application(uuid,numeric,integer), public.apply_recommendation(uuid,numeric,integer), public.preview_workout_prescription_revision(uuid,integer,jsonb), public.revise_workout_prescription(uuid,integer,jsonb,boolean) to authenticated;

commit;
