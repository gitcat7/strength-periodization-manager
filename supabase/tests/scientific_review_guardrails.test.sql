begin;

select plan(16);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000008101', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'science-review@example.test', 'not-used', '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.cfg_exercises (id, slug, name, category, default_increment, is_main_lift, training_direction)
values
  ('00000000-0000-0000-0000-000000008201', 'science_push_main', 'Science Push Main', 'push', 2.5, true, 'push'),
  ('00000000-0000-0000-0000-000000008202', 'science_push_accessory', 'Science Push Accessory', 'push', 2.5, false, 'push'),
  ('00000000-0000-0000-0000-000000008203', 'science_squat_main', 'Science Squat Main', 'squat', 2.5, true, 'squat');

insert into public.plan_programs (id, user_id, name, template_type, status, start_date, end_date)
values ('00000000-0000-0000-0000-000000008301', '00000000-0000-0000-0000-000000008101', 'Science plan', 'push_pull_squat', 'active', '2026-08-01', '2026-08-31');

insert into public.plan_workouts (id, program_id, user_id, scheduled_date, sequence_index, schedule_index, day_type, name, status)
values ('00000000-0000-0000-0000-000000008401', '00000000-0000-0000-0000-000000008301', '00000000-0000-0000-0000-000000008101', '2026-08-11', 1, 1, 'training', '推 A', 'scheduled');

insert into public.plan_workout_exercises (id, workout_id, exercise_id, order_index, target_sets, target_reps, target_weight)
values ('00000000-0000-0000-0000-000000008501', '00000000-0000-0000-0000-000000008401', '00000000-0000-0000-0000-000000008201', 1, 3, 5, 80);

select has_function('public', 'complete_training_workout', array['uuid', 'integer', 'jsonb'], 'atomic workout completion RPC exists');
select has_function('public', 'revise_completed_workout_logs', array['uuid', 'jsonb'], 'history recomputation RPC exists');
select has_function('public', 'preview_workout_prescription_revision', array['uuid', 'integer', 'jsonb'], 'prescription preview RPC exists');
select has_function('public', 'revise_workout_prescription', array['uuid', 'integer', 'jsonb', 'boolean'], 'guarded prescription save RPC exists');
select is(has_function_privilege('anon', 'public.complete_training_workout(uuid,integer,jsonb)', 'execute'), false, 'anonymous callers cannot complete workouts');
select is(has_function_privilege('authenticated', 'public.complete_training_workout(uuid,integer,jsonb)', 'execute'), true, 'authenticated callers can complete workouts');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000008101', true);
set local role authenticated;

select lives_ok(
  $$select public.preview_workout_prescription_revision('00000000-0000-0000-0000-000000008401', 1, '{"exercises":[{"exercise_id":"00000000-0000-0000-0000-000000008201","order_index":1,"target_sets":3,"target_reps":5,"target_weight":80}]}'::jsonb)$$,
  'valid local same-direction prescription can be previewed'
);
select throws_ok(
  $$select public.preview_workout_prescription_revision('00000000-0000-0000-0000-000000008401', 1, '{"exercises":[{"exercise_id":"00000000-0000-0000-0000-000000008201","order_index":1,"target_sets":3,"target_reps":5,"target_weight":80},{"exercise_id":"00000000-0000-0000-0000-000000008201","order_index":2,"target_sets":3,"target_reps":5,"target_weight":80}]}'::jsonb)$$,
  'P0001', 'Workout prescription has duplicate exercises', 'duplicate actions are blocked'
);
select throws_ok(
  $$select public.preview_workout_prescription_revision('00000000-0000-0000-0000-000000008401', 1, '{"exercises":[{"exercise_id":"00000000-0000-0000-0000-000000008203","order_index":1,"target_sets":3,"target_reps":5,"target_weight":80}]}'::jsonb)$$,
  'P0001', 'Workout exercise direction is incompatible', 'direction conflicts are blocked structurally'
);
select lives_ok(
  $$select public.revise_workout_prescription('00000000-0000-0000-0000-000000008401', 1, '{"exercises":[{"exercise_id":"00000000-0000-0000-0000-000000008201","order_index":1,"target_sets":3,"target_reps":5,"target_weight":82.5}]}'::jsonb, true)$$,
  'confirmed revision saves atomically'
);
select is((select prescription_revision from public.plan_workouts where id='00000000-0000-0000-0000-000000008401'), 2, 'revision increments after a guarded save');
select is((select count(*) from public.log_workout_prescription_revisions where workout_id='00000000-0000-0000-0000-000000008401'), 1::bigint, 'prescription audit is retained');

reset role;
insert into public.log_set_logs (workout_exercise_id, set_index, target_weight, target_reps, actual_weight, actual_reps, rpe, completed)
select id, 4, 82.5, 5, null, null, null, false from public.plan_workout_exercises where workout_id='00000000-0000-0000-0000-000000008401';
set local role authenticated;
select lives_ok(
  format(
    'select public.complete_training_workout(%L::uuid, 900, %L::jsonb)',
    '00000000-0000-0000-0000-000000008401',
    jsonb_build_array(
      jsonb_build_object('workout_exercise_id', (select id from public.plan_workout_exercises where workout_id='00000000-0000-0000-0000-000000008401'), 'set_index', 1, 'actual_weight', 82.5, 'actual_reps', 5, 'rpe', 7, 'completed', true),
      jsonb_build_object('workout_exercise_id', (select id from public.plan_workout_exercises where workout_id='00000000-0000-0000-0000-000000008401'), 'set_index', 2, 'actual_weight', 82.5, 'actual_reps', 5, 'rpe', 7, 'completed', true),
      jsonb_build_object('workout_exercise_id', (select id from public.plan_workout_exercises where workout_id='00000000-0000-0000-0000-000000008401'), 'set_index', 3, 'actual_weight', 82.5, 'actual_reps', 5, 'rpe', 7, 'completed', true)
    )::text
  ),
  'completion generates the server-side review'
);
select is((select duration_seconds from public.plan_workouts where id='00000000-0000-0000-0000-000000008401'), 900, 'completion stores duration atomically');
select is((select count(*) from public.log_recommendations where workout_id='00000000-0000-0000-0000-000000008401' and status='pending'), 1::bigint, 'one pending recommendation is generated per source exercise');

reset role;
select is((select count(*) from public.log_set_logs where workout_exercise_id=(select id from public.plan_workout_exercises where workout_id='00000000-0000-0000-0000-000000008401')), 3::bigint, 'completion removes persisted sets omitted from the submitted payload');

select * from finish();
rollback;
