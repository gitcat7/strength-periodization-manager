alter table public.exercises
  add column if not exists catalog_external_id text,
  add column if not exists training_direction text,
  add column if not exists movement_pattern text,
  add column if not exists substitution_enabled boolean not null default false;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'exercises_catalog_external_id_key'
      and conrelid = 'public.exercises'::regclass
  ) then
    alter table public.exercises
      add constraint exercises_catalog_external_id_key unique (catalog_external_id);
  end if;
end;
$$;

alter table public.workout_exercises
  add column if not exists updated_at timestamptz not null default now();

update public.exercises as e
set
  category = reviewed.training_direction,
  catalog_external_id = reviewed.catalog_external_id,
  training_direction = reviewed.training_direction,
  movement_pattern = reviewed.movement_pattern,
  substitution_enabled = reviewed.substitution_enabled
from (
  values
    ('bench_press', '0025', 'push', 'horizontal_press', false),
    ('overhead_press', '0091', 'push', 'vertical_press', true),
    ('incline_dumbbell_press', '0314', 'push', 'horizontal_press', true),
    ('lateral_raise', '0334', 'push', 'shoulder_abduction', true),
    ('triceps_pushdown', '0201', 'push', 'elbow_extension', true),
    ('barbell_row', '0027', 'pull', 'horizontal_pull', false),
    ('lat_pulldown', '2330', 'pull', 'vertical_pull', true),
    ('seated_cable_row', '0861', 'pull', 'horizontal_pull', true),
    ('face_pull', '0233', 'pull', 'rear_delt', true),
    ('dumbbell_curl', '0294', 'pull', 'elbow_flexion', true),
    ('back_squat', '0043', 'squat', 'knee_dominant', false),
    ('romanian_deadlift', '0085', 'squat', 'hip_hinge', true),
    ('leg_press', '0739', 'squat', 'knee_dominant', true),
    ('leg_curl', '0599', 'squat', 'knee_flexion', true),
    ('standing_calf_raise', '0605', 'squat', 'calf_raise', true),
    ('pull_up', '0652', 'pull', 'vertical_pull', true),
    ('deadlift', '0032', 'pull', 'hip_hinge', false),
    ('cardio_zone2', null, 'cardio', 'aerobic_base', false)
) as reviewed(slug, catalog_external_id, training_direction, movement_pattern, substitution_enabled)
where e.slug = reviewed.slug;

insert into public.exercises (
  slug,
  name,
  category,
  default_increment,
  is_main_lift,
  catalog_external_id,
  training_direction,
  movement_pattern,
  substitution_enabled
)
values
  ('machine_chest_press', '器械推胸', 'push', 2.50, false, '0577', 'push', 'horizontal_press', true),
  ('machine_shoulder_press', '器械肩推', 'push', 2.50, false, '0603', 'push', 'vertical_press', true),
  ('cable_lateral_raise', '绳索侧平举', 'push', 1.00, false, '0178', 'push', 'shoulder_abduction', true),
  ('rope_triceps_pushdown', '绳索把手下压', 'push', 2.50, false, '0200', 'push', 'elbow_extension', true),
  ('machine_seated_row', '器械坐姿划船', 'pull', 2.50, false, '1350', 'pull', 'horizontal_pull', true),
  ('neutral_grip_lat_pulldown', '对握高位下拉', 'pull', 2.50, false, '0818', 'pull', 'vertical_pull', true),
  ('cable_reverse_fly', '绳索反向飞鸟', 'pull', 1.00, false, '0225', 'pull', 'rear_delt', true),
  ('cable_biceps_curl', '绳索弯举', 'pull', 1.00, false, '0868', 'pull', 'elbow_flexion', true),
  ('machine_hack_squat', '哈克深蹲', 'squat', 2.50, false, '0743', 'squat', 'knee_dominant', true),
  ('dumbbell_romanian_deadlift', '哑铃罗马尼亚硬拉', 'squat', 2.50, false, '1459', 'squat', 'hip_hinge', true),
  ('lying_leg_curl', '俯卧腿弯举', 'squat', 1.00, false, '0586', 'squat', 'knee_flexion', true),
  ('cable_standing_calf_raise', '绳索站姿提踵', 'squat', 2.50, false, '1375', 'squat', 'calf_raise', true)
on conflict (slug) do update set
  name = excluded.name,
  category = excluded.category,
  default_increment = excluded.default_increment,
  is_main_lift = excluded.is_main_lift,
  catalog_external_id = excluded.catalog_external_id,
  training_direction = excluded.training_direction,
  movement_pattern = excluded.movement_pattern,
  substitution_enabled = excluded.substitution_enabled;

do $$
begin
  create type public.workout_exercise_substitution_scope as enum (
    'current_workout',
    'remaining_program'
  );
exception
  when duplicate_object then null;
end;
$$;

create or replace function public.substitute_workout_exercise(
  p_workout_exercise_id uuid,
  p_target_exercise_id uuid,
  p_scope workout_exercise_substitution_scope
)
returns table (affected_ids uuid[], affected_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_source record;
  v_target record;
  v_affected_ids uuid[];
  v_affected_count integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = 'P0001';
  end if;

  select
    we.id,
    we.exercise_id,
    we.order_index,
    w.id as workout_id,
    w.program_id,
    w.scheduled_date,
    e.training_direction,
    e.movement_pattern
  into v_source
  from public.workout_exercises as we
  join public.workouts as w on w.id = we.workout_id
  join public.programs as p on p.id = w.program_id
  join public.exercises as e on e.id = we.exercise_id
  where we.id = p_workout_exercise_id
    and p.user_id = v_user_id
    and p.status = 'active'
    and w.status in ('scheduled', 'draft')
    and we.order_index >= 3
    and e.catalog_external_id is not null
    and e.training_direction is not null
    and e.movement_pattern is not null
    and e.substitution_enabled
  for update of we, w;

  if not found then
    raise exception 'Source exercise is not eligible for substitution' using errcode = 'P0001';
  end if;

  select e.id, e.training_direction, e.movement_pattern
  into v_target
  from public.exercises as e
  where e.id = p_target_exercise_id
    and e.catalog_external_id is not null
    and e.training_direction is not null
    and e.movement_pattern is not null
    and e.substitution_enabled
  for update;

  if not found then
    raise exception 'Target exercise is not eligible for substitution' using errcode = 'P0001';
  end if;

  if v_target.id = v_source.exercise_id then
    raise exception 'Target exercise must differ from the source exercise' using errcode = 'P0001';
  end if;

  if v_target.training_direction is distinct from v_source.training_direction then
    raise exception 'Target exercise has an incompatible training direction' using errcode = 'P0001';
  end if;

  if v_target.movement_pattern is distinct from v_source.movement_pattern then
    raise exception 'Target exercise has an incompatible movement pattern' using errcode = 'P0001';
  end if;

  select array_agg(affected.id order by affected.id)
  into v_affected_ids
  from (
    select we.id
    from public.workout_exercises as we
    join public.workouts as w on w.id = we.workout_id
    join public.exercises as e on e.id = we.exercise_id
    where w.program_id = v_source.program_id
      and we.exercise_id = v_source.exercise_id
      and e.training_direction = v_source.training_direction
      and e.movement_pattern = v_source.movement_pattern
      and we.order_index = v_source.order_index
      and w.status in ('scheduled', 'draft')
      and (
        (p_scope = 'current_workout' and we.id = v_source.id)
        or (
          p_scope = 'remaining_program'
          and w.scheduled_date >= v_source.scheduled_date
        )
      )
    for update of we, w
  ) as affected;

  if v_affected_ids is null then
    raise exception 'No eligible workout exercises were found' using errcode = 'P0001';
  end if;

  perform 1
  from public.set_logs as sl
  where sl.workout_exercise_id = any(v_affected_ids)
  for update;

  if exists (
    select 1
    from public.set_logs as sl
    where sl.workout_exercise_id = any(v_affected_ids)
      and sl.completed
  ) then
    raise exception 'Completed sets cannot be substituted' using errcode = 'P0001';
  end if;

  delete from public.set_logs as sl
  where sl.workout_exercise_id = any(v_affected_ids)
    and not sl.completed;

  update public.workout_exercises
  set
    exercise_id = v_target.id,
    target_weight = 0,
    updated_at = now()
  where id = any(v_affected_ids);

  v_affected_count := cardinality(v_affected_ids);
  return query select v_affected_ids, v_affected_count;
end;
$$;

revoke execute on function public.substitute_workout_exercise(
  uuid,
  uuid,
  workout_exercise_substitution_scope
) from public, anon;
grant execute on function public.substitute_workout_exercise(
  uuid,
  uuid,
  workout_exercise_substitution_scope
) to authenticated;
