begin;

alter table public.plan_workouts
  add column if not exists prescription_revision integer not null default 1;

alter table public.plan_workouts
  drop constraint if exists plan_workouts_prescription_revision_check;
alter table public.plan_workouts
  add constraint plan_workouts_prescription_revision_check
  check (prescription_revision >= 1);

create table if not exists public.ops_workout_revision_events (
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

create index if not exists ops_workout_revision_events_workout_created_idx
  on public.ops_workout_revision_events (workout_id, created_at desc);
create index if not exists ops_workout_revision_events_user_created_idx
  on public.ops_workout_revision_events (user_id, created_at desc);

alter table public.ops_workout_revision_events enable row level security;
revoke all on table public.ops_workout_revision_events from public, anon, authenticated;

create or replace function public.revise_workout_prescription(
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
  v_user_id uuid := auth.uid();
  v_workout public.plan_workouts%rowtype;
  v_program public.plan_programs%rowtype;
  v_item jsonb;
  v_exercise_id uuid;
  v_seen_ids uuid[] := '{}';
  v_direction text;
  v_item_direction text;
  v_order integer;
  v_sets integer;
  v_reps integer;
  v_weight numeric;
  v_count integer;
  v_new_revision integer;
  v_before jsonb;
  v_after jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = 'P0001';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object'
     or jsonb_typeof(p_payload -> 'exercises') <> 'array' then
    raise exception 'Workout prescription payload is invalid' using errcode = 'P0001';
  end if;

  select w.* into v_workout
  from public.plan_workouts w
  where w.id = p_workout_id and w.user_id = v_user_id
  for update;
  if not found then
    raise exception 'Workout not found' using errcode = 'P0001';
  end if;

  select p.* into v_program
  from public.plan_programs p
  where p.id = v_workout.program_id
    and p.user_id = v_user_id
    and p.status = 'active'
  for update;
  if not found then
    raise exception 'Workout not found' using errcode = 'P0001';
  end if;

  if v_workout.day_type <> 'training' or v_workout.status not in ('scheduled', 'draft') then
    raise exception 'Workout prescription can only be edited while pending' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.log_set_logs sl
    join public.plan_workout_exercises we on we.id = sl.workout_exercise_id
    where we.workout_id = p_workout_id and sl.completed
  ) then
    raise exception 'Completed sets cannot be structurally edited' using errcode = 'P0001';
  end if;

  if v_workout.prescription_revision <> p_expected_revision then
    raise exception 'Workout prescription revision is stale' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.plan_workout_exercises we
    where we.workout_id = p_workout_id
      and (we.exercise_id is null or we.exercise_provider is not null
        or we.external_exercise_id is not null or we.exercise_name_snapshot is not null
        or we.exercise_metadata_snapshot is not null)
  ) then
    raise exception 'Only local cfg_exercises can be used' using errcode = 'P0001';
  end if;

  select count(*) into v_count from jsonb_array_elements(p_payload -> 'exercises');
  if v_count < 1 or v_count > 12 then
    raise exception 'Workout prescription must contain 1 to 12 exercises' using errcode = 'P0001';
  end if;

  select min(ce.training_direction), max(ce.training_direction)
    into v_direction, v_item_direction
  from public.plan_workout_exercises we
  join public.cfg_exercises ce on ce.id = we.exercise_id
  where we.workout_id = p_workout_id;
  if v_direction is null then
    v_direction := case
      when v_workout.name like '%推%' or lower(v_workout.name) like '%push%' then 'push'
      when v_workout.name like '%拉%' or lower(v_workout.name) like '%pull%' then 'pull'
      when v_workout.name like '%蹲%' or lower(v_workout.name) like '%squat%' then 'squat'
      else null
    end;
  elsif v_item_direction is distinct from v_direction then
    raise exception 'Workout exercise direction is incompatible' using errcode = 'P0001';
  end if;
  if v_direction is null then
    raise exception 'Workout exercise direction is incompatible' using errcode = 'P0001';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'exercise_id', we.exercise_id,
    'order_index', we.order_index,
    'target_sets', we.target_sets,
    'target_reps', we.target_reps,
    'target_weight', we.target_weight
  ) order by we.order_index), '[]'::jsonb)
    into v_before
  from public.plan_workout_exercises we
  where we.workout_id = p_workout_id;

  for v_item in select value from jsonb_array_elements(p_payload -> 'exercises') loop
    if jsonb_typeof(v_item) <> 'object'
       or (v_item ? 'exercise_provider') or (v_item ? 'external_exercise_id')
       or (v_item ? 'exercise_name_snapshot') or (v_item ? 'exercise_metadata_snapshot') then
      raise exception 'Only local cfg_exercises can be used' using errcode = 'P0001';
    end if;
    begin
      v_exercise_id := (v_item ->> 'exercise_id')::uuid;
      v_order := (v_item ->> 'order_index')::integer;
      v_sets := (v_item ->> 'target_sets')::integer;
      v_reps := (v_item ->> 'target_reps')::integer;
      v_weight := (v_item ->> 'target_weight')::numeric;
    exception when others then
      raise exception 'Workout prescription values are invalid' using errcode = 'P0001';
    end;
    if v_order is null or v_order <> (coalesce(array_length(v_seen_ids, 1), 0) + 1)
       or v_order < 1 or v_order > v_count then
      raise exception 'Workout prescription order indexes must be contiguous' using errcode = 'P0001';
    end if;
    if v_exercise_id = any(v_seen_ids) then
      raise exception 'Workout prescription has duplicate exercises' using errcode = 'P0001';
    end if;
    v_seen_ids := array_append(v_seen_ids, v_exercise_id);
    if v_sets is null or v_reps is null or v_weight is null
       or v_sets < 1 or v_sets > 20 or v_reps < 1 or v_reps > 1000
       or v_weight < 0 or v_weight > 10000 or v_weight::text in ('NaN', 'Infinity', '-Infinity') then
      raise exception 'Workout prescription values are invalid' using errcode = 'P0001';
    end if;
    select ce.training_direction into v_item_direction
    from public.cfg_exercises ce where ce.id = v_exercise_id;
    if not found then
      raise exception 'Only local cfg_exercises can be used' using errcode = 'P0001';
    end if;
    if v_item_direction is distinct from v_direction then
      raise exception 'Workout exercise direction is incompatible' using errcode = 'P0001';
    end if;
  end loop;

  delete from public.plan_workout_exercises where workout_id = p_workout_id;
  insert into public.plan_workout_exercises (workout_id, exercise_id, order_index, target_sets, target_reps, target_weight)
  select p_workout_id,
    (item ->> 'exercise_id')::uuid,
    (item ->> 'order_index')::integer,
    (item ->> 'target_sets')::integer,
    (item ->> 'target_reps')::integer,
    (item ->> 'target_weight')::numeric
  from jsonb_array_elements(p_payload -> 'exercises') item;

  update public.plan_workouts
  set prescription_revision = prescription_revision + 1, updated_at = now()
  where id = p_workout_id
  returning prescription_revision into v_new_revision;

  select coalesce(jsonb_agg(jsonb_build_object(
    'exercise_id', we.exercise_id,
    'order_index', we.order_index,
    'target_sets', we.target_sets,
    'target_reps', we.target_reps,
    'target_weight', we.target_weight
  ) order by we.order_index), '[]'::jsonb)
    into v_after
  from public.plan_workout_exercises we
  where we.workout_id = p_workout_id;

  insert into public.ops_workout_revision_events
    (user_id, program_id, workout_id, previous_revision, new_revision, before_prescription, after_prescription)
  values (v_user_id, v_workout.program_id, p_workout_id, v_new_revision - 1, v_new_revision, v_before, v_after);

  return jsonb_build_object(
    'workout_id', p_workout_id,
    'prescription_revision', v_new_revision,
    'exercises', v_after
  );
end;
$$;

revoke all on function public.revise_workout_prescription(uuid, integer, jsonb) from public, anon;
grant execute on function public.revise_workout_prescription(uuid, integer, jsonb) to authenticated;

commit;
